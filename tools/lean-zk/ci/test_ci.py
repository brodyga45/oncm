#!/usr/bin/env python3
"""Small offline tests only: never starts r0vm, Docker, Lean or a prover."""
import struct
import unittest
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
import subprocess

from run import CASES, inputs, abi_certificate
from receipt import ReceiptReader, pb_bytes, pb_fields, pb_number
from resource_group import check_kernel_limits, Observer, slice_name, cleanup_command


class BundleTests(unittest.TestCase):
    def test_shared_cgroup_limits_fail_closed(self):
        self.assertEqual(slice_name('oncm-ci-123-1-perf05-true-registration'),
                         'oncmci1231perf05trueregistration.slice')
        with self.assertRaises(RuntimeError):
            slice_name('../../system.slice')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name, value in [('memory.max', str(13 * 1024 ** 3)), ('memory.swap.max', '0'),
                                ('cpu.max', '200000 100000'), ('memory.peak', '0'), ('memory.events', 'oom 0')]:
                (root / name).write_text(value)
            check_kernel_limits(root)
            (root / 'memory.max').write_text('max')
            with self.assertRaises(RuntimeError):
                check_kernel_limits(root)

    def test_observer_preserves_parent_oom_after_child_disappears(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            group, artifacts = root / 'oncmci123.slice', root / 'out'
            group.mkdir(); artifacts.mkdir()
            (group / 'memory.current').write_text('20')
            (group / 'memory.peak').write_text('120')
            (group / 'memory.events').write_text('oom 0\noom_kill 0')
            child = group / 'worker.scope';child.mkdir()
            (child / 'memory.current').write_text('90')
            observer = Observer(group, artifacts, proc_cgroup='0::/user.slice\n')
            (child / 'memory.current').unlink();child.rmdir()
            (group / 'memory.events').write_text('oom 1\noom_kill 1')
            observer.sample()
            report = json.loads((artifacts / 'cgroup-summary.json').read_text())
            self.assertEqual(report['kernelParentPeakBytes'], 120)
            self.assertEqual(report['parentMemoryEvents']['oom_kill'], 1)
            self.assertEqual(report['lastSeen']['worker.scope']['memory.current'], 90)
            with self.assertRaises(RuntimeError):
                Observer(group, artifacts, proc_cgroup='0::/oncmci123.slice/worker.scope\n')

    def test_cleanup_timeout_does_not_abort_later_cleanup(self):
        errors = []
        with patch('resource_group.subprocess.run', side_effect=[subprocess.TimeoutExpired(['first'], 15),
                    subprocess.CompletedProcess(['second'], 1, stderr='denied')]) as run:
            cleanup_command(['first'], errors)
            cleanup_command(['second'], errors)
            self.assertEqual(run.call_count, 2)
            self.assertEqual(len(errors), 2)
            self.assertEqual(errors[1]['returnCode'], 1)
            self.assertEqual(errors[1]['stderr'], 'denied')

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
