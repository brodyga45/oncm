import React from 'react';
const h=React.createElement;
export async function readOperatorDetails(registry,id,blockNumber){
 const at={blockTag:blockNumber},s=await registry.statements(id,at);
 if(Number(s.kind)!==4)throw Error('This statement is not a governed operator.');
 const [parameters,entry]=await Promise.all([registry.operatorArguments(id,at),registry.operators(s.goal,at)]);
 return{statementId:id,blockNumber,operatorId:s.goal,parameters,adapter:entry.verifier,manifest:entry.manifest,newEnabled:entry.newEnabled,resolutionEnabled:entry.resolutionEnabled};
}
export function OperatorDetails({details}){
 if(!details)return h('p',null,'Reading the governed operator ID and its exact onchain operands…');
 const rows=[['Operator ID',details.operatorId],['Evaluator address',details.adapter],['ABI-encoded operands',details.parameters],['Registry manifest',details.manifest],['New registrations',details.newEnabled?'Enabled':'Disabled'],['Resolution',details.resolutionEnabled?'Enabled':'Disabled']];
 return h(React.Fragment,null,h('dl',null,...rows.flatMap(([label,value])=>[h('dt',{key:label+'-label'},label),h('dd',{key:label+'-value'},h('code',null,value))])),h('p',{className:'note'},`Operator records read at block #${details.blockNumber}. Dependencies, outcome rules and time bounds are encoded in these operands and defined by this evaluator. No built-in deadline or dependency interpretation is inferred.`));
}
