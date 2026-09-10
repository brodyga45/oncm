import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DeadlineInput,PortablePackagePaste} from '../web/review-inputs.mjs';
import {parseLocalDeadline} from '../web/derived-review.mjs';
import {preparePortablePackage} from '../web/portable-package.mjs';
import {externalFixture} from './external-bundle-fixture.mjs';
function element(root,type){if(!root)return;for(const child of [root,...React.Children.toArray(root.props?.children)]){if(child.type===type)return child;const found=child!==root&&element(child,type);if(found)return found;}}
test('Deadline is an ordinary accessible text input; both input/change events preserve exact lexical value',()=>{
 let value='';const component=DeadlineInput({value,onValue:v=>{value=v;}}),input=element(component,'input');
 assert.equal(input.props.type,'text');input.props.onInput({currentTarget:{value:'2030-01-01 00:00'}});assert.equal(value,'2030-01-01 00:00');
 input.props.onChange({currentTarget:{value:'2030-01-01T00:00:15'}});assert.equal(value,'2030-01-01T00:00:15');
 assert(parseLocalDeadline(value).valid);
 const html=renderToStaticMarkup(React.createElement(DeadlineInput,{value,onValue(){}}));assert(html.includes('type="text"'));assert(html.includes('2030-01-01T00:00:15'));assert(!html.includes('datetime-local'));
 assert.equal(parseLocalDeadline('2030-01-01 00:00').unix,parseLocalDeadline('2030-01-01T00:00').unix);
});
test('Portable paste calls the same draft parser and never invokes cryptographic verification or restores readiness',()=>{
 const b=externalFixture('false-registration'),raw=JSON.stringify({schema:'exchange-lean-package-v1',source:b.source.text,sourceSha256:b.source.sha256,
  profileId:b.artifact.profileId,goalHash:b.artifact.goalHash,canonicalGoalExport:b.goalExport,externalCertificate:b.artifact,registrationCertificate:b.artifact.certificate});
 let entered='',loaded;
 const edit=PortablePackagePaste({value:'',onValue:v=>{entered=v;},onLoad(){},busy:false});element(edit,'textarea').props.onInput({currentTarget:{value:raw}});assert.equal(entered,raw);
 const control=PortablePackagePaste({value:entered,onValue(){},onLoad:value=>{loaded=preparePortablePackage(value);},busy:false});
 assert.equal(element(control,'button').props.disabled,false);assert.equal(loaded,undefined);element(control,'button').props.onClick();
 assert.equal(loaded.certificate,'');assert.equal(loaded.draft.source,b.source.text);assert.equal(loaded.draft.goalHash,b.artifact.goalHash);assert.equal(loaded.draft.profileId,b.artifact.profileId);assert(loaded.externalJSON);
});
test('Empty, oversized or busy portable paste cannot enable its load button',()=>{
 for(const props of [{value:''},{value:'  '},{value:'x'.repeat(2*1024*1024+1)},{value:'{}',busy:true}]){
  const c=PortablePackagePaste({onValue(){},onLoad(){},busy:false,...props});assert.equal(element(c,'button').props.disabled,true);
 }
});
