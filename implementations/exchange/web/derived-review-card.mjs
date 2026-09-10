import React from 'react';
const h=React.createElement;
export function DerivedReviewCard({review}){
 if(!review)return null;
 const rows=review.valid?[['Operation',review.type],['Dependency',review.dependencyTitle],['Exact dependency ID',review.dependencyId],['Required recorded outcome',review.targetLabel],
  ...(review.deadline?[['Deadline · local',review.deadline.local],['Deadline · UTC',review.deadline.utc],['Deadline · Unix seconds',String(review.deadline.unix)],['Boundary','Inclusive: recorded resolution time ≤ deadline']]:[['Deadline','None · contract argument 0']])]:[];
 return h('section',{className:'panel derived-review','aria-label':'Derived statement transaction review'},
  h('h3',null,'Review derived statement before creating'),
  review.valid?h(React.Fragment,null,h('dl',null,...rows.flatMap(([label,value])=>[h('dt',{key:label+'-label'},label),h('dd',{key:label+'-value'},value)])),
   h('p',{className:'note'},'These exact values will be sent to the registry. A past deadline is permitted. This review does not resolve the statement or submit a transaction.')):
   h('p',{role:'alert'},review.error));
}
