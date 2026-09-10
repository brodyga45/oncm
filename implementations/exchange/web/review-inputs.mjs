import React from 'react';
import {EXTERNAL_BUNDLE_LIMITS} from './external-import.mjs';
const h=React.createElement;
// Text controls expose the actual lexical value to users and accessibility
// tools. Both native input events and React change events update controlled state.
export function DeadlineInput({value,onValue}){
 const update=event=>onValue(event.currentTarget.value);
 return h(React.Fragment,null,h('label',{className:'field'},h('span',null,'Deadline · local timezone (inclusive)'),
  h('input',{type:'text',value,onInput:update,onChange:update,autoComplete:'off',spellCheck:false,
   placeholder:'YYYY-MM-DD HH:mm · local time','aria-describedby':'deadline-format'})),
  h('p',{className:'note',id:'deadline-format'},'Format: YYYY-MM-DD HH:mm, for example 2030-01-01 00:00. A T separator and :ss seconds are also accepted. The review below shows the exact UTC and Unix conversion.'));
}
export function PortablePackagePaste({value,onValue,onLoad,busy}){
 const bytes=new TextEncoder().encode(value).length,oversized=bytes>EXTERNAL_BUNDLE_LIMITS.wrapper;
 const update=event=>onValue(event.currentTarget.value);
 return h('section',null,h('label',{className:'field'},h('span',null,'Paste portable Lean package JSON'),
  h('textarea',{value,onInput:update,onChange:update,spellCheck:false,placeholder:'{"schema":"exchange-lean-package-v1", ...}',rows:5})),
  oversized&&h('p',{role:'alert'},'Portable package exceeds the 2 MiB input limit.'),
  h('button',{className:'button secondary',type:'button',disabled:!!busy||!value.trim()||oversized,onClick:()=>onLoad(value)},'Load pasted package draft'),
  h('p',{className:'note'},'Loading restores source, goal and profile as an unverified draft. It never verifies or submits a certificate; use the separate Verify action above.'));
}
