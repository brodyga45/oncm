import test from 'node:test';
import assert from 'node:assert/strict';
import {protocolIdentity} from '../web/protocol-identity.mjs';
test('selected deployment badge never hides legacy or infers V2 from an ABI alone',()=>{
 assert.equal(protocolIdentity(undefined).label,'Версия загружается');
 assert.equal(protocolIdentity({}).label,'Vault Legacy');
 assert.match(protocolIdentity({protocolVersion:'2'}).notice,/Legacy сохранены/);
 assert.equal(protocolIdentity({protocolVersion:'2'}).label,'Vault V2');
 assert.equal(protocolIdentity({monetaryPolicy:{version:'vault-monetary-v1'}}).label,'Vault Legacy');
 assert.equal(protocolIdentity({protocolVersion:'3'}).label,'Версия не распознана');
});
