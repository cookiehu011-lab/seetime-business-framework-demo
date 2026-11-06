/* Phase-one local interaction model. No business API requests. */
(() => {
 const routes=new Set(['projectAnalysis','bindings','personalProfile']);
 const base={render,moduleWorkspace,projectAnalysisPage,bindingsPage,cityPoiPage,dispatchAction,navigate,openFrameworkDetail,shell,closeOverlay};
 const ui={status:'all',issue:'all',analysis:'all',poiQuery:'',modal:null,leave:null,parked:null,backlink:null};
 const copy=value=>JSON.parse(JSON.stringify(value));
 const keyOf=ids=>[...new Set(ids)].sort().join('|');
 const timestamp=()=>new Date().toLocaleString('zh-CN',{hour12:false});
 const scope=()=>routes.has(state.route);
 const isEditor=()=>can('personalProfile')&&['admin','personalProfileOps'].includes(store.session.role);
 const camera=id=>projectCameras().find(c=>c.id===id);
 function cityData(cityKey=store.session.city){
  const data=store.cities[cityKey];
  const sampleParents={p1:null,p2:'p1',p3:'p1'};
  data.pois.forEach(poi=>{if(poi.parentId===undefined&&Object.prototype.hasOwnProperty.call(sampleParents,poi.id))poi.parentId=sampleParents[poi.id]});
  if(!data.personalOps){
   data.personalOps={version:1,records:{}};
   data.cameras.forEach((cam,i)=>{const poiId='p'+(i%3+1),mounts=i===2||i===3||i===5?[poiId]:i===1?['p2']:[];data.personalOps.records[cam.id]={version:0,candidateVersion:1,usageVersion:0,mounts,sources:Object.fromEntries(mounts.map(id=>[id,i===1?'ai_pre':'manual'])),candidates:i===4?[]:[{id:poiId,reason:i%3===2?'停车场画面与地点分类相符':'名称与画面场景相符'}],analysis:i===4?'分析失败':'有结果',analysisTime:i===4?'':'2026-10-23 10:30',analysisError:i===4?'未取得分析结果':'',review:i===2?{key:keyOf(mounts),version:0,candidateVersion:1,usageVersion:0,actor:'周同学',time:'2026-10-23 10:35'}:null,excluded:null,issue:'',note:'',decisions:{accepted:[],rejected:[]},history:[],candidatesComplete:true,hiddenRelations:false};});
  }
  data.cameras.forEach((cam,i)=>{const r=data.personalOps.records[cam.id];if(!r)return;r.candidates=r.candidates||[];if(i===0&&r.version===0&&!r.mounts.length&&!r.unmountable){r.mounts=['p1'];r.sources={p1:'manual'};r.review={key:keyOf(['p1']),version:r.version,candidateVersion:r.candidateVersion,usageVersion:r.usageVersion,actor:'示例运营',time:'2026-10-23 10:35'};}if(i===1&&r.version>0&&r.mounts.some(id=>r.sources[id]==='ai_pre')){r.mounts=r.mounts.filter(id=>r.sources[id]!=='ai_pre');r.sources=Object.fromEntries(r.mounts.map(id=>[id,r.sources[id]]));r.review=null;}if(i===2&&r.version===0&&!(r.history||[]).length&&r.mounts.length){r.mounts=[];r.sources={};r.review=null;}if((r.version||0)===0){const previous=r.candidates,available=['p1','p2','p3'].filter(id=>!(r.mounts||[]).includes(id));r.candidates=available.slice(0,2).map(id=>previous.find(item=>item.id===id)||{id,reason:'画面场景与地点类型相符'})}});
  return data;
 }
 function raw(id,cityKey=store.session.city){return cityData(cityKey).personalOps.records[id]}
 function record(id){if(!can('bindings')||!camera(id))throw Error('无权查看此相机');return raw(id)}
 function reviewed(r){return !!(r.review&&r.mounts.length&&r.review.key===keyOf(r.mounts)&&r.review.version===r.version&&r.review.usageVersion===r.usageVersion)}
 function excluded(cam,r=raw(cam.id)){return !!(r.excluded||['governance','none'].includes(cam.businessValue))}
 function status(cam){const r=raw(cam.id);return excluded(cam,r)?'不用于个人版':reviewed(r)?'已核对':'未核对'}
 function problems(cam){const r=raw(cam.id),items=[];if(r.analysis!=='有结果')items.push(r.analysis);if(cam.state==='离线')items.push('无当前帧');if(!Number.isFinite(Number(cam.longitude))||cam.longitude==null||cam.longitude===''||!Number.isFinite(Number(cam.latitude))||cam.latitude==null||cam.latitude==='')items.push('缺坐标');if(cam.businessValue==='unassessed')items.push('用途待评估');if(r.issue)items.push(r.issue);return [...new Set(items)]}
 function limitations(cam,poiId=''){
  const r=raw(cam.id),items=[];
  if(excluded(cam,r))items.push('不用于个人版');
  if(!reviewed(r))items.push('挂载未核对');
  if(cam.businessValue==='unassessed')items.push('用途待评估');
  if(!cam.personalSubscribed)items.push('未订阅个人版');
  const source=city().sources.find(s=>s.id===cam.sourceId);
  if(source&&['已到期','已停用','已暂停'].includes(source.status))items.push('来源授权不可用');
  const targets=poiId?[poiId]:r.mounts;
  if(targets.some(id=>!city().pois.some(p=>p.id===id)))items.push('POI 不存在');
  if(targets.some(id=>city().pois.find(p=>p.id===id)?.enabled===false))items.push('POI 已停用');
  return [...new Set(items)];
 }
 function stamp(r){return [r.version,r.candidateVersion,r.usageVersion].join(':')}
 function audit(r,action){r.history.unshift({action,actor:role().person,time:timestamp()});r.history=r.history.slice(0,40)}
 function syncDisk(){
  let saved;try{const text=localStorage.getItem('seetime-workspace-v4');saved=text?JSON.parse(text):null}catch{throw Error('无法读取本机存储，尚未保存')}
  if(saved?.version===4&&saved.cities?.[store.session.city])return saved;
  return null;
 }
 function mergeDisk(disk){if(!disk)return;for(const [key,data] of Object.entries(disk.cities))store.cities[key]=data;cityData();ensureCameraGovernance()}
 function commitRecord(id,expected,action,update){
  if(!can('bindings')||!camera(id))throw Error('无权维护此相机');
  const disk=syncDisk(),latest=disk?.cities?.[store.session.city]?.personalOps?.records?.[id];
  if(latest&&stamp(latest)!==expected){mergeDisk(disk);throw Error('记录已更新，请重新核对')}
  if(stamp(raw(id))!==expected)throw Error('记录已更新，请重新核对');
  mergeDisk(disk);
  if(!camera(id)||!raw(id))throw Error('相机记录已变化，请返回列表');
  const previous=copy(city()),r=raw(id);
  try{if(update(r)===false)return r;r.version++;if(r.review)r.review.version=r.version;audit(r,action);if(!persist())throw Error('未保存，本机存储不可用');return r}catch(error){store.cities[store.session.city]=previous;throw error}
 }
 function prepareBaseSave(id){
  const current=camera(id),disk=syncDisk(),remote=disk?.cities?.[store.session.city]?.cameras.find(c=>c.id===id);
  if(disk&&(!remote||JSON.stringify(cameraDraft(current))!==JSON.stringify(cameraDraft(remote))))throw Error('相机信息已更新，请重新核对');
  mergeDisk(disk);return copy(store.cities);
 }
 function prepareSessionSave(){mergeDisk(syncDisk())}
 function afterCitySwitch(id){const project=PROJECTS.find(p=>p.id===state.projectId);if(project&&project.cityKey!==id){state.projectId='';state.detail=null;if(routes.has(state.route)||state.route==='cameras')state.route='projects'}}
 function rollbackBaseSave(snapshot){store.cities=snapshot}
 function capture(){return {route:state.route,search:state.search,filter:state.filter,status:ui.status,issue:ui.issue,analysis:ui.analysis,poiCategory:state.poiCategory,poiDistrict:state.poiDistrict,poiProject:state.poiProject,scroll:window.scrollY||0}}
 function restoreContext(ctx){state.search=ctx.search||'';state.filter=ctx.filter||'all';ui.status=ctx.status||'all';ui.issue=ctx.issue||'all';ui.analysis=ctx.analysis||'all';state.poiCategory=ctx.poiCategory||'all';state.poiDistrict=ctx.poiDistrict||'all';state.poiProject=ctx.poiProject||'all'}
 function filteredCameras(route=state.route){return projectCameras().filter(cam=>{const r=raw(cam.id),q=state.search.toLowerCase();return (!q||(cam.name+' '+cam.id).toLowerCase().includes(q))&&(route==='projectAnalysis'?ui.analysis==='all'||r.analysis===ui.analysis:(ui.status==='all'||status(cam)===ui.status)&&(ui.issue==='all'||problems(cam).includes(ui.issue)))});}
 function detail(){return state.detail?.route==='bindings'?state.detail.ops:null}
 function draftDirty(){const d=detail();if(d)return keyOf(d.selected)!==keyOf(d.initial)||Object.keys(d.preDecisions||{}).length>0;const p=state.detail?.route==='personalProfile'&&state.detail.ops;return !!(p?.editing&&JSON.stringify(p.values)!==JSON.stringify(p.initial))}
 function redraw(focus=''){const y=window.scrollY||0;render();window.scrollTo?.({top:y,behavior:'instant'});if(focus)document.getElementById(focus)?.focus({preventScroll:true})}
 function openCamera(id,context=null){
  if(!can('bindings')||!camera(id))return false;
  const origin=context||capture(),sequence=(origin.sequence||filteredCameras(origin.route).map(c=>c.id));
  const r=raw(id),initial=r.mounts.filter(p=>r.sources[p]!=='ai_pre'),selected=origin.selectedPoiId?[origin.selectedPoiId]:[...initial];
  state.route='bindings';state.detail={route:'bindings',id,view:'binding',ops:{selected,initial:[...initial],preDecisions:{},expected:stamp(r),candidateIds:r.candidates.map(c=>c.id),origin,sequence:sequence.includes(id)?sequence:projectCameras().map(c=>c.id),frameDate:CAMERA_EXAMPLE_DAY,minute:null,error:''}};
  ui.poiQuery='';render();document.getElementById('framework-back-list')?.focus();window.scrollTo?.({top:0,behavior:'instant'});return true;
 }
 function selectPoi(id,selected){const d=detail(),cam=camera(state.detail?.id);if(!d||!cam||excluded(cam)||!city().pois.some(p=>p.id===id))return false;d.selected=selected?[...new Set([...d.selected,id])]:d.selected.filter(p=>p!==id);d.error='';redraw();return true}
 function decidePre(id,poiId,decision){const d=detail(),r=raw(id);if(!d||state.detail.id!==id||!r.mounts.includes(poiId)||r.sources[poiId]!=='ai_pre'||!['accept','reject'].includes(decision))return false;d.preDecisions[poiId]=decision;d.selected=decision==='accept'?[...new Set([...d.selected,poiId])]:d.selected.filter(p=>p!==poiId);d.error='';redraw('ops-pre-'+poiId);return true}
 function frameState(){const d=detail(),cam=camera(state.detail?.id);if(!d||!cam)return {available:false};const frames=frameMinutesForDate(d.frameDate);return {available:frames.length>0&&!(d.minute===null&&cam.state==='离线'),date:d.frameDate,minute:d.minute??642,current:d.minute===null,frames}}
 function confirm(id,advance=false){
  const d=detail(),cam=camera(id);if(!d||state.detail.id!==id||!cam||!can('bindings'))throw Error('当前相机已改变，请重新打开');
  const r=raw(id);
  if(excluded(cam,r))throw Error('此相机不用于个人版');
  if(!frameState().available)throw Error('当前没有可核对画面，请先记录问题');
  if(!r.candidatesComplete||r.hiddenRelations)throw Error('清单不完整，无法确认整路相机');
  if(r.mounts.some(p=>r.sources[p]==='ai_pre'&&!['accept','reject'].includes(d.preDecisions[p])))throw Error('请先逐条审核 AI 预挂关系');
  if(!d.selected.length)throw Error('请选择至少一个 POI，或标记无法挂载');
  if(keyOf(r.candidates.map(c=>c.id))!==keyOf(d.candidateIds))throw Error('候选已更新，请重新核对');
  if(d.selected.some(p=>!city().pois.some(x=>x.id===p)))throw Error('所选 POI 已变化，请重新核对');
  const picked=[...d.selected];
  commitRecord(id,d.expected,'确认挂载',item=>{
   if(excluded(camera(id),item))throw Error('此相机不用于个人版');
   if(!item.candidatesComplete||item.hiddenRelations)throw Error('清单不完整，无法确认整路相机');
   if(keyOf(item.candidates.map(c=>c.id))!==keyOf(d.candidateIds))throw Error('候选已更新，请重新核对');
   if(picked.some(p=>!city().pois.some(x=>x.id===p&&x.enabled!==false)))throw Error('所选 POI 已变化，请重新核对');
   if(!frameState().available)throw Error('当前没有可核对画面，请先记录问题');
   if(d.submitted===stamp(item)&&keyOf(picked)===keyOf(item.mounts)&&reviewed(item))return false;
   item.mounts=picked;item.sources=Object.fromEntries(picked.map(p=>[p,'manual']));item.unmountable=null;item.decisions={accepted:picked,rejected:item.candidates.filter(c=>!picked.includes(c.id)).map(c=>c.id)};
   item.review={key:keyOf(picked),version:item.version+1,candidateVersion:item.candidateVersion,usageVersion:item.usageVersion,actor:role().person,time:timestamp()};
   if(item.issue==='待补 POI'||item.issue==='缺少核对画面'){item.issue='';item.note=''}
  });
  d.initial=[...picked];d.preDecisions={};d.expected=stamp(raw(id));d.submitted=d.expected;d.error='';
  if(advance&&d.origin.route==='personalProfile'&&!d.origin.rangePoiId){dispatchAction('ops-back');notify('已保存示例挂载 · 返回 POI 运营');return true}
  if(advance&&move(1,true)){notify('已保存示例挂载 · 进入下一台');return true}
  redraw('ops-confirm-current');notify('已保存示例挂载 · 本机');return true;
 }

 function markUnable(id,reason=''){
  const d=detail();if(!d||state.detail.id!==id)throw Error('当前相机已改变');
  reason=String(reason||'').trim();if(!reason)throw Error('请填写无法挂载的原因');
  commitRecord(id,d.expected,'标记无法挂载',r=>{r.mounts=[];r.sources={};r.review=null;r.unmountable={actor:role().person,time:timestamp()};r.issue='无法挂载';r.note=reason});
  d.expected=stamp(raw(id));d.initial=[];d.selected=[];d.preDecisions={};
  if(d.origin.route==='personalProfile'&&!d.origin.rangePoiId){dispatchAction('ops-back');notify('已保存示例结果 · 返回 POI 运营');return true}
  if(move(1,true)){notify('已保存示例结果 · 进入下一台');return true}
  d.expected=stamp(raw(id));d.initial=[];d.selected=[];d.error='';redraw();notify('已保存示例结果 · 无法挂载');return true;
 }
 function saveSelectedMount(id,poiId){const d=detail();if(!d||state.detail.id!==id||!city().pois.some(p=>p.id===poiId))throw Error('请选择有效的示例 POI');d.selected=[poiId];return confirm(id,true)}
 function acceptPreMount(id,poiId){const d=detail(),r=raw(id);if(!d||state.detail.id!==id||r.sources[poiId]!=='ai_pre')throw Error('这台相机没有该预挂示例');d.preDecisions=Object.fromEntries(r.mounts.filter(key=>r.sources[key]==='ai_pre').map(key=>[key,key===poiId?'accept':'reject']));d.selected=[poiId];return confirm(id,true)}
 function excludeCamera(id,reason){const d=detail();if(!d||state.detail.id!==id)throw Error('当前相机已改变');reason=String(reason||'').trim();if(!reason)throw Error('请填写不用于个人版的原因');if(reason.length>160)throw Error('原因最多 160 字');commitRecord(id,d.expected,'不用于个人版',r=>{r.excluded={reason,actor:role().person,time:timestamp()};r.usageVersion++;r.review=null});d.expected=stamp(raw(id));d.selected=[...d.initial];closeOverlay();redraw();notify('已保存 · 本机');return true}
 function restoreCamera(id){const d=detail(),cam=camera(id);if(!d||state.detail.id!==id||!raw(id).excluded)throw Error('没有可恢复的个人版决定');if(['governance','none'].includes(cam.businessValue))throw Error('请先修正基础价值评估');commitRecord(id,d.expected,'恢复核对',r=>{r.excluded=null;r.usageVersion++;r.review=null});openCamera(id,{...d.origin,sequence:d.sequence});notify('已恢复，需重新核对 · 本机');return true}
 function onBaseValueChange(id,before,after){if(before===after||!city().personalOps?.records[id])return;const r=raw(id);if(['governance','none'].includes(before)||['governance','none'].includes(after)){r.review=null;r.usageVersion++;r.version++;audit(r,'基础用途变更')}}
 function move(offset,force=false){const d=detail();if(!d)return false;const current=d.sequence.indexOf(state.detail.id),id=d.sequence[current+offset];if(!id||!camera(id))return false;if(!force&&draftDirty()){leave(()=>openCamera(id,{...d.origin,sequence:d.sequence}),offset>0?'放弃修改并切换到下一台？':'放弃修改并切换到上一台？',offset>0?'放弃修改并下一台':'放弃修改并上一台');return false}return openCamera(id,{...d.origin,sequence:d.sequence})}
 function back(){const d=detail()||state.detail?.ops,ctx=d?.origin||{route:state.route};const action=()=>{state.route=ctx.route||'bindings';state.detail=null;restoreContext(ctx);render();window.scrollTo?.({top:ctx.scroll||0,behavior:'instant'})};if(draftDirty()){leave(action,'关闭相机工作区并放弃修改？','放弃修改并关闭');return false}action();return true}
 function leave(action,title='放弃未保存的修改？',confirmLabel='放弃并离开'){ui.leave=action;modal('leave',title,'<p class="ops-dialog-copy">当前选择尚未保存。</p>','<button class="button ghost" data-action="close">继续编辑</button><button class="button primary" data-action="ops-leave">'+confirmLabel+'</button>')}
 function modal(type,title,body,footer=''){
  ui.modal={type,focus:document.activeElement?.id||'',element:document.activeElement};activeOverlay={kind:'personal-ops',type};
  document.getElementById('overlay').innerHTML=`<div class="modal-wrap" data-backdrop="true"><section class="modal ops-modal" role="dialog" aria-modal="true" aria-labelledby="ops-dialog-title"><header class="modal-head"><h2 id="ops-dialog-title">${esc(title)}</h2><button class="close-button" data-action="close" aria-label="关闭">${icon('close')}</button></header><div class="modal-body">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;document.body.style.overflow='hidden';document.getElementById('overlay').querySelector('input,select,textarea,button')?.focus();
 }
 function formError(message){const el=document.getElementById('ops-form-error');if(el){el.hidden=false;el.textContent=message;el.scrollIntoView?.({block:'nearest'})}else if(detail()){detail().error=message;redraw('ops-detail-error')}else notify(message)}
 function reasonDialog(kind){const id=state.detail?.id;if(!detail()||!camera(id))return;const exclude=kind==='exclude',detach=kind==='detach',discard=!exclude&&!detach&&draftDirty(),sequence=detail().sequence,index=sequence.indexOf(id),hasNext=index>=0&&index<sequence.length-1;modal(kind,exclude?'不用于个人版':detach?'解除全部挂载':'记录问题',`<form id="ops-reason-form" data-form="ops-reason" data-kind="${kind}" data-id="${esc(id)}"><div id="ops-form-error" class="form-error" role="alert" hidden></div>${exclude?'<p class="ops-dialog-copy">保留挂载，不影响治理版。</p>':detach?`<p class="ops-dialog-copy">将解除 ${raw(id).mounts.length} 个 POI，当前确认将失效。</p>`:opsSelectField('问题','issue',['待补 POI','缺少核对画面','位置信息待修正','分析结果待检查'],raw(id).issue||'待补 POI')}${discard?'<p class="ops-dialog-copy">将放弃本次未保存的 POI 选择。</p>':''}${!detach?`<label class="ops-field" for="ops-reason"><span>${exclude?'原因':'说明（可选）'}</span><textarea id="ops-reason" name="reason" rows="3" maxlength="160" ${exclude?'required':''}>${esc(exclude?'':raw(id).note)}</textarea></label>`:''}</form>`,`<button class="button ghost" data-action="close">取消</button><button class="button ${detach?'danger':'primary'}" type="submit" form="ops-reason-form">${exclude?'确认不使用':detach?'解除挂载':discard?(hasNext?'放弃修改并保存问题，下一台':'放弃修改并保存问题'):(hasNext?'保存问题并下一台':'保存问题')}</button>`)}
 function opsSelectField(label,name,items,value,extra=''){return `<label class="ops-field" for="ops-field-${name}"><span>${label}</span><select id="ops-field-${name}" name="${name}" ${extra}>${items.map(item=>{const [v,t]=Array.isArray(item)?item:[item,item];return `<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`}).join('')}</select></label>`}
 function poiFields(values,editing=false){return `<div class="ops-form-grid"><label class="ops-field" for="ops-poi-name"><span>POI 名称</span><input id="ops-poi-name" name="name" value="${esc(values.name||'')}" maxlength="60" required></label>${editing?`<div class="ops-field"><span>区县</span><strong class="ops-readonly">${esc(values.district)}</strong><input type="hidden" name="district" value="${esc(values.district)}"></div>`:opsSelectField('区县','district',info().districts,values.district||info().districts[0])}${opsSelectField('分类','category',[...new Set(['商圈','景点','停车场','公园','其他',...city().pois.map(p=>p.category)])],values.category||'其他')}<label class="ops-field" for="ops-poi-address"><span>地址说明</span><input id="ops-poi-address" name="address" value="${esc(values.address||'')}" maxlength="160" required></label><label class="ops-field ops-wide" for="ops-poi-description"><span>简介（可选）</span><textarea id="ops-poi-description" name="description" rows="3" maxlength="300">${esc(values.description||'')}</textarea></label></div>`}
 function createPoi(){if(!isEditor()){notify('无权补录 POI，可记录待补问题');return false}modal('poi','补录 POI',`<form id="ops-poi-form" data-form="ops-poi"><div id="ops-form-error" class="form-error" role="alert" hidden></div>${poiFields({})}</form>`,'<button class="button ghost" data-action="close">取消</button><button class="button primary" type="submit" form="ops-poi-form">保存 POI</button>');return true}
 function savePoi(values,id=''){
  if(!isEditor()||!currentProject())throw Error('无权维护此 POI');
  const name=String(values.name||'').trim(),address=String(values.address||'').trim(),description=String(values.description||'').trim();
  if(!name||!address)throw Error('请填写 POI 名称和地址说明');if(name.length>60||address.length>160||description.length>300)throw Error('内容超过允许长度');if(!info().districts.includes(values.district))throw Error('请选择当前城市区县');
  const categories=new Set(['商圈','景点','停车场','公园','其他',...city().pois.map(p=>p.category)]);if(!categories.has(values.category))throw Error('请选择有效分类');
  const disk=syncDisk(),remote=disk?.cities?.[store.session.city],existing=city().pois.find(p=>p.id===id),expected=state.detail?.route==='personalProfile'?state.detail.ops?.expected:undefined;
  if(id&&!existing)throw Error('POI 不存在');if(id&&values.district!==existing.district)throw Error('区县归属变更需城市维护权限流程');
  if(id&&remote&&(remote.pois.find(p=>p.id===id)?.opsVersion||0)!==expected){store.cities[store.session.city]=remote;throw Error('POI 已更新，请重新核对')}
  mergeDisk(disk);if(id&&!city().pois.some(p=>p.id===id))throw Error('POI 已变化，请返回列表');
  if(city().pois.some(p=>p.id!==id&&p.name.trim()===name&&p.district===values.district))throw Error('该区县已有同名 POI，请使用现有记录');
  const previous=copy(city()),poi=id?city().pois.find(p=>p.id===id):{id:'local-'+Date.now().toString(36)+'-'+(city().pois.length+1),cameraCount:0,capacity:0,occupied:0,completeness:0,source:'人工补录',opsVersion:0};
  Object.assign(poi,{name,district:values.district,category:values.category,address,description,opsVersion:(poi.opsVersion||0)+1,updated:now()});poi.opsHistory=[{actor:role().person,action:id?'修改资料':'补录 POI',time:timestamp()},...(poi.opsHistory||[])].slice(0,40);if(!id)city().pois.push(poi);
  if(!persist()){store.cities[store.session.city]=previous;throw Error('未保存，本机存储不可用')}
  closeOverlay();
  if(detail()){detail().selected=[...new Set([...detail().selected,poi.id])];detail().error='';ui.poiQuery=''}
  else if(state.detail?.route==='personalProfile'){state.detail.ops.editing=false;state.detail.ops.values=null;state.detail.ops.initial=null;state.detail.ops.expected=poi.opsVersion}
  render();notify('已保存 · 本机');return poi;
 }
 function statusBadge(text){return `<span class="ops-status ${text==='已核对'?'confirmed':text==='未核对'?'pending':'excluded'}">${esc(text)}</span>`}
 function pills(items){return items.map(x=>`<span class="ops-problem">${esc(x)}</span>`).join('')||'<span class="ops-muted">—</span>'}
 function optionFilter(label,key,items,value){return `<label class="ops-filter"><span class="visually-hidden">${label}</span><select id="ops-filter-${key}" data-ops-filter="${key}" aria-label="${label}">${items.map(([v,t])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`}
 function searchBox(value,kind,placeholder){return `<form class="ops-search" data-form="ops-search" data-kind="${kind}"><label class="visually-hidden" for="ops-search-${kind}">${placeholder}</label>${icon('search')}<input id="ops-search-${kind}" name="q" type="search" value="${esc(value)}" placeholder="${placeholder}"><button type="submit" class="button small ghost">搜索</button>${value?'<button type="button" class="ops-icon-button" data-action="ops-clear-search" data-id="'+kind+'" aria-label="清空搜索">'+icon('close')+'</button>':''}</form>`}
 function top(title,count='',action=''){return `<div class="ops-heading"><div><h1>${esc(title)}</h1>${count!==''?`<span>${esc(count)}</span>`:''}</div>${action}</div>`}
 function tableHtml(head,rows,empty='没有匹配的相机',reset=true){return `<div class="ops-table-scroll"><table class="ops-table"><thead><tr>${head.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join(''):`<tr><td class="ops-empty" colspan="${head.length}">${esc(empty)}${reset?' <button class="ops-text-button" data-action="ops-reset-filters">清空筛选</button>':''}</td></tr>`}</tbody></table></div>`}
 function camIdentity(cam){return `<div class="ops-camera-id"><span class="ops-thumb" aria-hidden="true">${sceneImage(cameraFrameKind(cam))}</span><div><strong>${esc(cam.name)}</strong><small>${esc(cam.id)}</small></div></div>`}
 function poiNames(ids){return ids.map(id=>esc(city().pois.find(p=>p.id===id)?.name||'POI 不存在')).join('、')||'<span class="ops-muted">未挂载</span>'}
 function analysisPage(){const cams=filteredCameras('projectAnalysis');return top('个人版相机分析',projectCameras().length+' 路相机')+`<section class="box ops-panel"><div class="ops-toolbar">${searchBox(state.search,'list','搜索相机名称或编号')}${optionFilter('分析情况','analysis',[['all','全部分析情况'],...['有结果','暂无结果','分析中','分析失败'].map(s=>[s,s])],ui.analysis)}<span class="demo-tag">分析结果均为示例</span></div>${tableHtml(['相机 / 示例','画面场景与标签 / 示例','高德候选 POI / 示例','挂载状态 / 示例',''],cams.map(cam=>{const r=raw(cam.id),kind=cameraFrameKind(cam),labels=kind==='parking'?'停车场 · 车辆 · 出入口':kind==='street'?'道路 · 车辆 · 行人':'公共空间 · 人流 · 街景';return [camIdentity(cam)+'<span class="demo-tag">示例</span>',`<strong>${esc(r.analysis==='有结果'?labels:r.analysis)}</strong><small>${esc(cam.installationPosition||cam.district)} · 画面场景识别</small>`,r.candidates.length?r.candidates.map(c=>{const poi=city().pois.find(p=>p.id===c.id);return poi?`<strong>${esc(poi.name)}</strong><small>${esc(poi.category)} · ${esc(poi.district)} · 候选未挂载</small>`:''}).join(''):'<span class="ops-muted">暂无候选</span>',r.mounts.length?poiNames(r.mounts.filter(id=>r.sources[id]!=='ai_pre'))+(r.mounts.some(id=>r.sources[id]==='ai_pre')?'<small>含待采纳预挂</small>':''):'<span class="ops-muted">尚未挂载</span>',can('bindings')?btn('打开相机','ops-open-camera',cam.id,'small'):'<span class="ops-muted">只读</span>']}))}</section>`}
 function bindingsList(){const cams=filteredCameras('bindings');return top('个人版相机挂载',cams.length+' 路相机')+`<section class="box ops-panel"><div class="ops-toolbar"><span>一台相机一个操作区 · 保存后进入下一台</span><span class="demo-tag">全部操作修改本机示例数据</span></div>${tableHtml(['相机 / 示例','候选 POI / 示例','当前挂载 / 示例','状态 / 示例',''],cams.map(cam=>{const r=raw(cam.id),candidate=r.candidates.map(c=>city().pois.find(p=>p.id===c.id)?.name).filter(Boolean).join('、');return [camIdentity(cam)+'<span class="demo-tag">示例</span>',candidate||'暂无候选',poiNames(r.mounts),r.unmountable?'<span class="ops-status excluded">无法挂载</span>':r.mounts.length?'<span class="ops-status confirmed">已挂载</span>':'<span class="ops-status pending">待处理</span>',btn('打开相机','ops-open-camera',cam.id,'small ghost')]}))}</section>`}
 function poiChoice(p,selected,reason=''){
  return `<label class="ops-poi-choice ${selected?'selected':''}"><input type="checkbox" data-ops-poi="${esc(p.id)}" ${selected?'checked':''}><span><strong>${esc(p.name)}</strong><small>${esc(p.category)} · ${esc(p.district)} · ${esc(p.id)}</small>${reason?`<em>${esc(reason)}</em>`:''}</span></label>`
 }
 function framePanel(cam){const f=frameState();return `<section class="box ops-frame"><div class="ops-section-title"><h2>当前画面 <span class="demo-tag">AI 生成示意 · 非现场视频</span></h2><div class="ops-actions-inline">${badge(cam.state)}<button class="button small ghost" data-action="ops-enlarge-frame" aria-label="放大当前画面">放大</button></div></div><div class="ops-frame-image">${f.available?sceneImage(cameraFrameKind(cam)):`<div class="ops-frame-empty">${icon('camera')}<strong>当前无可核对画面</strong><small>请记录问题后再继续</small></div>`}<span class="scene-badge">AI 生成监控视角示意 · 非现场视频</span></div></section>`}
 function bindingDetail(){
  const cam=camera(state.detail.id),r=raw(cam.id),d=detail(),sequence=d.sequence,index=sequence.indexOf(cam.id),preMounts=r.mounts.filter(id=>r.sources[id]==='ai_pre'),candidatePois=r.candidates.map(c=>({poi:city().pois.find(p=>p.id===c.id),reason:c.reason})).filter(x=>x.poi),current=r.mounts.filter(id=>r.sources[id]!=='ai_pre'),shown=new Set([...preMounts,...current,...candidatePois.map(x=>x.poi.id)]),query=ui.poiQuery.trim().toLowerCase(),searchPois=query?city().pois.filter(p=>!shown.has(p.id)&&(p.name+' '+p.id+' '+p.address+' '+p.district).toLowerCase().includes(query)):[],excludedState=excluded(cam,r),hasNext=index<sequence.length-1,hasPrevious=index>0,unreviewedPre=preMounts.some(id=>!['accept','reject'].includes(d.preDecisions[id])),saveDisabled=!draftDirty()||!d.selected.length||unreviewedPre||!frameState().available||!r.candidatesComplete||r.hiddenRelations;
  const preRows=preMounts.map(poiId=>{const poi=city().pois.find(p=>p.id===poiId),decision=d.preDecisions[poiId]||'';return `<div class="ops-pre-row"><div><strong>${esc(poi?.name||'未知 POI')}</strong><small>AI 预挂 · 保存前需人工审核</small></div><div><button id="ops-pre-${esc(poiId)}-accept" class="button small ${decision==='accept'?'primary':'ghost'}" data-action="ops-pre-decision" data-id="${esc(cam.id+':'+poiId+':accept')}" aria-pressed="${decision==='accept'}">${decision==='accept'?'已采纳':'采纳'}</button><button id="ops-pre-${esc(poiId)}-reject" class="button small ${decision==='reject'?'danger':'ghost'}" data-action="ops-pre-decision" data-id="${esc(cam.id+':'+poiId+':reject')}" aria-pressed="${decision==='reject'}">${decision==='reject'?'已拒绝':'不采纳'}</button></div></div>`}).join('');
  const candidateRows=candidatePois.map(({poi,reason})=>poiChoice(poi,d.selected.includes(poi.id),reason)).join('');
  const currentRows=current.map(id=>{const poi=city().pois.find(p=>p.id===id);return poi?poiChoice(poi,d.selected.includes(id),'当前人工挂载 · 取消勾选可解除'):''}).join('');
  const searchRows=searchPois.map(p=>poiChoice(p,d.selected.includes(p.id))).join('');
  return `<div class="ops-record-heading"><div><span class="ops-kicker">个人版相机挂载 · ${esc(currentProject()?.name||'')}</span><h1>${esc(cam.name)}</h1><span>${esc(cam.id)} · ${esc(cam.installationPosition||'安装位置待完善')} · 示例相机</span></div><button id="ops-close-workspace" class="ops-close-workspace" data-action="ops-back" aria-label="关闭相机工作区">${icon('close')}</button></div>
  <div class="ops-workbench"><div class="ops-evidence">${framePanel(cam)}<section class="box ops-support"><div class="ops-camera-facts"><span>水印</span><strong>${esc(cam.cameraWatermark||cam.name)}</strong><span>安装位置</span><strong>${esc(cam.installationPosition||'待完善')}</strong><span>经纬度 · GCJ-02</span><strong>${esc(Number(cam.longitude).toFixed(6))}, ${esc(Number(cam.latitude).toFixed(6))}</strong><span>画面识别</span><strong>${esc(cameraFrameKind(cam)==='parking'?'停车场 · 车辆 · 出入口':'道路 / 公共空间 · 车辆 · 行人')}</strong></div><details><summary>分析依据</summary><p>${esc(r.analysisError||r.candidates.map(c=>c.reason).join('；')||'暂无可展示的分析依据')}</p></details></section></div>
  <section class="box ops-decisions"><div class="ops-section-title"><h2>核对挂载关系</h2><div class="ops-actions-inline">${statusBadge(status(cam))}<span>${current.length} 个已挂载 · ${preMounts.length} 个 AI 预挂</span></div></div>
  ${excludedState?`<div class="ops-excluded-bar"><span>此相机已设为不用于个人版</span>${can('bindings')?btn('恢复核对','ops-restore',cam.id,'small ghost'):''}</div>`:`${preMounts.length?`<section class="ops-relation-group ops-pre-mounts"><h3>待审核的 AI 预挂 <small>逐条采纳或拒绝</small></h3><p class="ops-pre-review-note">采纳或拒绝是本次审核选择；保存后才正式生效。</p>${preRows}</section>`:''}
  ${current.length?`<section class="ops-relation-group"><h3>已保存挂载 <small>取消勾选可解除</small></h3><div class="ops-choice-list">${currentRows}</div></section>`:''}
  <section class="ops-relation-group"><h3>分析候选 POI <small>勾选后纳入本次挂载审核</small></h3><div class="ops-choice-list">${candidateRows||'<p class="ops-muted">没有 AI 候选，可搜索添加同城 POI</p>'}</div></section>
  <section class="ops-poi-search"><h3>添加同城 POI</h3>${searchBox(ui.poiQuery,'poi','搜索 POI 名称、地址或编号')}${query?`<div class="ops-search-results">${searchRows||'<p class="ops-muted">没有匹配的其他 POI</p>'}</div>`:''}</section>
  <div class="ops-final-list"><h3>保存后挂载关系 <span>${d.selected.length} 个 POI</span></h3><p>${d.selected.length?esc(d.selected.map(id=>city().pois.find(p=>p.id===id)?.name||'').filter(Boolean).join('、')):'请选择至少一个 POI；若确实无法匹配，请标记无法挂载'}</p></div>
  ${r.unmountable?'<div class="ops-availability"><span class="ops-status excluded">上次标记：无法挂载</span></div>':''}${r.issue?`<div class="ops-current-issue"><strong>待处理问题 · ${esc(r.issue)}</strong>${r.note?`<p>${esc(r.note)}</p>`:''}<button class="button small ghost" data-action="ops-resolve-problem" data-id="${esc(cam.id)}">标记已解决</button></div>`:''}`}
  </section></div>
  <footer class="ops-action-dock"><div class="ops-navigation"><button class="button ghost small" data-action="ops-previous" ${hasPrevious?'':'disabled'}>上一台</button><span>${Math.max(0,index)+1} / ${sequence.length}</span><button class="button ghost small" data-action="ops-next" ${hasNext?'':'disabled'}>下一台</button></div>
  ${!excludedState?`<div class="ops-dock-tools">${btn('记录问题','ops-problem',cam.id,'small ghost')}${btn('不用于个人版','ops-exclude',cam.id,'small ghost')}${btn('标记无法挂载','ops-mark-unable',cam.id,'small ghost')}</div>`:''}
  <div class="ops-confirm"><p id="ops-detail-error" role="alert" class="ops-error">${esc(d.error||'')}</p>${!excludedState?`<div class="ops-save-actions">${hasNext?`<button class="button primary" id="ops-confirm-and-next" data-action="ops-confirm-and-next" data-id="${esc(cam.id)}" ${saveDisabled?'disabled':''}>保存并下一台</button>`:`<button class="button primary" id="ops-confirm-current" data-action="ops-confirm" data-id="${esc(cam.id)}" ${saveDisabled?'disabled':''}>确认并保存</button>`}</div>`:''}</div></footer>`
 }
 function cityRelations(){return visibleProjects().filter(p=>p.cityKey===store.session.city).flatMap(p=>camerasForProject(p).map(cam=>({...cam,projectName:p.name,ops:raw(cam.id)})))}
 function poiList(){const relations=cityRelations(),pois=city().pois.filter(p=>(!state.search||(p.name+' '+p.id).toLowerCase().includes(state.search.toLowerCase()))&&(state.poiDistrict==='all'||p.district===state.poiDistrict)&&(state.poiCategory==='all'||p.category===state.poiCategory)&&(state.poiProject==='all'||relations.some(c=>c.projectId===state.poiProject&&c.ops.mounts.includes(p.id))));return top('POI 运营',info().name,isEditor()?btn('补录 POI','ops-create-poi','','primary'):'')+`<section class="box ops-panel"><div class="ops-toolbar">${searchBox(state.search,'list','搜索 POI 名称或编号')}${optionFilter('区县','district',[['all','全部区县'],...info().districts.map(d=>[d,d])],state.poiDistrict)}${optionFilter('分类','category',[['all','全部分类'],...[...new Set(city().pois.map(p=>p.category))].map(c=>[c,c])],state.poiCategory)}${optionFilter('关联项目','project',[['all','全部授权项目'],...visibleProjects().filter(p=>p.cityKey===store.session.city).map(p=>[p.id,p.name])],state.poiProject)}</div>${tableHtml(['POI','分类','区县','授权关联相机','来源项目',''],pois.map(p=>{const linked=relations.filter(c=>c.ops.mounts.includes(p.id));return [`<strong>${esc(p.name)}</strong><small class="ops-source">${esc(p.id)}</small>`,esc(p.category),esc(p.district),linked.length+' 路',esc([...new Set(linked.map(c=>c.projectName))].join('、')||'—'),btn('查看 POI','ops-open-poi',p.id,'small ghost')]}),'没有匹配的 POI')}</section>`}
 function openPoi(id){if(!can('personalProfile')||!currentProject()||!city().pois.some(p=>p.id===id))return false;const origin=capture();state.route='personalProfile';state.detail={route:'personalProfile',id,view:'profile',ops:{origin,editing:false,expected:city().pois.find(p=>p.id===id).opsVersion||0}};render();window.scrollTo?.({top:0,behavior:'instant'});return true}
 function poiDetail(){const p=city().pois.find(p=>p.id===state.detail.id),d=state.detail.ops,linked=cityRelations().filter(c=>c.ops.mounts.includes(p.id));return `<div class="ops-record-heading"><button class="button ghost small" data-action="ops-back">${icon('chevron')} 返回 POI 运营</button><div><h1>${esc(p.name)}</h1><span>${esc(info().name+' · '+p.district+' · 示例 POI')}</span></div></div><section class="box ops-poi-profile"><dl><div><dt>分类 · 示例</dt><dd>${esc(p.category)}</dd></div><div><dt>位置 · 示例</dt><dd>${esc(p.address||p.district)}</dd></div><div><dt>来源</dt><dd>${esc(p.source||'示例地点目录')}</dd></div><div class="ops-wide"><dt>说明</dt><dd>${esc(p.description||'示例地点')}</dd></div></dl></section>${p.opsHistory?.length?`<details class="box ops-poi-history"><summary>操作记录 · ${p.opsHistory.length} 条</summary><ol>${p.opsHistory.map(item=>`<li><strong>${esc(item.action)}</strong><span>${esc(item.actor)} · ${esc(item.time)}</span></li>`).join('')}</ol></details>`:''}<section class="box ops-panel"><div class="ops-section-title"><h2>已挂载相机 <span class="demo-tag">示例关系</span></h2><span>${linked.length} 路</span></div>${tableHtml(['相机','来源项目','区县',''],linked.map(cam=>[esc(cam.name)+'<small class="ops-source">'+esc(cam.id)+'</small>',esc(cam.projectName),esc(cam.district),btn('查看挂载','ops-poi-camera',cam.projectId+':'+cam.id+':'+p.id,'small ghost')]),'当前没有已挂载相机',false)}</section>`}
 function beforeProjectSwitch(id){if(ui.bypass||!scope()||!draftDirty()||id===state.projectId)return false;leave(()=>{ui.bypass=true;openProject(id);ui.bypass=false});return true}
 function onAction(action,id){
  if(action==='ops-open-camera')return openCamera(id);
  if(action==='ops-open-poi')return openPoi(id);
  if(action==='ops-confirm'||action==='ops-confirm-and-next'){try{return confirm(id,action==='ops-confirm-and-next')}catch(error){formError(error.message);return false}}
  if(action==='ops-accept-pre'){const [cameraId,poiId]=id.split(':');try{return acceptPreMount(cameraId,poiId)}catch(error){formError(error.message);return false}}
  if(action==='ops-bind-manual'){try{return saveSelectedMount(id,document.getElementById('ops-manual-poi')?.value)}catch(error){formError(error.message);return false}}
  if(action==='ops-mark-unable'){try{return markUnable(id,document.getElementById('ops-unable-reason')?.value)}catch(error){formError(error.message);return false}}
  if(action==='ops-pre-decision'){const [cameraId,poiId,decision]=id.split(':');return decidePre(cameraId,poiId,decision)}
  if(action==='ops-previous')return move(-1);
  if(action==='ops-next')return move(1);
  if(action==='ops-back')return back();
  if(action==='ops-leave'){const callback=ui.leave;closeOverlay();ui.leave=null;callback?.();return true}
  if(action==='ops-status-filter'){ui.status=id;redraw();return true}
  if(action==='ops-clear-search'){if(id==='poi')ui.poiQuery='';else state.search='';redraw('ops-search-'+id);return true}
  if(action==='ops-reset-filters'){state.search='';ui.status=ui.issue=ui.analysis='all';state.poiDistrict=state.poiCategory=state.poiProject='all';redraw();return true}
  if(action==='ops-resolve-problem'){const d=detail();if(!d||state.detail.id!==id)return false;try{commitRecord(id,d.expected,'问题已解决',r=>{if(!r.issue)return false;r.issue='';r.note=''});d.expected=stamp(raw(id));redraw();notify('问题已标记解决 · 本机');return true}catch(error){formError(error.message);return false}}
  if(action==='ops-problem'){reasonDialog('problem');return true}
  if(action==='ops-exclude'){reasonDialog('exclude');return true}
  if(action==='ops-detach'){reasonDialog('detach');return true}
  if(action==='ops-restore'){try{return restoreCamera(id)}catch(error){formError(error.message);return false}}
  if(action==='ops-create-poi')return createPoi();
  if(action==='ops-enlarge-frame'){const f=frameState(),cam=camera(state.detail?.id);if(!f.available||!cam)return false;modal('frame',cam.name,`<div class="ops-frame-image">${sceneImage(cameraFrameKind(cam))}<span class="scene-badge">AI 生成监控视角示意 · 非现场视频 · ${f.date} ${minuteLabel(f.minute)}</span></div>`);document.getElementById('overlay').querySelector('.ops-modal')?.classList.add('ops-enlarged');return true}
  if(action==='ops-current-frame'){if(!detail())return false;detail().frameDate=CAMERA_EXAMPLE_DAY;detail().minute=null;redraw();return true}
  if(action==='ops-refresh-detail'){const d=detail();if(!d)return false;const r=raw(state.detail.id);d.expected=stamp(r);d.candidateIds=r.candidates.map(c=>c.id);d.error='';redraw();return true}
  if(action==='ops-base'){if(!can('cameras')||!detail())return false;ui.parked={detail:copy(state.detail),projectId:state.projectId,cityKey:store.session.city};base.navigate('cameras');base.openFrameworkDetail('cameras',id);return true}
  if(action==='ops-return-binding'){const parked=ui.parked;if(!parked||state.projectId!==parked.projectId||store.session.city!==parked.cityKey)return false;const action=()=>{state.route='bindings';state.detail=parked.detail;ui.parked=null;render()};if(state.route==='cameras'&&hasCameraDraftChanges()){leave(action);return false}action();return true}
  if(action==='ops-edit-poi'){if(!isEditor()||state.detail?.route!=='personalProfile')return false;const p=city().pois.find(p=>p.id===id);state.detail.ops.values={name:p.name,district:p.district,category:p.category,address:p.address||p.district,description:p.description||''};state.detail.ops.initial=copy(state.detail.ops.values);state.detail.ops.expected=p.opsVersion||0;state.detail.ops.editing=true;redraw('ops-poi-name');return true}
  if(action==='ops-cancel-poi'){if(state.detail?.route!=='personalProfile')return false;state.detail.ops.editing=false;redraw();return true}
  if(action==='ops-poi-camera'){const [projectId,camId,poiId]=id.split(':');if(!can('bindings')||!visibleProjects().some(p=>p.id===projectId&&p.cityKey===store.session.city))return false;state.projectId=projectId;return openCamera(camId,{route:'personalProfile',search:'',sequence:camerasForProject(currentProject()).map(c=>c.id),selectedPoiId:poiId})}
  return false;
 }
 projectAnalysisPage=analysisPage;
 bindingsPage=()=>state.detail?bindingDetail():bindingsList();
 cityPoiPage=()=>state.detail?poiDetail():poiList();
 moduleWorkspace=function(content){if(scope())return content;if(state.route==='cameras'&&ui.parked)return `<div class="ops-context-return">${btn('返回挂载核对','ops-return-binding','','ghost small')}</div>`+base.moduleWorkspace(content);return base.moduleWorkspace(content)};
 shell=function(content){const html=base.shell(content);if(!scope())return html;const targetPage=['projectAnalysis','bindings','personalProfile'].includes(state.route),clean=targetPage?html.replace('<span class="demo-tag">交互框架 · 示例数据</span>',''):html.replace('<span class="demo-tag">交互框架 · 示例数据</span>','<span class="demo-tag">示例数据 · 本机保存</span>');return clean.replace(/<footer class="page-foot">[\s\S]*?<\/footer>/,'').replace('<div class="sidebar-note">统一入口 · 独立迭代 · 按权访问</div>','')};
 render=function(){if(currentProject()&&scope())cityData();base.render()};
 dispatchAction=function(action,id=''){if(action==='sign-in'&&scope()&&draftDirty()){leave(()=>base.dispatchAction(action,id));return false}if(action.startsWith('ops-'))return onAction(action,id);if(action==='framework-binding')return openCamera(id);if(action==='framework-poi')return openPoi(id);if(action==='framework-back-list'&&scope())return back();return base.dispatchAction(action,id)};
 openFrameworkDetail=function(route,id){if(route==='bindings')return openCamera(id);if(route==='personalProfile')return openPoi(id);return base.openFrameworkDetail(route,id)};
 navigate=function(route,tab=''){if(!ui.bypass&&scope()&&draftDirty()){leave(()=>base.navigate(route,tab));return}base.navigate(route,tab)};
 closeOverlay=function(){const focus=ui.modal?.focus,element=ui.modal?.element;ui.modal=null;base.closeOverlay();if(element?.isConnected!==false&&element?.focus)element.focus({preventScroll:true});else if(focus)document.getElementById(focus)?.focus({preventScroll:true})};
 document.addEventListener('change',event=>{
  const t=event.target;
  if(t.dataset.opsPoi){selectPoi(t.dataset.opsPoi,t.checked);document.getElementById(t.id)?.focus({preventScroll:true});return}
  if(t.dataset.opsFilter){const k=t.dataset.opsFilter;if(k==='district')state.poiDistrict=t.value;else if(k==='category')state.poiCategory=t.value;else if(k==='project')state.poiProject=t.value;else ui[k]=t.value;redraw('ops-filter-'+k);return}
  const d=detail();if(!d||!t.dataset.opsChange)return;
  if(t.dataset.opsChange==='frame-date'){d.frameDate=t.value;d.minute=frameMinutesForDate(t.value)[0]??0}
  if(t.dataset.opsChange==='frame-minute'){const minutes=frameMinutesForDate(d.frameDate);if(minutes.length)d.minute=minutes.reduce((a,b)=>Math.abs(b-Number(t.value))<Math.abs(a-Number(t.value))?b:a)}
  redraw(t.id);
 });
 document.addEventListener('input',event=>{if(state.detail?.route==='personalProfile'&&state.detail.ops?.editing&&['name','district','category','address','description'].includes(event.target.name))state.detail.ops.values[event.target.name]=event.target.value});
 document.addEventListener('submit',event=>{
  const form=event.target;if(!['ops-search','ops-poi','ops-reason'].includes(form.dataset.form))return;event.preventDefault();const values=Object.fromEntries(new FormData(form));
  if(form.dataset.form==='ops-search'){if(form.dataset.kind==='poi')ui.poiQuery=String(values.q||'').trim();else state.search=String(values.q||'').trim();redraw('ops-search-'+form.dataset.kind);return}
  try{if(form.dataset.form==='ops-poi'){savePoi(values,form.dataset.id||'');return}
   const id=form.dataset.id,d=detail();if(!d||state.detail.id!==id)throw Error('当前相机已改变');
   if(form.dataset.kind==='exclude'){excludeCamera(id,values.reason);return}
   if(form.dataset.kind==='detach'){commitRecord(id,d.expected,'解除全部挂载',r=>{r.mounts=[];r.sources={};r.review=null});d.selected=[];d.initial=[];d.expected=stamp(raw(id));closeOverlay();redraw();notify('已解除挂载 · 本机');return}
   if(!['待补 POI','缺少核对画面','位置信息待修正','分析结果待检查'].includes(values.issue))throw Error('请选择问题');
   commitRecord(id,d.expected,'记录问题',r=>{r.issue=values.issue;r.note=String(values.reason||'').trim().slice(0,160)});d.expected=stamp(raw(id));d.selected=[...d.initial];closeOverlay();if(!move(1,true))redraw();notify('已记录问题 · 本机');
  }catch(error){formError(error.message)}
 });
 document.addEventListener('keydown',event=>{if(event.target.dataset?.opsChange!=='frame-minute'||!detail()||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const minutes=frameMinutesForDate(detail().frameDate),index=minutes.indexOf(detail().minute??642);if(!minutes.length)return;detail().minute=event.key==='Home'?minutes[0]:event.key==='End'?minutes[minutes.length-1]:minutes[Math.max(0,Math.min(minutes.length-1,index+(event.key==='ArrowLeft'?-1:1)))];redraw('ops-frame-seek')});
 function applyPreMountReview(record,prePoiId,decision,targetPoiId='',actor='',time=''){
  if(record.sources?.[prePoiId]!=='ai_pre')throw Error('AI 预挂记录已变化，请重新核对');
  if(!['accept','reject','switch'].includes(decision))throw Error('请选择有效的 AI 预挂审核结果');
  const target=decision==='accept'?prePoiId:decision==='switch'?targetPoiId:'';
  if(decision==='switch'&&(!target||target===prePoiId))throw Error('请选择要切换到的 POI');
  record.mounts=target?[...new Set([...record.mounts.filter(id=>id!==prePoiId),target])]:record.mounts.filter(id=>id!==prePoiId);
  record.sources={...(record.sources||{})};delete record.sources[prePoiId];if(target)record.sources[target]='manual';
  record.candidates=(record.candidates||[]).filter(item=>item.id!==prePoiId&&item.id!==target);
  record.decisions=record.decisions||{accepted:[],rejected:[]};
  const accepted=new Set(record.decisions.accepted||[]),rejected=new Set(record.decisions.rejected||[]);
  accepted.delete(prePoiId);rejected.delete(prePoiId);
  if(target){accepted.add(target);rejected.delete(target)}
  if(decision==='accept')accepted.add(prePoiId);else rejected.add(prePoiId);
  record.decisions.accepted=[...accepted];record.decisions.rejected=[...rejected];
  record.preReviewHistory=[{poiId:prePoiId,decision,targetPoiId:target||'',actor,time},...(record.preReviewHistory||[])].slice(0,40);
  record.unmountable=null;
  const reviewKey=keyOf(record.mounts),reviewVersion=(record.version||0)+1;
  record.review=target?{key:reviewKey,version:reviewVersion,candidateVersion:record.candidateVersion||0,usageVersion:record.usageVersion||0,actor,time}:record.mounts.length&&record.review?{...record.review,key:reviewKey,version:reviewVersion}:null;
  if(record.issue==='待补 POI'||record.issue==='无法挂载'){record.issue='';record.note=''}
  return record;
 }
 function saveMapPreReview(id,prePoiId,decision,targetPoiId=''){
  const cam=camera(id);if(!cam||!can('bindings'))throw Error('当前项目无法维护这台相机');
  if(targetPoiId&&!city().pois.some(p=>p.id===targetPoiId&&p.enabled!==false))throw Error('请选择有效 POI');
  const current=raw(id),expected=stamp(current),actor=role().person,time=timestamp(),actions={accept:'采纳 AI 预挂',reject:'不采纳 AI 预挂',switch:'切换 AI 预挂 POI'};
  commitRecord(id,expected,actions[decision]||'审核 AI 预挂',record=>applyPreMountReview(record,prePoiId,decision,targetPoiId,actor,time));return true;
 }
 function saveMapDecision(id,poiId='',reason=''){
  const cam=camera(id);if(!cam||!can('bindings'))throw Error('当前项目无法维护这台相机');
  if(poiId&&!city().pois.some(p=>p.id===poiId))throw Error('请选择有效 POI');
  reason=String(reason||'').trim();if(!poiId&&!reason)throw Error('请填写一句无法挂载原因');
  const current=raw(id),expected=stamp(current),chosen=poiId;
  commitRecord(id,expected,chosen?'确认挂载':'标记无法挂载',r=>{
   if(chosen){r.mounts=[...new Set([...r.mounts,chosen])];r.sources={...r.sources,[chosen]:'manual'};r.candidates=(r.candidates||[]).filter(item=>item.id!==chosen);r.unmountable=null;r.issue='';r.note='';r.decisions={accepted:[...new Set([...(r.decisions?.accepted||[]),chosen])],rejected:(r.decisions?.rejected||[]).filter(id=>id!==chosen)};r.review={key:keyOf(r.mounts),version:r.version+1,candidateVersion:r.candidateVersion,usageVersion:r.usageVersion,actor:role().person,time:timestamp()};}
   else{r.mounts=[];r.sources={};r.review=null;r.unmountable={reason,actor:role().person,time:timestamp()};r.issue='无法挂载';r.note=reason;}
  });return true;
 }
 window.SeeTimeOps={records:()=>projectCameras().map(cam=>({...cam,ops:raw(cam.id)})),record,status,limitations,openCamera,selectPoi,decidePre,confirm,saveMount:saveSelectedMount,markUnable,saveMapDecision,saveMapPreReview,exclude:excludeCamera,restore:restoreCamera,savePoi,onBaseValueChange,beforeProjectSwitch,prepareBaseSave,rollbackBaseSave,prepareSessionSave,afterCitySwitch};
 render();
})();
