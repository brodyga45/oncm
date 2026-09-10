import test from 'node:test';
import assert from 'node:assert/strict';
import {packageJobs} from '../server/package-artifacts.mjs';

const statement = {id:'statement-1', goalHash:'goal-1'};
const own = {owner:'0xAlice',status:'succeeded',input:{statementId:statement.id,source:'private solution'},result:{certificate:'private result'}};
const registration = {owner:'0xAlice',status:'succeeded',input:{action:'register',source:'private registration'},result:{goalHash:statement.goalHash}};
const foreign = {...own, owner:'0xBob'};
const legacy = {...own}; delete legacy.owner;
const jobs = [own, registration, foreign, legacy,
  {...own, status:'running'}, {...own,input:{statementId:'other'}}];

test('public package never includes unpublished job sources or results',()=>{
  assert.deepEqual(packageJobs(jobs,statement),[]);
  assert.deepEqual(packageJobs(jobs,statement,''),[]);
});
test('verified owner receives only own completed matching jobs, including registration',()=>{
  assert.deepEqual(packageJobs(jobs,statement,'0xALICE'),[own,registration]);
  assert.deepEqual(packageJobs(jobs,statement,'0xBob'),[foreign]);
  assert.deepEqual(packageJobs(jobs,statement,'0xOther'),[]);
});
test('legacy history is preserved without assigning it to any wallet',()=>{
  const before=structuredClone(jobs);
  packageJobs(jobs,statement,'0xAlice');
  assert.deepEqual(jobs,before);
  assert.equal(Object.hasOwn(legacy,'owner'),false);
  assert.deepEqual(packageJobs([registration],{id:'other'},'0xAlice'),[]);
});
