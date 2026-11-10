const Metrics = (() => {
  const pct=(n,d)=>d?`${(n/d*100).toFixed(1)}%`:'—';
  const reviewReasons=c=>[...(c.basicInfoUsable===false?['基础信息错误反馈']:[]),...c.issues.filter(x=>['转动待核验','串流待核验'].includes(x))];
  function groups(rows){
    const g={all:rows};
    const select=(key,fn)=>g[key]=rows.filter(fn);
    select('governed',c=>c.gov==='已治理'); select('pending',c=>c.gov==='待治理'); select('unneeded',c=>c.gov==='无需治理');
    for(const app of ['personal','governance']){
      select(`${app}Value`,c=>c.gov==='已治理'&&c[`${app}Value`]==='有价值');
      select(`${app}Funnel`,c=>c.gov==='已治理'&&c[`${app}Value`]==='有价值'&&c[app]&&c[app==='personal'?'mounted':'configured']);
      select(`${app}No`,c=>c.gov==='已治理'&&c[`${app}Value`]==='无价值');
      select(`${app}Unknown`,c=>c.gov==='已治理'&&c[`${app}Value`]==='待评估');
      select(`${app}Gap`,c=>c.gov==='已治理'&&c[`${app}Value`]==='有价值'&&!c[app]);
      select(`${app}Outside`,c=>c[app]&&!(c.gov==='已治理'&&c[`${app}Value`]==='有价值'&&c[app==='personal'?'mounted':'configured']));
      select(app,c=>c[app]);
    }
    select('bothNo',c=>c.gov==='已治理'&&c.personalValue==='无价值'&&c.governanceValue==='无价值');
    select('personalOnly',c=>c.personal&&!c.governance);select('governanceOnly',c=>c.governance&&!c.personal);select('both',c=>c.personal&&c.governance);select('neither',c=>!c.personal&&!c.governance);
    select('impact',c=>c.issues.length&&(c.personal||c.governance));
    select('mountPending',c=>c.gov==='已治理'&&c.personalValue==='有价值'&&c.basicInfoUsable!==false&&!c.mounted);
    select('configPending',c=>c.gov==='已治理'&&c.governanceValue==='有价值'&&c.basicInfoUsable!==false&&!c.configured);
    select('review',c=>c.gov==='已治理'&&(c.personalValue==='有价值'||c.governanceValue==='有价值')&&reviewReasons(c).length);
    select('online',c=>c.online==='在线');select('offline',c=>c.online==='离线');select('unknown',c=>c.online==='未知');
    select('stream',c=>c.issues.includes('拉流异常'));select('quality',c=>c.issues.includes('画面异常'));select('stale',c=>c.issues.includes('截帧超时'));select('rotation',c=>c.issues.includes('转动待核验'));
    select('mounted',c=>c.mounted);select('configured',c=>c.configured);select('personalRunning',c=>c.mounted&&!c.issues.length&&c.online==='在线');select('governanceRunning',c=>c.configured&&!c.issues.length&&c.online==='在线');select('personalUnknownRun',c=>c.mounted&&!c.issues.length&&c.online!=='在线');select('governanceUnknownRun',c=>c.configured&&!c.issues.length&&c.online!=='在线');select('personalAbnormal',c=>c.mounted&&c.issues.length);select('governanceAbnormal',c=>c.configured&&c.issues.length);
    return g;
  }
  function series(rows,mode,date){
    const chosen=new Date(`${date}T00:00:00+08:00`), end=new Date(DemoData.snapshot);
    let start=new Date(chosen),n=24,step=3600000;
    if(mode==='week'){const weekday=new Date(chosen.getTime()+8*3600000).getUTCDay();start=new Date(chosen.getTime()-((weekday+6)%7)*86400000);n=7;step=86400000;}
    if(mode==='month'){start=new Date(`${date.slice(0,7)}-01T00:00:00+08:00`);n=new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),0).getDate();step=86400000;}
    return Array.from({length:n},(_,k)=>{
      const time=new Date(start.getTime()+k*step),future=time>end;
      const local=new Date(time.getTime()+8*3600000).toISOString();
      const label=mode==='day'?`${String(k).padStart(2,'0')}:00`:local.slice(5,10);
      const noRequests=mode==='day'&&k===3,missing=mode==='day'&&k===6;
      const hours=mode==='day'?[time]:Array.from({length:24},(_,hour)=>new Date(time.getTime()+hour*3600000));
      const records=rows.map(c=>{
        const sum={camera:c,requests:0,success:0,failed:0,missed:0};
        hours.forEach(hour=>{
          const localHour=new Date(hour.getTime()+8*3600000).getUTCHours();
          if(hour>end||localHour===3||localHour===6)return;
          const seed=c.index+Math.floor(hour.getTime()/3600000);
          const requests=8+seed%9;
          const failureDivisor=localHour===8?3:localHour===9?5:9;
          const failed=seed%failureDivisor===0?2+seed%4:0;
          sum.requests+=requests;sum.failed+=failed;sum.success+=requests-failed;sum.missed+=seed%19===0?2:0;
        });return sum;
      });
      const total=records.reduce((a,r)=>a+r.requests,0),success=records.reduce((a,r)=>a+r.success,0);
      return {label,time:local.slice(0,10)+(mode==='day'?' '+label:''),future,missing:missing&&!future,noRequests:noRequests&&!future,records,total,success,rate:total?success/total*100:null};
    });
  }
  function range(rows,start,end){
    const days=[];
    for(let time=Date.parse(start+'T00:00:00+08:00');time<=Date.parse(end+'T00:00:00+08:00');time+=86400000){
      const date=new Date(time+8*3600000).toISOString().slice(0,10);
      const hours=series(rows,'day',date).filter(b=>!b.future);
      if(start===end)return hours;
      const records=rows.map(c=>hours.reduce((sum,b)=>{const r=b.records.find(r=>r.camera.id===c.id);for(const k of ['requests','success','failed','missed'])sum[k]+=r[k];return sum;},{camera:c,requests:0,success:0,failed:0,missed:0}));
      const total=records.reduce((n,r)=>n+r.requests,0),success=records.reduce((n,r)=>n+r.success,0);
      days.push({label:date.slice(5),time:date,records,total,success,rate:total?success/total*100:null});
    }
    return days;
  }
  function tasks(rows,app,start,end){
    const snapshot=Date.parse(DemoData.snapshot),last=Math.min(Date.parse(end+'T00:00:00+08:00')+86400000,snapshot);
    return rows.filter(c=>app==='personal'?c.mounted:c.configured).map(c=>{
      const r={camera:c,success:0,failed:0,output:0};
      for(let t=Date.parse(start+'T00:00:00+08:00');t+3600000<=last;t+=3600000){
        const seed=Math.floor(t/3600000)+c.index+(app==='personal'?0:7);
        if(seed%17===0)r.failed++;else {r.success++;r.output+=app==='personal'?1:seed%3;}
      }
      return r;
    });
  }
  return {pct,groups,series,range,tasks,reviewReasons};
})();
