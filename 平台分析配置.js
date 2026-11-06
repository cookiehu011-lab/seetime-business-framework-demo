/* Reuse the approved prompt editor inside the existing platform shell. */
(function(){
 'use strict';
 MODULES.analysisConfig={name:'分析配置',icon:'book',group:'platform'};
 PLATFORM_ROUTES.push('analysisConfig');
 for(const r of Object.values(ROLES))if(r.allowed.includes('personalAnalysisConfig'))r.allowed.push('analysisConfig');
 const previousRender=render;
 render=function(){
  if(state.route!=='analysisConfig')return previousRender();
  destroyCameraMap();
  document.getElementById('app').innerHTML=shell(can('analysisConfig')?'<iframe id="analysis-config-frame" title="分析配置：个人版与治理版提示词" src="分析配置.html?embed=1" style="display:block;width:100%;height:calc(100dvh - 160px);min-height:560px;border:0" ></iframe>':noPermission());
  document.title='分析配置 · SeeTime';
 };
 let replay=false;
 window.addEventListener('click',event=>{
  const frame=document.getElementById('analysis-config-frame');
  if(!frame)return;
  const button=event.target.closest?.('button');
  if(!button)return;
  if(button.dataset.action==='sidebar-toggle'){
   event.preventDefault();event.stopImmediatePropagation();
   state.sidebarCollapsed=!state.sidebarCollapsed;
   document.querySelector('.app-shell').classList.toggle('sidebar-collapsed',state.sidebarCollapsed);
   const label=state.sidebarCollapsed?'展开侧栏':'收起侧栏';
   button.setAttribute('aria-label',label);button.title=label;button.innerHTML=state.sidebarCollapsed?'›':'‹';
   return;
  }
  if(!button.dataset.route&&button.dataset.action!=='sign-in')return;
  const editor=frame.contentWindow?.SeeTimeConfig;
  if(!replay&&editor?.dirty()){
   event.preventDefault();event.stopImmediatePropagation();
   editor.requestLeave(()=>{replay=true;try{button.click()}finally{replay=false}});
  }
 },true);
 render();
})();
