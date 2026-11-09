const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'js/data.js'),'utf8')+fs.readFileSync(path.join(root,'js/metrics.js'),'utf8')+';this.api={DemoData,Metrics}',ctx);
const {DemoData,Metrics}=ctx.api,rows=DemoData.cameras;
const before=JSON.stringify(Metrics.groups(rows));
const sum=(xs,key)=>xs.reduce((n,x)=>n+x[key],0);
const days=Metrics.range(rows,'2026-11-03','2026-11-09');
assert.equal(days.length,7);
assert.equal(sum(days,'total'),['03','04','05','06','07','08','09'].reduce((n,d)=>n+sum(Metrics.range(rows,'2026-11-'+d,'2026-11-'+d),'total'),0));
assert.equal(Metrics.range(rows,'2026-11-09','2026-11-09').at(-1).time,'2026-11-09 10:00');
assert.equal(Metrics.range(rows,'2026-10-30','2026-11-02').length,4);
for(const app of ['personal','governance']){
 const seven=Metrics.tasks(rows,app,'2026-11-03','2026-11-09');
 for(const key of ['success','failed','output'])assert.equal(sum(seven,key),['03','04','05','06','07','08','09'].reduce((n,d)=>n+sum(Metrics.tasks(rows,app,'2026-11-'+d,'2026-11-'+d),key),0));
 const today=Metrics.tasks(rows,app,'2026-11-09','2026-11-09');assert.ok(today.every(r=>r.success+r.failed===10));
 const historical=Metrics.tasks(rows,app,'2026-11-02','2026-11-02');assert.ok(historical.every(r=>r.success+r.failed===24));
 assert.equal(Metrics.tasks([],app,'2026-11-03','2026-11-09').length,0);
}
assert.equal(JSON.stringify(Metrics.groups(rows)),before);
assert.equal(sum(Metrics.range([],'2026-11-03','2026-11-09'),'total'),0);
console.log('Time scope checks passed: date boundaries, partial day, range aggregation, task totals, current-state isolation and empty data.');
