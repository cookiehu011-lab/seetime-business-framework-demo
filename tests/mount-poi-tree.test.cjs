const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'../个人版地图运营.js'),'utf8');const c=vm.createContext({});vm.runInContext(src.split('\n').find(l=>l.startsWith(' function mountPoiHierarchy(')),c);
const pois=[{id:'a',name:'根'},{id:'b',name:'子',parentId:'a'},{id:'c',name:'孙',parentId:'b'},{id:'d',name:'另一个子',parentId:'a'}];
test('recursive directory keeps direct children counts at each depth',()=>{const t=c.mountPoiHierarchy(pois);assert.equal(t.roots.length,1);assert.equal(t.children.get('a').length,2);assert.equal(t.children.get('b').length,1);assert.equal(t.children.get('c'),undefined)});
test('search keeps ancestor path without unrelated siblings',()=>{const t=c.mountPoiHierarchy(pois,'孙');assert.deepEqual([...t.visible].sort(),['a','b','c']);assert.equal(c.mountPoiHierarchy(pois,'missing').visible.size,0)});
test('missing parent is a root and no data is lost',()=>{const t=c.mountPoiHierarchy([{id:'x',name:'孤立',parentId:'missing'}]);assert.equal(t.roots[0].id,'x')});
