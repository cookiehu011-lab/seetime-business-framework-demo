/* Approved dashboard demo inside the existing project shell. */
(function(){
 'use strict';
 const saved=new Map(),links=[['cameras','基础相机列表'],['bindings','个人版相机挂载'],['govData','治理版配置']];
 let lastProject='';
 const frame=()=>document.getElementById('project-dashboard-frame');
 const permitted=()=>can('projectOverview')&&currentProject()&&visibleProjects().some(p=>p.id===currentProject().id);
 window.SeeTimeDashboardHost={
  context(source){const f=frame();return f&&f.contentWindow===source&&permitted()?{projectId:currentProject().id,links:links.filter(([route])=>can(route)),saved:saved.get(currentProject().id)||null}:null},
  open(source,route){if(frame()?.contentWindow!==source||!permitted()||!links.some(([id])=>id===route)||!can(route))return;navigate(route)}
 };
 projectOverviewPage=function(){
  const p=currentProject();if(!permitted())return noPermission();
  if(p.id!=='hz-public')return '<div class="page-heading"><h1>项目运营看板</h1></div><section class="box empty"><h2>此项目尚未配置看板示例数据</h2><p>当前仅杭州市公共空间项目提供独立运营示例；此提示不代表项目没有相机。</p>'+links.filter(([route])=>can(route)).map(([route,label])=>routeButton(label,route)).join(' ')+'</section>';
  return '<iframe id="project-dashboard-frame" data-project="'+esc(p.id)+'" title="项目运营看板 · 独立示例" src="project-dashboard/index.html?embed=1&v=20261109" style="display:block;width:100%;height:calc(100dvh - 105px);min-height:520px;border:0"></iframe>';
 };
 const style=document.createElement('style');style.textContent='.page:has(#project-dashboard-frame){max-width:none;padding:12px 16px 0}.page:has(#project-dashboard-frame)>.page-foot{display:none}';document.head.append(style);
 const previousRender=render;
 render=function(){
  const f=frame(),snapshot=f?.contentWindow?.SeeTimeDashboard?.snapshot();if(snapshot)saved.set(f.dataset.project,snapshot);
  const id=state.projectId||'';if(id&&lastProject&&id!==lastProject)saved.clear();if(id)lastProject=id;
  return previousRender();
 };
 // Resizing the sidebar must not recreate an open detail dialog or lose filters.
 window.addEventListener('click',event=>{const button=event.target.closest?.('[data-action="sidebar-toggle"]');if(!button||!frame())return;event.preventDefault();event.stopImmediatePropagation();state.sidebarCollapsed=!state.sidebarCollapsed;document.querySelector('.app-shell').classList.toggle('sidebar-collapsed',state.sidebarCollapsed);const label=state.sidebarCollapsed?'展开侧栏':'收起侧栏';button.setAttribute('aria-label',label);button.title=label;button.innerHTML=state.sidebarCollapsed?'›':'‹'},true);
 render();
})();
