const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('分析配置迁移.js','utf8'),context);
test('legacy prompt versions and draft bodies migrate once without changing source tags',()=>{
 const legacy={tags:[{name:'自定义标签'}],prompts:[{id:'1',name:'测试',version:'v1.0',status:'已发布',content:'旧正文',logs:[{time:'2026-11-01',text:'旧日志'}]},{id:'2',name:'测试',version:'1.1',status:'草稿',content:'草稿正文',logs:[]}]};
 const before=JSON.stringify(legacy),data={prompts:[],tags:[]};
 const out=context.migrateSeeTimePrompts(data,legacy);
 assert.equal(out.prompts.length,1);assert.equal(out.prompts[0].active,'1.0');assert.equal(out.prompts[0].versions[1].published,false);assert.equal(out.prompts[0].versions[1].body,'草稿正文');assert.equal(out.prompts[0].logs[0].note,'旧日志');assert.equal(JSON.stringify(legacy),before);
 assert.equal(context.migrateSeeTimePrompts(out,legacy),out);
});
test('both entry pages reference integrated config and original editor parses',()=>{
 assert.equal(fs.readFileSync('index.html','utf8'),fs.readFileSync('SeeTime业务框架.html','utf8'));
 assert.match(fs.readFileSync('index.html','utf8'),/src="平台分析配置.js\?v=config-nav-20261109"/);
 const html=fs.readFileSync('分析配置.html','utf8');for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});
