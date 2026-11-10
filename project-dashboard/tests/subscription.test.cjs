const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),ctx=vm.createContext({});
vm.runInContext(['data','metrics'].map(n=>fs.readFileSync(path.join(root,'js',n+'.js'),'utf8')).join('\n')+';this.api={DemoData,Metrics}',ctx);
const {DemoData,Metrics}=ctx.api;
for(const c of DemoData.cameras)for(const app of ['personal','governance'])if(c[app]){assert.equal(c.gov,'已治理');assert.equal(c[app+'Value'],'有价值');assert.ok(c[app==='personal'?'mounted':'configured']);}
const base={id:'1',gov:'已治理',personalValue:'有价值',governanceValue:'无价值',personal:false,governance:false,mounted:false,configured:false,basicInfoUsable:true,issues:[],online:'在线'};
let g=Metrics.groups([base]);assert.equal(g.mountPending.length,1);assert.equal(g.review.length,0);
const bad={...base,basicInfoUsable:false,issues:['基础信息错误','转动待核验','串流待核验']};
g=Metrics.groups([bad]);assert.equal(g.mountPending.length,0);assert.equal(g.review.length,1);assert.equal(Metrics.reviewReasons(bad).length,3);
for(const override of [{gov:'待治理'},{personalValue:'无价值'},{personalValue:'待评估'}])assert.equal(Metrics.groups([{...bad,...override}]).review.length,0);
assert.equal(Metrics.groups([{...base,issues:['拉流异常']}]).review.length,0);
assert.ok(Metrics.groups(DemoData.cameras).review.length>0);
console.log('subscription prerequisites, pending mounting and deduplicated review reasons passed');
