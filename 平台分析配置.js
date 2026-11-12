/* Reuse the approved prompt editor inside the existing platform shell. */
(function(){
 'use strict';
 MODULES.personalAnalysisConfig.name='个人版标签库';
 MODULES.analysisConfig={name:'分析配置',icon:'book',group:'platform'};
 PLATFORM_ROUTES.push('analysisConfig');
 for(const r of Object.values(ROLES))if(r.allowed.includes('personalAnalysisConfig'))r.allowed.push('analysisConfig');
 const previousNavigate=navigate;
 navigate=function(route,tab=''){
  return previousNavigate(route==='personalAnalysisConfig'?'analysisConfig':route,route==='personalAnalysisConfig'?'tags':tab);
 };
 const configSections=()=>[['prompts','提示词管理'],...(can('personalAnalysisConfig')?[['tags','个人版标签库']]:[])].map(([id,label])=>`<button type="button" class="module-section-button ${((state.tab==='tags')===(id==='tags'))?'active':''}" data-route="analysisConfig" data-route-tab="${id}" ${((state.tab==='tags')===(id==='tags'))?'aria-current="page"':''}>${label}</button>`).join('');
 const previousNavItem=frameworkNavItem;
 frameworkNavItem=function(id,...args){
  if(id==='personalAnalysisConfig')return '';
  if(id!=='analysisConfig'||!can(id))return previousNavItem(id,...args);
  const active=state.route==='analysisConfig';
  return `<div class="nav-entry"><button id="module-nav-analysisConfig" class="nav-button ${active?'active':''}" data-route="analysisConfig" aria-label="分析配置" title="分析配置" aria-expanded="${active}">${icon('book')}<span>分析配置</span></button>${active?`<div class="module-subnav" role="group" aria-label="分析配置二级功能">${configSections()}</div>`:''}</div>`;
 };
 const style=document.createElement('style');
 style.textContent='.app-shell.sidebar-collapsed .config-secondary{display:flex}.config-secondary{gap:7px;overflow-x:auto;margin:0 0 16px}.config-secondary .module-section-button{border:1px solid #e5e7eb;padding:7px 12px}.config-secondary .active{border-color:#0ea5e9}';
 document.head.appendChild(style);
 const previousRender=render;
 render=function(){
  if(!['analysisConfig','personalAnalysisConfig'].includes(state.route))return previousRender();
  if(state.route==='personalAnalysisConfig'){state.route='analysisConfig';state.tab='tags'}
  const tags=state.tab==='tags';
  const allowed=can('analysisConfig')&&(!tags||can('personalAnalysisConfig'));
  destroyCameraMap();
  document.getElementById('app').innerHTML=shell(allowed?'<nav class="module-secondary-mobile config-secondary" aria-label="分析配置二级功能">'+configSections()+'</nav><iframe id="analysis-config-frame" title="'+(tags?'个人版标签库':'分析配置：个人版与治理版提示词')+'" src="分析配置.html?embed=1&page='+(tags?'tags':'prompts')+'&v=tag-focus-20261112" style="display:block;width:100%;height:calc(100dvh - 160px);min-height:560px;border:0" ></iframe>':noPermission());
  const label=tags?'个人版标签库':'提示词管理';
  document.querySelector('.crumb').insertAdjacentHTML('beforeend',icon('chevron')+'<strong aria-current="page">'+label+'</strong>');
  document.title=label+' · 分析配置 · SeeTime';
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
