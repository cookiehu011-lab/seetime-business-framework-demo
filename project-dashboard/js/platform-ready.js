if(dashboardContext){
 const saved=dashboardContext.saved;
 if(saved){Object.assign(state,saved.state);delete state.batch;$('#source').value=state.source;$('#source').onchange();$('#scenario').value=state.scenario;render();requestAnimationFrame(()=>scrollTo(0,saved.scroll||0))}
 const originalOpenDialog=openDialog;openDialog=function(...args){originalOpenDialog(...args);$('#detail-context').textContent='独立示例 · '+$('#detail-context').textContent};
 window.SeeTimeDashboard={snapshot:()=>({state:{...state},scroll:scrollY})};
}
