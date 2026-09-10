#!/usr/bin/env python3
"""Tiny offline request/publication tests: never starts a prover or network call."""
import base64
import copy
import json
from pathlib import Path
import struct
import tempfile
import unittest

from request import HERE, MAX_REQUEST, validate_request, sha, strict_json, goal_boundary, git_context
from request_result import terminal, validate_terminal, validate_proof
from publish_request import publish
from receipt import ReceiptReader
from run import abi_certificate


def descriptor(data):
    return {'base64': base64.b64encode(data).decode(), 'bytes': len(data), 'sha256': sha(data)}


def make_request(profile='perf05', side='true', outcome=1, arithmetic=False):
    root = HERE / 'profiles' / profile
    metadata = json.loads((root / 'profile.json').read_text())
    if arithmetic:
        data = HERE / 'testdata/ix-tn-add-zero-perf05'
        goal, full = (data / 'goal.ndjson').read_bytes(), (data / 'proof.ndjson').read_bytes()
        source = (data / 'OncmInput.lean').read_text()
    else:
        goal = (root / 'fixtures' / (side + '-goal.ndjson')).read_bytes()
        full = (root / 'fixtures' / (side + '-proof.ndjson')).read_bytes()
        source = (root / 'fixtures' / ('OncmTrue.lean' if side == 'true' else 'OncmFalse.lean')).read_text()
    return {'format': 'oncm-proof-request-v1', 'requestNonce': 'f1f5df03-7d56-47b4-b2bf-024123456789',
            'profile': profile, 'profileId': metadata['profileId'], 'imageId': metadata['imageId'],
            'goalHash': '0x' + sha(goal), 'outcome': outcome,
            'source': {'text': source, 'sha256': sha(source.encode())},
            'goal': descriptor(goal), 'export': descriptor(goal if outcome == 0 else full)}


def encoded(body):
    return json.dumps(body, separators=(',', ':')).encode()


class Requests(unittest.TestCase):
    def test_existing_profiles_and_all_outcomes(self):
        for profile in ('perf05', 'v3'):
            for side, outcome in (('true', 0), ('true', 1), ('false', 0), ('false', 2)):
                with self.subTest(profile=profile, side=side, outcome=outcome):
                    result = validate_request(encoded(make_request(profile, side, outcome)))
                    goal_len, kind, size = struct.unpack('<III', result['wire'][:12])
                    self.assertEqual(kind, outcome)
                    self.assertEqual(goal_len, len(result['goal']))
                    self.assertEqual(len(result['wire']), 12 + size * 4)
                    self.assertEqual(result['journal'][32:64].hex(), result['body']['goalHash'][2:])
                    self.assertEqual(result['journal'][127], outcome)

    def test_actual_imported_arithmetic_is_not_fixture_whitelisted(self):
        request = validate_request(encoded(make_request(arithmetic=True)))
        self.assertEqual(request['body']['goalHash'],
                         '0x84188c093e8d3058be7042339eebc5e03cac02af07538275ff26f49e70b3291f')
        self.assertEqual(len(request['export']), 9872)
        self.assertNotIn(request['body']['goalHash'],
                         [f['goalHash'] for f in request['profile']['fixtures'].values()])

    def test_exact_schema_duplicate_keys_numbers_and_nonce(self):
        original = make_request()
        invalid = []
        for key, value in [('command', 'untrusted'), ('outcome', True), ('outcome', 3),
                           ('requestNonce', '../path'), ('profile', '../../v3'), ('imageId', '0x' + '0'*64)]:
            changed = copy.deepcopy(original);changed[key] = value;invalid.append(encoded(changed))
        invalid += [encoded(original)[:-1] + b',"outcome":1}', b'{"a":NaN}', b' '*(MAX_REQUEST+1)]
        for raw in invalid:
            with self.assertRaises(RuntimeError):
                validate_request(raw)

    def test_tampered_source_export_and_noncanonical_base64(self):
        for mutate in [lambda q: q['source'].update(text='changed'),
                       lambda q: q['export'].update(bytes=True),
                       lambda q: q['export'].update(sha256='0'*64),
                       lambda q: q['goal'].update(base64=q['goal']['base64']+'\n'),
                       lambda q: q.update(goalHash='0x'+'0'*64),
                       lambda q: q.update(outcome=0)]:
            value = make_request();mutate(value)
            with self.assertRaises(RuntimeError):validate_request(encoded(value))

    def test_foundation_and_goal_boundary(self):
        value = make_request();goal = base64.b64decode(value['goal']['base64'])
        full = base64.b64decode(value['export']['base64'])
        changed = goal.replace(b'False', b'Flase', 1)
        value['goal'], value['export'], value['goalHash'] = descriptor(changed), descriptor(changed+full[len(goal):]), '0x'+sha(changed)
        with self.assertRaisesRegex(RuntimeError, 'foundation'):validate_request(encoded(value))
        value = make_request();value['goal'] = descriptor(full);value['goalHash']='0x'+sha(full)
        with self.assertRaisesRegex(RuntimeError, 'boundary'):validate_request(encoded(value))
        # A rendered "Oncm.goal" in one name component is not the canonical structural name.
        fake = b'{"in":1,"str":{"pre":0,"str":"Oncm.goal"}}\n{"def":{"name":1}}\n'
        with self.assertRaises(RuntimeError):goal_boundary(fake)

    def test_git_only_data_diff_digest_mode_parent_and_owner(self):
        raw = encoded(make_request());head='a'*40;base='b'*40
        env={'GITHUB_REPOSITORY':'brodyga45/oncm','GITHUB_EVENT_NAME':'push',
             'GITHUB_REF':'refs/heads/codex/proof-requests/'+sha(raw),'GITHUB_SHA':head,
             'GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'1'}
        def git(args):
            if args[0]=='rev-parse':return head.encode()+b'\n'
            if args[0]=='rev-list':return (head+' '+base+'\n').encode()
            if args[0]=='diff-tree':return b'oncm-request.json\0'
            if args[0]=='ls-tree':return ('100644 blob '+'c'*40+'\toncm-request.json\0').encode()
            if args[0]=='cat-file':return str(len(raw)).encode()
            if args[0]=='show':return raw
            raise AssertionError(args)
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'oncm-request.json';path.write_bytes(raw)
            context=git_context(path,env,git);self.assertEqual(context['baseCommit'],base)
            for kind, replacement in [('diff-tree',b'oncm-request.json\0tools/evil.py\0'),
                                      ('ls-tree',('120000 blob '+'c'*40+'\toncm-request.json\0').encode()),
                                      ('rev-list',(head+' '+base+' '+'d'*40).encode())]:
                with self.assertRaises(RuntimeError):
                    git_context(path,env,lambda args: replacement if args[0]==kind else git(args))
            with self.assertRaises(RuntimeError):git_context(path,{**env,'GITHUB_REPOSITORY':'attacker/fork'},git)

    def test_result_failure_binds_all_provenance_and_no_fake_success(self):
        request=validate_request(encoded(make_request()))
        context={'repository':'brodyga45/oncm','requestDigest':request['digest'],
                 'requestCommit':'a'*40,'baseCommit':'b'*40,'requestBranch':'refs/heads/codex/proof-requests/'+request['digest'],
                 'runId':'123','runAttempt':'1'}
        value=terminal(context,request,error='Original proof did not complete')
        validate_terminal(value,context,request)
        changed=copy.deepcopy(value);changed['requestCommit']='c'*40
        with self.assertRaises(RuntimeError):validate_terminal(changed,context,request)
        changed=copy.deepcopy(value);changed.update(status='verified',error=None,proof={'evmVerified':True})
        with self.assertRaises(RuntimeError):validate_terminal(changed,context,request,b'fake receipt')

    def test_real_receipt_transport_bindings_and_mutations(self):
        # CI3's actual receipt, independently verified previously; this small test
        # parses/binds it only. The publisher performs original crypto separately.
        request=validate_request(encoded(make_request(outcome=0)))
        receipt=(HERE/'testdata/perf05-true-registration.receipt.bin').read_bytes()
        seal,parameters,journal=ReceiptReader(receipt).groth16()
        context={'repository':'brodyga45/oncm','requestDigest':request['digest'],
                 'requestCommit':'a'*40,'baseCommit':'b'*40,'requestBranch':'refs/heads/codex/proof-requests/'+request['digest'],
                 'runId':'123','runAttempt':'1'}
        body=request['body'];evm=parameters[:4]+seal
        proof={'format':'oncm-real-groth16-ci-v1','profile':body['profile'],'case':'generic-registration',
               'imageId':body['imageId'],'profileId':body['profileId'],'goalHash':body['goalHash'],'outcome':0,
               'requestNonce':body['requestNonce'],'requestDigest':request['digest'],'sourceCommit':'a'*40,
               'sourceSha256':body['source']['sha256'],'goalExportSha256':body['goal']['sha256'],
               'exportSha256':body['export']['sha256'],'runId':'123','runAttempt':'1','receiptKind':'Groth16',
               'evmVerified':False,'receiptSha256':sha(receipt),'rawSeal':'0x'+seal.hex(),
               'evmSeal':'0x'+evm.hex(),'journal':'0x'+journal.hex(),'verifierParameters':'0x'+parameters.hex(),
               'certificate':'0x'+abi_certificate(evm,journal).hex(),
               'pins':json.loads((HERE/'pins.json').read_text()),'elapsedSeconds':1.0}
        result=terminal(context,request,proof)
        validate_terminal(result,context,request,receipt)
        for key,value in [('outcome',1),('evmVerified',True),('imageId','0x'+'0'*64),
                          ('journal','0x'+'0'*256),('certificate','0x'+'0'*1088),('requestNonce','0'*36)]:
            changed=copy.deepcopy(result);changed['proof'][key]=value
            with self.assertRaises(RuntimeError):validate_terminal(changed,context,request,receipt)

    def test_publication_is_data_only_nonforce_and_first_success_preserved(self):
        context={'requestDigest':'1'*64,'requestCommit':'a'*40,'baseCommit':'b'*40,'runId':'123','runAttempt':'1'}
        value=terminal(context,error='Failed')
        class API:
            def __init__(self,existing=None):self.calls=[];self.existing=existing
            def call(self,method,path,value=None,missing=False):
                self.calls.append((method,path,value))
                if method=='GET' and path.startswith('/git/ref/'):
                    return {'object':{'sha':'c'*40}} if self.existing else None
                if method=='GET' and path.startswith('/contents/'):
                    return {'encoding':'base64','content':base64.b64encode(encoded(self.existing)).decode()}
                return {'sha':'d'*40}
        api=API();publish(api,context,value,None)
        refs=[call for call in api.calls if call[1]=='/git/refs']
        self.assertEqual(refs[0][2]['ref'],'refs/heads/codex/proof-results/'+'1'*64)
        self.assertFalse(any(call[0]=='PATCH' for call in api.calls))
        self.assertTrue(all('TOKEN' not in str(call) for call in api.calls))
        old={**value,'status':'verified'};api=API(old)
        self.assertEqual(publish(api,context,value,None),'c'*40)
        self.assertTrue(all(call[0]=='GET' for call in api.calls))
        old={**value,'runAttempt':'1'};api=API(old);new_context={**context,'runAttempt':'2'}
        publish(api,new_context,terminal(new_context,error='Retry failed'),None)
        patches=[call for call in api.calls if call[0]=='PATCH']
        self.assertEqual(len(patches),1);self.assertIs(patches[0][2]['force'],False)


if __name__ == '__main__':
    unittest.main()
