const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname,'../个人版地图运营.js'),'utf8');
function subject({saved=true,parking=false,next='c2'}={}) {
 const events=[],cam={id:'c1',projectId:'project'},ui={camera:{cameraId:'c1',completedCameraId:saved?'c1':'',selectedPoiId:'p1',poiCreateOpen:false,poiCreateName:'',reason:'',unableOpen:false},analysis:{profileDraft:null,calibration:null}};
 const context={ui,events,mountProjectCams:()=>[cam],confirmed:()=>saved?'p1':'',hasCameraProfileChanges:()=>false,currentProject:()=>({id:'project'}),nextUnprocessedId:()=>next,analysisProfile:()=>({elements:parking?['车位']:['人流']}),openParkingCalibration:()=>events.push('calibration'),render:()=>{},selectCamera:id=>events.push(context.hasMountDraftChanges()?'leave-dialog':'next:'+id)};
 vm.createContext(context);
 for(const name of ['hasMountDraftChanges','requestMountAction','executeMountAction']) {
  const declaration=source.split('\n').find(line=>line.startsWith(` function ${name}(`));
  assert.ok(declaration,`Missing function ${name}`);vm.runInContext(declaration,context);
 }
 context.requestCameraLeave=()=>{events.push('leave-dialog');return true};
 return {ui,context,events};
}
test('saved POI selection is not an unsaved change',()=>{
 const {context}=subject();assert.equal(context.hasMountDraftChanges(),false);
});
test('POI selection without an active camera does not count as a draft',()=>{
 const {context,ui}=subject();ui.camera.cameraId='';assert.equal(context.hasMountDraftChanges(),false);
});
test('opening a camera under a fixed POI does not create unsaved changes',()=>{
 const {context,ui}=subject({saved:false});ui.camera.entryMode='poi';ui.camera.targetPoiId='p1';assert.equal(context.hasMountDraftChanges(),false);
});
test('edits made in the fixed POI camera workspace still require leave confirmation',()=>{
 const {context,ui}=subject({saved:false});ui.camera.entryMode='poi';ui.camera.targetPoiId='p1';ui.analysis.profileDraft={cameraId:'c1'};context.hasCameraProfileChanges=()=>true;assert.equal(context.hasMountDraftChanges(),true);
});
test('completed mounting advances directly to the next camera',()=>{
 const {context,events}=subject();context.requestMountAction('next');assert.deepEqual(events,['next:c2']);
});
test('completed parking camera does not ask for calibration again',()=>{
 const {context,events}=subject({parking:true});context.requestMountAction('next');assert.deepEqual(events,['next:c2']);
});
test('a new unsaved POI selection still prompts before leaving',()=>{
 const {context,events,ui}=subject();ui.camera.selectedPoiId='p2';context.requestMountAction('next');assert.deepEqual(events,['leave-dialog']);
});
test('unsaved analysis edits still prompt before leaving',()=>{
 const {context,events,ui}=subject();ui.analysis.profileDraft={cameraId:'c1'};context.hasCameraProfileChanges=()=>true;context.requestMountAction('next');assert.deepEqual(events,['leave-dialog']);
});
test('unsaved new POI, reason and parking geometry remain protected',()=>{
 for(const edit of [s=>{s.camera.poiCreateOpen=true;s.camera.poiCreateName='新地点'},s=>{s.camera.unableOpen=true;s.camera.reason='遮挡'},s=>{s.analysis.calibration={dirty:true}}]){const {context,ui}=subject();edit(ui);assert.equal(context.hasMountDraftChanges(),true)}
});
test('no remaining camera does not navigate or open a dialog',()=>{
 const {context,events}=subject({next:''});context.requestMountAction('next');assert.deepEqual(events,[]);
});
