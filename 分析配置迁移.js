(function(root){
 'use strict';
 root.migrateSeeTimePrompts=function(data,legacy){
  if(data.legacyPersonalPromptsImported||!Array.isArray(legacy?.prompts))return data;
  const groups=new Map();
  for(const row of legacy.prompts){
   if(!row.name||!row.version)continue;
   let prompt=groups.get(row.name);
   if(!prompt){prompt={id:'legacy-personal-'+String(row.id),name:row.name,app:'个人版',task:'相机单次观测',active:'',versions:[],logs:[]};groups.set(row.name,prompt)}
   const number=String(row.version).replace(/^v/i,''),published=row.status==='已发布';
   const logs=Array.isArray(row.logs)?row.logs:[];
   prompt.versions.push({number,body:row.content||'',note:logs[0]?.text||'从个人版原配置导入',time:logs[0]?.time||'',published});
   prompt.logs.push(...logs.map(log=>({type:'原配置记录',version:number,note:log.text||'',time:log.time||'',actor:'原配置'})));
   if(published&&(!prompt.active||number.localeCompare(prompt.active,undefined,{numeric:true})>0))prompt.active=number;
  }
  return {...data,prompts:[...groups.values(),...data.prompts],legacyPersonalPromptsImported:true};
 };
})(globalThis);
