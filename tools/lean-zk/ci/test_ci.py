#!/usr/bin/env python3
"""Small offline tests only: never starts r0vm, Docker, Lean or a prover."""
import struct
import unittest

from run import CASES, inputs, abi_certificate
from receipt import ReceiptReader, pb_bytes, pb_fields, pb_number


class BundleTests(unittest.TestCase):
    def test_all_pinned_inputs_and_bindings(self):
        for profile in ['perf05', 'v3']:
            for case in CASES:
                with self.subTest(profile=profile, case=case):
                    _, metadata, goal_hash, outcome, wire, journal = inputs(profile, case)
                    goal_length, actual_outcome, length = struct.unpack('<III', wire[:12])
                    self.assertEqual(actual_outcome, outcome)
                    self.assertEqual(len(wire), 12 + 4 * length)
                    self.assertLessEqual(goal_length, length)
                    words = struct.unpack('<' + 'I' * length, wire[12:])
                    self.assertTrue(all(word <= 255 for word in words))
                    self.assertEqual(len(journal), 128)
                    self.assertEqual(journal[32:64].hex(), goal_hash)
                    self.assertEqual(journal[64:96].hex(), metadata['profileId'][2:])
                    self.assertEqual(int.from_bytes(journal[96:], 'big'), outcome)

    def test_protobuf_framing(self):
        message = pb_bytes(2, b'abc') + pb_number(6, 17)
        self.assertEqual(pb_fields(message), {2: b'abc', 6: 17})
        with self.assertRaises(RuntimeError):
            pb_fields(message + pb_number(6, 18))

    def test_certificate_dynamic_offsets(self):
        seal, journal = bytes(260), bytes(128)
        encoded = abi_certificate(seal, journal)
        self.assertEqual(len(encoded), 544)
        self.assertEqual(int.from_bytes(encoded[:32], 'big'), 64)
        self.assertEqual(int.from_bytes(encoded[32:64], 'big'), 384)
        self.assertEqual(int.from_bytes(encoded[64:96], 'big'), 260)
        self.assertEqual(int.from_bytes(encoded[384:416], 'big'), 128)

    def test_receipt_schema_rejects_fake_trailing_truncation(self):
        vector = lambda data: struct.pack('<Q', len(data)) + data
        # Synthetic shape only; no cryptographic validity is asserted by this parser test.
        sample = struct.pack('<I', 2) + vector(bytes(256))
        sample += struct.pack('<I', 1) + bytes(32)  # Pruned claim digest.
        sample += bytes(32) + vector(bytes(128)) + bytes(32)
        seal, _, journal = ReceiptReader(sample).groth16()
        self.assertEqual(len(seal), 256)
        self.assertEqual(len(journal), 128)
        for bad in [struct.pack('<I', 3) + sample[4:], sample + b'!', sample[:-1]]:
            with self.assertRaises(RuntimeError):
                ReceiptReader(bad).groth16()


if __name__ == '__main__':
    unittest.main()
