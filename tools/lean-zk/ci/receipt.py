"""Pinned RISC Zero 3.0.6 transport/schema adapter, no cryptographic implementation.
Verification is performed by the original r0vm VerifyRequest API.
"""
import socket, struct, subprocess, signal
MAX_RECEIPT = 8 * 1024 * 1024

def require(value, message):
    if not value:
        raise RuntimeError(message)

def stop(child):
    if child is None:
        return
    if child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=2)
        except subprocess.TimeoutExpired:
            child.kill()
    child.wait(timeout=2)

def varint(n):
    out = bytearray()
    while n >= 128:
        out.append((n & 127) | 128)
        n >>= 7
    out.append(n)
    return bytes(out)


def pb_bytes(field, body):
    return varint(field * 8 + 2) + varint(len(body)) + body


def pb_number(field, value):
    return varint(field * 8) + varint(value)


def pb_fields(data):
    pos, result = 0, {}

    def number():
        nonlocal pos
        value = 0
        for shift in range(0, 70, 7):
            require(pos < len(data), 'Truncated protobuf')
            byte = data[pos]
            pos += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value
        raise RuntimeError('Oversized protobuf varint')

    while pos < len(data):
        key = number()
        field, wire = key >> 3, key & 7
        require(field > 0 and field not in result, 'Unexpected repeated protobuf field')
        if wire == 0:
            result[field] = number()
        else:
            require(wire == 2, 'Unsupported protobuf wire type')
            length = number()
            require(pos + length <= len(data), 'Truncated protobuf value')
            result[field] = data[pos:pos + length]
            pos += length
    return result


def recv_frame(connection):
    def exact(length):
        data = bytearray()
        while len(data) < length:
            part = connection.recv(length - len(data))
            require(part, 'Verifier closed its connection')
            data.extend(part)
        return bytes(data)
    length = struct.unpack('<I', exact(4))[0]
    require(length <= MAX_RECEIPT, 'Oversized verifier response')
    return exact(length)


def send_frame(connection, data):
    connection.sendall(struct.pack('<I', len(data)) + data)


class ReceiptReader:
    """Fail closed schema reader for bincode1 Receipt/SuccinctReceipt in 3.0.6.

    This only locates type and journal; it does not implement verification.
    Reference: zkvm/src/{receipt.rs,receipt/succinct.rs,claim/receipt.rs}.
    """
    def __init__(self, data):
        self.data, self.pos = data, 0

    def take(self, n):
        require(0 <= n <= len(self.data) - self.pos, 'Truncated bincode Receipt')
        data = self.data[self.pos:self.pos + n]
        self.pos += n
        return data

    def uint(self, size=4):
        return int.from_bytes(self.take(size), 'little')

    def vector(self, width=1):
        return self.take(self.uint(8) * width)

    def maybe(self, read_value):
        kind = self.uint()
        require(kind in (0, 1), 'Unknown MaybePruned variant')
        return read_value() if kind == 0 else self.take(32)

    def assumptions(self):
        count = self.uint(8)
        require(count <= 64, 'Unexpected assumption count in smoke receipt')
        for _ in range(count):
            self.maybe(lambda: self.take(64))

    def output(self):
        present = self.uint(1)
        require(present in (0, 1), 'Invalid bincode Option')
        if present:
            self.maybe(self.vector)
            self.maybe(self.assumptions)

    def input(self):
        require(self.uint(1) == 0, 'Input is uninhabited in pinned SDK')

    def claim(self):
        self.maybe(lambda: self.take(36))  # SystemState {pc:u32, digest:[u32;8]}
        self.maybe(lambda: self.take(36))
        require(self.uint() == 0 and self.uint() == 0, 'Expected Halted(0) claim')
        self.maybe(self.input)
        self.maybe(self.output)

    def groth16(self):
        require(self.uint() == 2, 'Only real InnerReceipt::Groth16 is accepted')
        seal = self.vector()
        require(len(seal) == 256, 'Expected original 256-byte Groth16 seal')
        self.maybe(self.claim)
        parameters = self.take(32)
        journal = self.vector()
        self.take(32)  # ReceiptMetadata is not trusted for security decisions.
        require(self.pos == len(self.data), 'Trailing bincode Receipt data')
        return seal, parameters, journal


def verify_original(receipt, trial, env, r0vm, image):
    """One original VerifyRequest; no proving method is sent on this connection."""
    child = None
    with socket.socket() as listener, (trial / 'verifier.log').open('wb') as log:
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        listener.settimeout(5)
        try:
            child = subprocess.Popen([str(r0vm), '--port', str(listener.getsockname()[1])],
                                     env=env, stdout=log, stderr=subprocess.STDOUT)
            connection, _ = listener.accept()
            with connection:
                connection.settimeout(10)
                version = pb_number(1, 3) + pb_number(3, 6)
                send_frame(connection, pb_bytes(1, version))  # HelloRequest
                hello = pb_fields(recv_frame(connection))
                require(set(hello) == {1}, f'Verifier hello failed: {hello!r}')
                reply_version = pb_fields(pb_fields(hello[1])[1])
                require((reply_version.get(1, 0), reply_version.get(2, 0),
                         reply_version.get(3, 0)) == (3, 0, 6), 'Unexpected verifier version')
                asset = pb_bytes(1, receipt)  # Asset.inline: bincode Receipt
                words = struct.unpack('<8I', bytes.fromhex(image))
                digest = pb_bytes(1, b''.join(varint(word) for word in words))
                verify = pb_bytes(1, asset) + pb_bytes(2, digest)
                send_frame(connection, pb_bytes(9, verify))  # ServerRequest.verify
                reply = pb_fields(recv_frame(connection))
                require(reply == {1: b''}, f'Original receipt.verify rejected: {reply!r}')
            require(child.wait(timeout=3) == 0, 'Verifier process did not exit successfully')
        finally:
            stop(child)


