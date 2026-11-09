const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const path=require('node:path');const root=path.join(__dirname,'..');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'js/data.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'js/metrics.js'),'utf8')+'\nthis.api={DemoData,Metrics};',ctx);
const {DemoData,Metrics}=ctx.api;let checks=0;
function check(fn){fn();checks++;}
for(const rows of [DemoData.cameras,DemoData.cameras.filter(c=>c.source==='社会接入'),DemoData.cameras.filter(c=>c.batch==='一期接入'),[]]){
 const g=Metrics.groups(rows);
 check(()=>assert.equal(g.governed.length+g.pending.length+g.unneeded.length,rows.length));
 check(()=>assert.equal(g.personalOnly.length+g.governanceOnly.length+g.both.length+g.neither.length,rows.length));
 for(const app of ['personal','governance']){
 check(()=>assert.equal(g[app+'Value'].length+g[app+'No'].length+g[app+'Unknown'].length,g.governed.length));
 check(()=>assert.equal(g[app+'Funnel'].length+g[app+'Outside'].length,g[app].length));
 check(()=>assert.ok(g[app+'Funnel'].every(c=>g[app+'Value'].includes(c))));
 }
 const day=Metrics.series(rows,'day','2026-11-09'),month=Metrics.series(rows,'month','2026-11-09');
 check(()=>assert.equal(day.reduce((a,b)=>a+b.total,0),month[8].total));
 check(()=>assert.equal(day[3].total,0));check(()=>assert.equal(day[6].missing,true));check(()=>assert.ok(day.slice(11).every(b=>b.future&&b.total===0)));
 check(()=>assert.ok(day.every(b=>b.success<=b.total)));
}
check(()=>assert.equal(Metrics.pct(0,0),'—'));
check(()=>assert.equal(Metrics.series([], 'week','2026-11-08')[0].time,'2026-11-02'));
console.log(`${checks} assertions passed: funnel sets, subscriptions, date boundaries, weighted counts, empty states.`);
