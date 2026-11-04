const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../个人版地图运营.js'), 'utf8');

function loadFunction(name, context) {
  const declaration = source.split('\n').find(line => line.startsWith(` function ${name}(`));
  assert.ok(declaration, `Missing function ${name}`);
  vm.runInContext(declaration, context);
}

function worksetContext(records, manual = {}) {
  const context = {
    rec: camera => records[camera.id] || { mounts: [], sources: {}, candidates: [] },
    confirmed: camera => manual[camera.id] || ''
  };
  vm.createContext(context);
  loadFunction('poiWorksetFor', context);
  return context;
}

test('POI workset separates manual, AI pre-mount and candidate states', () => {
  const cameras = [{ id: 'manual' }, { id: 'pre' }, { id: 'candidate' }];
  const context = worksetContext({
    pre: { mounts: ['p1'], sources: { p1: 'ai_pre' }, candidates: [] },
    candidate: { mounts: [], sources: {}, candidates: [{ id: 'p1' }] }
  }, { manual: 'p1' });
  const result = context.poiWorksetFor({ id: 'p1' }, cameras);
  assert.deepEqual(Array.from(result.completed, camera => camera.id), ['manual']);
  assert.deepEqual(Array.from(result.pendingReview, camera => camera.id), ['pre']);
  assert.deepEqual(Array.from(result.pendingMount, camera => camera.id), ['candidate']);
  assert.equal(result.total, 3);
  assert.equal(result.total, result.completed.length + result.pendingMount.length + result.pendingReview.length);
});

test('POI workset counts each camera once per POI and excludes closed unable candidates', () => {
  const camera = { id: 'multi' };
  const context = worksetContext({ multi: { mounts: [], sources: {}, candidates: [{ id: 'p1' }, { id: 'p1' }, { id: 'p2' }] } });
  const p1 = context.poiWorksetFor({ id: 'p1' }, [camera, camera]);
  const p2 = context.poiWorksetFor({ id: 'p2' }, [camera]);
  assert.equal(p1.pendingMount.length, 1);
  assert.equal(p2.pendingMount.length, 1);
  assert.equal(p1.total, 1);

  context.rec = () => ({ mounts: [], sources: {}, candidates: [{ id: 'p1' }], unmountable: { reason: '遮挡' } });
  const closed = context.poiWorksetFor({ id: 'p1' }, [camera]);
  assert.equal(closed.completed.length, 0);
  assert.equal(closed.pendingMount.length, 0);
  assert.equal(closed.total, 0);
});

test('empty POI workset reports zero progress without adding nearby cameras', () => {
  const context = worksetContext({ nearby: { mounts: [], sources: {}, candidates: [] } });
  const result = context.poiWorksetFor({ id: 'p1' }, [{ id: 'nearby' }]);
  assert.equal(result.total, 0);
  assert.equal(result.percent, 0);
});

test('project POI fallback search is empty until a query and matches name or ID', () => {
  const context = {};
  vm.createContext(context);
  loadFunction('mountProjectPoiSearch', context);
  const pois = [{ id: 'p1', name: '湖滨步行街' }, { id: 'p2', name: '远处停车场' }];
  assert.equal(context.mountProjectPoiSearch('', pois).length, 0);
  assert.deepEqual(Array.from(context.mountProjectPoiSearch('停车', pois), poi => poi.id), ['p2']);
  assert.deepEqual(Array.from(context.mountProjectPoiSearch('p1', pois), poi => poi.id), ['p1']);
});

test('POI entry target cannot be replaced by a picker selection', () => {
  const context = { ui: { camera: { entryMode: 'poi', targetPoiId: 'p1' } } };
  vm.createContext(context);
  loadFunction('mountTargetId', context);
  assert.equal(context.mountTargetId('p2'), 'p1');
  context.ui.camera.entryMode = 'camera';
  assert.equal(context.mountTargetId('p2'), 'p2');
});

test('selecting a camera from the POI workset advances past camera selection', () => {
  const selection = source.match(/function selectCameraFromPoi\([^\n]+/);
  assert.ok(selection);
  assert.match(selection[0], /ui\.camera\.workflowStep=2/);
});

test('mount picker removes the project-all tab and POI entry renders a fixed target', () => {
  assert.doesNotMatch(source, /role="tab" id="mount-tab-all"/);
  assert.match(source, /mountProjectPoiSearch/);
  assert.match(source, /s\.entryMode==='poi'\?`\$\{cameraProfileSection\(cam\)\}\$\{mountScene\(cam\)\}\$\{mountCurrentTarget/);
  assert.match(source, /if\(ui\.camera\.entryMode==='poi'\)poiId=ui\.camera\.targetPoiId/);
  assert.match(source, /if\(ui\.camera\.entryMode==='poi'\)return/);
});

test('POI status cards filter mounted, pending and nearby cameras', () => {
  assert.match(source, /summary=\[\['mounted','已挂载'/);
  assert.match(source, /已挂载 <b>\$\{progress\.completed\.length\}\/\$\{progress\.total\}/);
  assert.match(source, /\['pending','待确认'/);
  assert.match(source, /\['nearby','附近相机'/);
  assert.match(source, /\['all','mounted','pending','nearby'\]\.includes\(id\)/);
  assert.match(source, /filter==='nearby'\?'open':''/);
  assert.match(source, /附近未匹配相机不计入进度/);
  assert.match(source, /已挂载 \$\{progress\.completed\.length\}\/\$\{progress\.total\}/);
  assert.match(source, /<span>关联相机<\/span>/);
  assert.match(source, /groups\.filter\(\(\[, ,rows\]\)=>rows\.length&&/);
});
