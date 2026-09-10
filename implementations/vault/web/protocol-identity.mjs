export function protocolIdentity(config){
 if(!config)return{label:'Версия загружается',notice:''};
 const version=config.protocolVersion??'legacy';
 if(version==='2')return{label:'Vault V2',notice:'Отдельные T и реестр утверждений. Рынки Legacy сохранены в прежних контрактах и не входят в этот вид.'};
 if(version==='legacy')return{label:'Vault Legacy',notice:'Исходный T с genesis-выпуском. Этот вид показывает рынки исходного реестра.'};
 return{label:'Версия не распознана',notice:'Проверьте descriptor выбранного развёртывания; поддержка новой версии не предполагается.'};
}
