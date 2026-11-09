if(dashboardContext){
 const banner=document.createElement('div');banner.className='platform-scope';
 const note=document.createElement('span');note.textContent='独立运营示例 · 固定模拟快照，非当前项目实际统计';banner.append(note);
 for(const [route,label] of dashboardContext.links){const button=document.createElement('button');button.textContent=label;button.onclick=()=>parent.SeeTimeDashboardHost.open(window,route);banner.append(button)}
 document.querySelector('main').prepend(banner);
 const saved=dashboardContext.saved;
 if(saved){Object.assign(state,saved.state);$('#source').value=state.source;$('#source').onchange();$('#batch').value=state.batch;$('#scenario').value=state.scenario;render();requestAnimationFrame(()=>scrollTo(0,saved.scroll||0))}
 const originalOpenDialog=openDialog;openDialog=function(...args){originalOpenDialog(...args);$('#detail-context').textContent='独立示例 · '+$('#detail-context').textContent};
 window.SeeTimeDashboard={snapshot:()=>({state:{...state},scroll:scrollY})};
}
