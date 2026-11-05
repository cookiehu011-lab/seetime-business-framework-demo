const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mapSource = fs.readFileSync(path.join(root, '个人版地图运营.js'), 'utf8');
const opsSource = fs.readFileSync(path.join(root, '个人版数据运营.js'), 'utf8');

function load(source, name, context) {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line.startsWith(` function ${name}(`));
  assert.notEqual(start, -1, `Missing function ${name}`);
  let depth = 0;
  const declaration = [];
  for (const line of lines.slice(start)) {
    declaration.push(line);
    depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
    if (depth === 0) break;
  }
  vm.runInContext(declaration.join('\n'), context);
}

test('POI preview expands evidence without changing the selected POI', () => {
  const context = { ui: { camera: { selectedPoiId: 'p1', expandedPoiId: '' } }, cityPois: () => [{ id: 'p2' }], render() {} };
  vm.createContext(context);
  load(mapSource, 'togglePoiPreview', context);
  context.togglePoiPreview('p2');
  assert.equal(context.ui.camera.selectedPoiId, 'p1');
  assert.equal(context.ui.camera.expandedPoiId, 'p2');
  context.togglePoiPreview('p2');
  assert.equal(context.ui.camera.expandedPoiId, '');
});

test('queue summary exposes both AI pre-mount and multiple candidate POIs', () => {
  const context = { rec: () => ({ mounts: ['p3'], sources: { p3: 'ai_pre' }, candidates: [{ id: 'p1' }, { id: 'p2' }] }) };
  vm.createContext(context);
  load(mapSource, 'mountCandidateSummary', context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.mountCandidateSummary({}))), { aiPre: 1, candidates: 2, total: 3 });
});

test('POI progress empty state avoids a misleading zero over zero percentage', () => {
  const context = {};
  vm.createContext(context);
  load(mapSource, 'mountProgressText', context);
  assert.equal(context.mountProgressText({ total: 0, completed: [] }), '暂无挂载工作项');
  assert.match(context.mountProgressText({ total: 2, completed: [{}, {}], percent: 100 }), /已挂载 2\/2（100%）/);
});

test('candidate evidence explains the relation using scene description', () => {
  const context = {
    analysisProfile: () => ({ scene: '停车场、车辆通行空间', tags: ['车辆', '泊位'] }),
    position: () => [120, 30], poiPoint: () => [120.001, 30], distance: () => 100,
    distanceText: () => '100 米', poiLabel: poi => poi.category
  };
  vm.createContext(context);
  load(mapSource, 'poiEvidence', context);
  const evidence = context.poiEvidence({ name: '相机', installationPosition: '', cameraWatermark: '' }, { name: '东侧停车场', category: '停车场' });
  assert.match(evidence.reason, /画面描述「停车场、车辆通行空间」/);
  assert.doesNotMatch(evidence.reason, /画面元素/);
});

test('AI pre-mount rejection removes the suggestion but preserves alternatives and history', () => {
  const context = { keyOf: values => [...new Set(values)].sort().join('|') };
  vm.createContext(context);
  load(opsSource, 'applyPreMountReview', context);
  const record = { mounts: ['p3'], sources: { p3: 'ai_pre' }, candidates: [{ id: 'p1' }, { id: 'p2' }], decisions: { accepted: [], rejected: [] }, history: [] };
  context.applyPreMountReview(record, 'p3', 'reject', '', '运营员', '2026-11-04 10:00');
  assert.deepEqual(Array.from(record.mounts), []);
  assert.deepEqual(Array.from(record.candidates, item => item.id), ['p1', 'p2']);
  assert.deepEqual(Array.from(record.decisions.rejected), ['p3']);
  assert.equal(record.preReviewHistory[0].decision, 'reject');
});

test('fixture pre-mount switch preserves an already mounted POI', () => {
  const context = {};
  vm.createContext(context);
  load(mapSource, 'applyFixturePreReviewRecord', context);
  const record = { mounts: ['p1', 'p3'], sources: { p1: 'manual', p3: 'ai_pre' }, candidates: [{ id: 'p2' }] };
  context.applyFixturePreReviewRecord(record, 'p3', 'switch', 'p2', '运营员', '2026-11-04 10:00');
  assert.deepEqual(Array.from(record.mounts), ['p1', 'p2']);
  assert.deepEqual(JSON.parse(JSON.stringify(record.sources)), { p1: 'manual', p2: 'manual' });
  assert.equal(record.review.key, 'p1|p2');
});

test('accepting or switching an AI pre-mount preserves other confirmed POI relations', () => {
  const context = { keyOf: values => values.join('|') };
  vm.createContext(context);
  load(opsSource, 'applyPreMountReview', context);
  const accepted = { mounts: ['p1', 'p3'], sources: { p1: 'manual', p3: 'ai_pre' }, candidates: [{ id: 'p2' }], decisions: { accepted: ['p1'], rejected: [] } };
  context.applyPreMountReview(accepted, 'p3', 'accept', '', '运营员', '2026-11-04 10:00');
  assert.deepEqual(Array.from(accepted.mounts), ['p1', 'p3']);
  assert.deepEqual(JSON.parse(JSON.stringify(accepted.sources)), { p1: 'manual', p3: 'manual' });

  const switched = { mounts: ['p1', 'p3'], sources: { p1: 'manual', p3: 'ai_pre' }, candidates: [{ id: 'p2' }] };
  context.applyPreMountReview(switched, 'p3', 'switch', 'p2', '运营员', '2026-11-04 10:00');
  assert.deepEqual(Array.from(switched.mounts), ['p1', 'p2']);
  assert.deepEqual(JSON.parse(JSON.stringify(switched.sources)), { p1: 'manual', p2: 'manual' });
});

test('switching to a previously rejected POI clears its rejection decision', () => {
  const context = { keyOf: values => [...new Set(values)].sort().join('|') };
  vm.createContext(context);
  load(opsSource, 'applyPreMountReview', context);
  const record = { mounts: ['p3'], sources: { p3: 'ai_pre' }, candidates: [], decisions: { accepted: ['p1'], rejected: ['p2'] } };
  context.applyPreMountReview(record, 'p3', 'switch', 'p2', '运营员', '2026-11-05 10:00');
  assert.deepEqual(Array.from(record.decisions.accepted), ['p1', 'p2']);
  assert.deepEqual(Array.from(record.decisions.rejected), ['p3']);
});

test('rejecting a previously accepted AI pre-mount leaves it only in rejected decisions', () => {
  const context = { keyOf: values => [...new Set(values)].sort().join('|') };
  vm.createContext(context);
  load(opsSource, 'applyPreMountReview', context);
  const record = { mounts: ['p3'], sources: { p3: 'ai_pre' }, candidates: [], decisions: { accepted: ['p3'], rejected: ['p1'] } };
  context.applyPreMountReview(record, 'p3', 'reject', '', '运营员', '2026-11-05 10:00');
  assert.deepEqual(Array.from(record.decisions.accepted), []);
  assert.deepEqual(Array.from(record.decisions.rejected), ['p1', 'p3']);
});

test('mount queue decision records are project-scoped and leave camera mounting data unchanged', () => {
  const context = {};
  vm.createContext(context);
  load(mapSource, 'mountQueueOutcomeKey', context);
  load(mapSource, 'buildMountQueueDecision', context);
  load(mapSource, 'putMountQueueDecision', context);
  context.store = { session: { city: 'hz' } };
  const camera = { projectId: 'hz-public', id: 'HZ-C01' };
  const records = {};
  const cameraRecord = { mounts: ['p1'], review: { key: 'p1' }, unmountable: null };
  const key = context.mountQueueOutcomeKey(camera);
  context.putMountQueueDecision(records, key, 'no_value', { reason: '画面不属于目标场景' }, '运营员', '2026-11-05T10:00:00Z');
  assert.equal(records[key].status, 'excluded');
  assert.deepEqual(cameraRecord, { mounts: ['p1'], review: { key: 'p1' }, unmountable: null });
  assert.equal(context.mountQueueOutcomeKey({ ...camera, projectId: 'hz-pilot' }), 'hz:hz-pilot:HZ-C01');
  assert.equal(context.mountQueueOutcomeKey({ ...camera, id: 'SH-C01' }), 'hz:hz-public:SH-C01');
});

test('queue outcome persistence failure leaves the stored decision unchanged', () => {
  const initial = { 'hz:hz-public:HZ-C01': { type: 'no_value', reason: '旧记录' } };
  const context = {
    store: { session: { city: 'hz' } },
    localStorage: {
      getItem: () => JSON.stringify(initial),
      setItem: () => { throw new Error('storage unavailable'); }
    }
  };
  vm.createContext(context);
  load(mapSource, 'mountQueueOutcomeKey', context);
  load(mapSource, 'buildMountQueueDecision', context);
  load(mapSource, 'putMountQueueDecision', context);
  load(mapSource, 'readMountQueueOutcomes', context);
  load(mapSource, 'saveMountQueueOutcome', context);
  assert.throws(() => context.saveMountQueueOutcome({ projectId: 'hz-public', id: 'HZ-C01' }, 'basic_feedback', { field: '安装位置', note: '安装位置不符' }), /未能保存/);
  assert.equal(context.readMountQueueOutcomes()['hz:hz-public:HZ-C01'].reason, '旧记录');
});

test('queue outcome persistence round-trips a successful decision through local storage', () => {
  const storage = new Map();
  const context = {
    store: { session: { city: 'hz' } },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    }
  };
  vm.createContext(context);
  load(mapSource, 'mountQueueOutcomeKey', context);
  load(mapSource, 'buildMountQueueDecision', context);
  load(mapSource, 'putMountQueueDecision', context);
  load(mapSource, 'readMountQueueOutcomes', context);
  load(mapSource, 'saveMountQueueOutcome', context);
  load(mapSource, 'isMountQueueOutcomeProcessed', context);
  const outcome = context.saveMountQueueOutcome({ projectId: 'hz-public', id: 'HZ-C01' }, 'basic_feedback', { field: '安装位置', note: '安装位置与画面不符' });
  assert.equal(outcome.status, 'pending_review');
  assert.equal(context.isMountQueueOutcomeProcessed(context.readMountQueueOutcomes()['hz:hz-public:HZ-C01']), true);
});

test('queue advances cyclically to the next pending camera and returns null only when all are done', () => {
  const context = {};
  vm.createContext(context);
  load(mapSource, 'nextQueueCameraAfter', context);
  const cameras = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
  assert.equal(context.nextQueueCameraAfter(cameras, 'c1', cam => cam.id !== 'c3').id, 'c3');
  assert.equal(context.nextQueueCameraAfter(cameras, 'c3', cam => cam.id !== 'c1').id, 'c1');
  assert.equal(context.nextQueueCameraAfter(cameras, 'c3', () => true), null);
});

test('basic camera information feedback stays pending review and does not overwrite the camera record', () => {
  const context = {};
  vm.createContext(context);
  load(mapSource, 'buildMountQueueDecision', context);
  const decision = context.buildMountQueueDecision('basic_feedback', { field: '安装位置', note: '安装位置与画面不符' }, '运营员', '2026-11-05T10:00:00Z');
  assert.equal(decision.status, 'pending_review');
  assert.equal(decision.field, '安装位置');
  assert.equal(decision.note, '安装位置与画面不符');
  assert.throws(() => context.buildMountQueueDecision('no_value', { reason: '  ' }, '运营员', 'now'), /填写/);
  assert.throws(() => context.buildMountQueueDecision('basic_feedback', { field: '未知字段', note: '待核对' }, '运营员', 'now'), /选择/);
});

test('mount queue completion distinguishes mounted, no-value and feedback outcomes', () => {
  const context = {};
  vm.createContext(context);
  load(mapSource, 'isMountQueueOutcomeProcessed', context);
  load(mapSource, 'mountOutcomeSuccessMessage', context);
  assert.equal(context.isMountQueueOutcomeProcessed(null), false);
  assert.equal(context.isMountQueueOutcomeProcessed({ type: 'no_value', status: 'excluded' }), true);
  assert.equal(context.isMountQueueOutcomeProcessed({ type: 'basic_feedback', status: 'pending_review' }), true);
  assert.match(context.mountOutcomeSuccessMessage('no_value', { name: '相机 A' }, { name: '相机 B' }, 2, 5), /相机 B（第 2\/5 台）/);
  assert.match(context.mountOutcomeSuccessMessage('no_value', { name: '相机 E' }, { name: '相机 A' }, 1, 5, 5), /队列前部未处理相机/);
  const lastMessage = context.mountOutcomeSuccessMessage('basic_feedback', { name: '相机 A' }, null, 1, 1);
  assert.match(lastMessage, /本项目已无待处理相机/);
});

test('camera review offers terminal actions with clear auto-next guidance and preserves processed status', () => {
  const context = {
    ui: { camera: { mountOutcomeDraft: null } },
    mountQueueOutcome: () => null,
    rec: () => ({}),
    mountProjectCams: () => [{ id: 'c1' }, { id: 'c2' }],
    processed: () => false,
    nextQueueCameraAfter: (cameras, currentId, isDone) => {
      const index = cameras.findIndex(camera => camera.id === currentId);
      return [...cameras.slice(index + 1), ...cameras.slice(0, index)].find(camera => !isDone(camera)) || null;
    },
    escape: value => String(value ?? '')
  };
  vm.createContext(context);
  load(mapSource, 'mountQueueOutcomeConfirmation', context);
  load(mapSource, 'mountQueueOutcomeActions', context);
  const actions = context.mountQueueOutcomeActions({ id: 'c1' });
  assert.match(actions, /标记相机无价值/);
  assert.match(actions, /反馈相机基础信息/);
  assert.match(actions, /提交成功后自动进入下一台/);
  assert.match(actions, /全部处理完成后返回待处理队列/);
  context.mountQueueOutcome = () => ({ type: 'basic_feedback', field: '安装位置', note: '安装位置与画面不符', status: 'pending_review' });
  const processed = context.mountQueueOutcomeActions({ id: 'c1' });
  assert.match(processed, /基础信息反馈已提交/);
  assert.match(processed, /安装位置与画面不符/);
  assert.doesNotMatch(processed, /标记相机无价值|反馈相机基础信息/);
  context.mountQueueOutcome = () => null;
  context.rec = () => ({ unmountable: { reason: '遮挡' } });
  const unable = context.mountQueueOutcomeActions({ id: 'c1' });
  assert.match(unable, /已标记无法挂载/);
  assert.doesNotMatch(unable, /标记相机无价值|反馈相机基础信息/);
  context.rec = () => ({});
  context.ui.camera.mountOutcomeDraft = { cameraId: 'c1', type: 'no_value' };
  const noValueForm = context.mountQueueOutcomeActions({ id: 'c1' });
  assert.match(noValueForm, /textarea name="reason" maxlength="80" required/);
  assert.match(noValueForm, /标记并进入下一台/);
  context.ui.camera.mountOutcomeDraft = { cameraId: 'c1', type: 'basic_feedback' };
  const feedbackForm = context.mountQueueOutcomeActions({ id: 'c1' });
  assert.match(feedbackForm, /select name="field" required/);
  assert.match(feedbackForm, /textarea name="note" maxlength="160" required/);
  context.mountProjectCams = () => [{ id: 'c1' }];
  assert.match(context.mountQueueOutcomeActions({ id: 'c1' }), /提交反馈并返回待处理列表/);
});

test('terminal outcome controls appear only during camera information review', () => {
  const start = mapSource.indexOf('function cameraCard('), end = mapSource.indexOf('\n function mountWorkflowRail(', start);
  const card = mapSource.slice(start, end);
  assert.equal([...card.matchAll(/mountQueueOutcomeActions\(cam\)/g)].length, 2);
  assert.ok(card.indexOf('mountQueueOutcomeActions(cam)') < card.indexOf('step===2?'));
  assert.ok(card.includes("s.entryMode==='poi'?`${cameraProfileSection(cam)}${mountScene(cam)}${mountCurrentTarget(cam,fixedTarget)}${mountQueueOutcomeActions(cam)}`"));
});

test('terminal action form retains entered details and offers cancel', () => {
  const context = {
    ui: { camera: { mountOutcomeDraft: { cameraId: 'c1', type: 'no_value', reason: '画面长期遮挡' } } },
    mountProjectCams: () => [{ id: 'c1' }, { id: 'c2' }],
    processed: () => false,
    mountQueueOutcome: () => null,
    rec: () => ({}),
    escape: value => String(value ?? '')
  };
  vm.createContext(context);
  load(mapSource, 'mountQueueOutcomeConfirmation', context);
  load(mapSource, 'mountQueueOutcomeActions', context);
  load(mapSource, 'nextQueueCameraAfter', context);
  const markup = context.mountQueueOutcomeActions({ id: 'c1', name: '相机 A' });
  assert.match(markup, /画面长期遮挡/);
  assert.match(markup, /不会创建 POI 挂载/);
  assert.match(markup, /标记并进入下一台/);
  assert.match(markup, /data-map="mount-outcome-cancel"/);
});

test('terminal outcome confirmation shows the submitted details and keeps them on cancel', () => {
  const context = {
    ui: { camera: { mountOutcomeDraft: { cameraId: 'c1', type: 'basic_feedback', field: '安装位置', note: '位置与现场不符' } } },
    buildMountQueueDecision: (type, values) => ({ type, ...values }),
    escape: value => String(value ?? '')
  };
  vm.createContext(context);
  load(mapSource, 'prepareMountQueueOutcomeConfirmation', context);
  load(mapSource, 'cancelMountQueueOutcomeConfirmation', context);
  load(mapSource, 'mountQueueOutcomeConfirmation', context);
  context.prepareMountQueueOutcomeConfirmation({ id: 'c1' }, 'basic_feedback', { field: '安装位置', note: '位置与现场不符' });
  const draft = context.ui.camera.mountOutcomeDraft;
  assert.equal(draft.confirmOpen, true);
  const markup = context.mountQueueOutcomeConfirmation({ id: 'c1', name: '相机 A' }, draft);
  assert.match(markup, /确认提交基础信息反馈/);
  assert.match(markup, /安装位置/);
  assert.match(markup, /位置与现场不符/);
  assert.match(markup, /data-map="mount-outcome-confirm-save"/);
  context.cancelMountQueueOutcomeConfirmation();
  assert.equal(context.ui.camera.mountOutcomeDraft.confirmOpen, false);
  assert.equal(context.ui.camera.mountOutcomeDraft.note, '位置与现场不符');
});

test('terminal camera actions advance only after save and return to the queue at the end', () => {
  const decisions = new Map(), events = [], cameras = [{ id: 'c1' }, { id: 'c2' }];
  const context = {
    ui: { camera: {}, analysis: {} },
    hasCameraProfileChanges: () => false,
    mountQueueOutcome: cam => decisions.get(cam.id) || null,
    saveMountQueueOutcome: (cam, type) => { decisions.set(cam.id, { type, status: type === 'no_value' ? 'excluded' : 'pending_review' }); events.push(`saved:${cam.id}`); },
    mountProjectCams: () => cameras,
    processed: cam => decisions.has(cam.id),
    mountOutcomeSuccessMessage: (_type, cam, next) => next ? `${cam.id}->${next.id}` : `${cam.id}->queue`,
    selectCamera: id => events.push(`select:${id}`),
    render: () => events.push('render'),
    notify: message => events.push(`notify:${message}`)
  };
  vm.createContext(context);
  load(mapSource, 'nextQueueCameraAfter', context);
  load(mapSource, 'buildMountQueueDecision', context);
  load(mapSource, 'finishMountQueueOutcome', context);
  context.finishMountQueueOutcome(cameras[0], 'no_value', { reason: '遮挡' });
  assert.deepEqual(events.slice(0, 3), ['saved:c1', 'select:c2', 'notify:c1->c2']);
  events.length = 0;
  context.finishMountQueueOutcome(cameras[1], 'basic_feedback', { field: '安装位置', note: '需核对' });
  assert.equal(context.ui.camera.queueOpen, true);
  assert.equal(context.ui.camera.cameraId, '');
  assert.deepEqual(events, ['saved:c2', 'render', 'notify:c2->queue']);
  events.length = 0;
  decisions.delete('c2');
  context.saveMountQueueOutcome = () => { events.push('save-failed'); throw new Error('storage unavailable'); };
  assert.throws(() => context.finishMountQueueOutcome(cameras[1], 'basic_feedback', { field: '安装位置', note: '需核对' }), /storage unavailable/);
  assert.deepEqual(events, ['save-failed']);
  events.length = 0;
  decisions.delete('c2');
  context.saveMountQueueOutcome = (cam, type, values) => context.buildMountQueueDecision(type, values);
  assert.throws(() => context.finishMountQueueOutcome(cameras[1], 'no_value', { reason: '  ' }), /填写/);
  assert.deepEqual(events, []);
  cameras.push({ id: 'c3' });
  decisions.clear();
  decisions.set('c2', { type: 'no_value', status: 'excluded' });
  context.saveMountQueueOutcome = (cam, type) => { decisions.set(cam.id, { type, status: type === 'no_value' ? 'excluded' : 'pending_review' }); events.push(`saved:${cam.id}`); };
  context.finishMountQueueOutcome(cameras[2], 'no_value', { reason: '遮挡' });
  assert.deepEqual(events.slice(-3), ['saved:c3', 'select:c1', 'notify:c3->c1']);
});

test('processing the next camera after a saved mount does not trigger a discard prompt', () => {
  const events = [], camera = { id: 'c1', projectId: 'hz-public' };
  const context = {
    ui: { camera: { cameraId: 'c1', entryMode: 'camera', completedCameraId: 'c1' } },
    mountProjectCams: () => [camera],
    hasMountDraftChanges: () => true,
    requestCameraLeave: () => { events.push('leave-prompt'); return true; },
    nextUnprocessedId: () => 'c2',
    executeMountAction: (_cam, pending) => events.push(`next:${pending.nextId}`)
  };
  vm.createContext(context);
  load(mapSource, 'shouldConfirmMountNext', context);
  load(mapSource, 'requestMountAction', context);
  context.requestMountAction('next');
  assert.deepEqual(events, ['next:c2']);
});

test('completed mount auto-advance bypasses the discard guard in the real camera switch', () => {
  const events = [], cameras = [{ id: 'c1', projectId: 'p1' }, { id: 'c2', projectId: 'p1' }];
  const context = {
    ui: { camera: { cameraId: 'c1', entryMode: 'camera', completedCameraId: 'c1', selectedPoiId: 'p1' }, analysis: { profileDraft: null, calibration: null } },
    mountProjectCams: () => cameras,
    hasMountDraftChanges: () => true,
    requestCameraLeave: () => { events.push('leave-prompt'); return true; },
    nextUnprocessedId: () => 'c2',
    currentProject: () => ({ id: 'p1' }),
    prepareMountCamera: () => {},
    render: () => {},
    requestAnimationFrame: callback => callback(),
    document: { querySelector: () => ({ focus() {} }) },
    CSS: { escape: value => value },
    feedbackDraft: null
  };
  vm.createContext(context);
  load(mapSource, 'shouldConfirmMountNext', context);
  load(mapSource, 'selectCamera', context);
  load(mapSource, 'executeMountAction', context);
  load(mapSource, 'requestMountAction', context);
  context.requestMountAction('next');
  assert.equal(context.ui.camera.cameraId, 'c2');
  assert.deepEqual(events, []);
});

test('leaving after a completed mount does not ask to discard the saved camera', () => {
  const context = {};
  vm.createContext(context);
  load(mapSource, 'shouldConfirmMountNext', context);
  assert.equal(context.shouldConfirmMountNext('c1', 'c1', true), false);
  assert.equal(context.shouldConfirmMountNext('c1', 'c2', true), true);
  assert.equal(context.shouldConfirmMountNext('', 'c2', false), false);
});

test('unsaved terminal camera feedback is protected when leaving the camera', () => {
  const context = {
    ui: {
      camera: { cameraId: 'c1', entryMode: 'camera', selectedPoiId: '', targetPoiId: '', poiCreateOpen: false, unableOpen: false, reason: '', mountOutcomeDraft: { cameraId: 'c1', type: 'basic_feedback', field: '安装位置', note: '位置不符' } },
      analysis: { profileDraft: null, calibration: null }
    },
    mountProjectCams: () => [{ id: 'c1' }],
    hasCameraProfileChanges: () => false
  };
  vm.createContext(context);
  load(mapSource, 'hasMountDraftChanges', context);
  load(mapSource, 'discardMountDraft', context);
  assert.equal(context.hasMountDraftChanges(), true);
  context.discardMountDraft();
  assert.equal(context.ui.camera.mountOutcomeDraft, null);
});

test('terminal feedback field edits are retained in the pending draft', () => {
  const context = { ui: { camera: { mountOutcomeDraft: { cameraId: 'c1', type: 'basic_feedback', error: '旧错误' } } } };
  vm.createContext(context);
  load(mapSource, 'updateMountQueueOutcomeDraft', context);
  context.updateMountQueueOutcomeDraft('note', '安装位置与画面不符');
  assert.equal(context.ui.camera.mountOutcomeDraft.note, '安装位置与画面不符');
  assert.equal(context.ui.camera.mountOutcomeDraft.error, '');
});

test('POI camera list labels basic-info feedback as pending review', () => {
  const context = {
    mountQueueOutcome: () => ({ type: 'basic_feedback', status: 'pending_review' }),
    escape: value => String(value ?? ''),
    icon: () => 'camera',
    image: () => 'image',
    position: () => null,
    distance: () => 0,
    poiPoint: () => [0, 0]
  };
  vm.createContext(context);
  load(mapSource, 'poiCameraRows', context);
  const markup = context.poiCameraRows([{ id: 'c1', name: '入口相机' }], 'pendingReview', { id: 'p1' });
  assert.match(markup, /基础信息待复核/);
  assert.match(markup, /查看处理记录/);
});

test('mount picker visibly lists two candidate POIs for a multi-candidate mock camera', () => {
  const context = {
    ui: { camera: { poiTab: 'candidate', nearbyQuery: '', nearbyRadius: 500, selectedPoiId: '' } },
    rec: () => ({ mounts: [], sources: {}, candidates: [{ id: 'p1' }, { id: 'p2' }] }),
    cityPois: () => [{ id: 'p1', name: '湖滨步行街' }, { id: 'p2', name: '武林广场停车场' }],
    confirmed: () => '', position: () => [120, 30], poiPoint: poi => poi.id === 'p1' ? [120.001, 30] : [120.002, 30],
    distance: () => 100, mountProjectPoiSearch: () => [], escape: value => value,
    mountPlaceCard: (_cam, poi) => `<article>${poi.name}</article>`
  };
  vm.createContext(context);
  load(mapSource, 'mountPoiOptions', context);
  load(mapSource, 'mountPoiPicker', context);
  const markup = context.mountPoiPicker({ id: 'multi' });
  assert.match(markup, /湖滨步行街/);
  assert.match(markup, /武林广场停车场/);
  assert.match(markup, /AI建议<span>2<\/span>/);
});

test('AI pre-mount review keys cover all surviving confirmed POI relations', () => {
  const context = { keyOf: values => [...new Set(values)].sort().join('|') };
  vm.createContext(context);
  load(opsSource, 'applyPreMountReview', context);
  load(opsSource, 'reviewed', context);

  const accepted = { version: 4, usageVersion: 2, mounts: ['p1', 'p3'], sources: { p1: 'manual', p3: 'ai_pre' }, candidates: [] };
  context.applyPreMountReview(accepted, 'p3', 'accept', '', '运营员', '2026-11-04 10:00');
  accepted.version++;
  accepted.review.version = accepted.version;
  assert.equal(accepted.review.key, 'p1|p3');
  assert.equal(context.reviewed(accepted), true);

  const rejected = { version: 7, usageVersion: 2, mounts: ['p1', 'p3'], sources: { p1: 'manual', p3: 'ai_pre' }, candidates: [], review: { key: 'p1|p3', version: 7, usageVersion: 2 } };
  context.applyPreMountReview(rejected, 'p3', 'reject', '', '运营员', '2026-11-04 10:00');
  rejected.version++;
  rejected.review.version = rejected.version;
  assert.deepEqual(Array.from(rejected.mounts), ['p1']);
  assert.equal(rejected.review.key, 'p1');
  assert.equal(context.reviewed(rejected), true);
});

test('POI entry enables the next step from its fixed target', () => {
  const context = { ui: { camera: { entryMode: 'poi', targetPoiId: 'p1' } } };
  vm.createContext(context);
  load(mapSource, 'mountTargetId', context);
  load(mapSource, 'mountCanAdvance', context);
  assert.equal(context.mountCanAdvance(2, context.mountTargetId(''), null, 'c1'), true);
  const rail = mapSource.match(/function mountWorkflowRail\([\s\S]*?(?=\n function )/)[0];
  assert.match(rail, /mountCanAdvance\(step,mountTargetId\(s\.selectedPoiId\),s\.preReviewDraft,cam\.id\)/);
  assert.match(mapSource, /mountCanAdvance\(step,mountTargetId\(ui\.camera\.selectedPoiId\),ui\.camera\.preReviewDraft,ui\.camera\.cameraId\)/);
});

test('the fixed POI target panel displays the recommendation evidence', () => {
  const context = {
    poiEvidence: () => ({ signals: [['画面描述关联', 'positive']], reason: '画面内容与 POI 类型相符。', caution: '仍需人工核验。' }),
    mountPoiOptions: () => ({ choices: [{ id: 'p2', name: '钱江新城公园', category: '公园', district: '上城区' }, { id: 'p3', name: '武林广场停车场', category: '停车场', district: '拱墅区' }] }),
    rec: () => ({ mounts: [], sources: {} }),
    escape: value => value,
    tag: label => `<i>${label}</i>`,
    poiLabel: poi => poi.category
  };
  vm.createContext(context);
  load(mapSource, 'mountCurrentTarget', context);
  const markup = context.mountCurrentTarget({}, { id: 'p2', name: '钱江新城公园', category: '公园', district: '上城区' });
  assert.match(markup, /POI 推荐挂载依据/);
  assert.match(markup, /画面内容与 POI 类型相符/);
  assert.match(markup, /仍需人工核验/);
  assert.match(markup, /POI 推荐候选/);
  assert.match(markup, /武林广场停车场/);
  assert.match(markup, /钱江新城公园/);
  assert.match(markup, /POI 推荐挂载依据/);
  assert.match(markup, /武林广场停车场/);
  assert.equal((markup.match(/画面内容与 POI 类型相符/g) || []).length, 2);
});

test('a real mock camera exposes multiple candidate POIs in the queue', () => {
  const context = {
    CITY_INFO: { hz: { code: 'HZ', districts: ['上城区', '拱墅区'], locations: ['庆春路', '延安路', '东站'] } },
    CAMERA_DEMO_COORDS: { hz: [120.16, 30.26] },
    store: { cities: { hz: { pois: [{ id: 'p1' }] } } },
    pointForPoi: () => [120.16, 30.26],
    rec: camera => camera.defaultMountRecord
  };
  vm.createContext(context);
  load(mapSource, 'mountFixtureCameras', context);
  load(mapSource, 'mountCandidateSummary', context);
  load(mapSource, 'featuredMultiCandidateCamera', context);
  const cameras = context.mountFixtureCameras({ id: 'hz-public', cityKey: 'hz', name: '杭州示例项目' });
  const multi = cameras.find(camera => context.mountCandidateSummary(camera).candidates > 1);
  assert.ok(multi);
  assert.equal(context.mountCandidateSummary(multi).candidates, 2);
  assert.equal(context.featuredMultiCandidateCamera(cameras, ''), multi);
});

test('queue surfaces the first multi-candidate camera when no search is active', () => {
  const context = {
    mountCandidateSummary: cam => ({ total: cam.total }),
    cameraQueryMatches: () => true
  };
  vm.createContext(context);
  load(mapSource, 'featuredMultiCandidateCamera', context);
  const cams = [{ id: 'one', total: 1 }, { id: 'two', total: 2 }];
  assert.equal(context.featuredMultiCandidateCamera(cams, ''), cams[1]);
  assert.equal(context.featuredMultiCandidateCamera(cams, 'camera'), null);
});

test('queue prioritizes a seeded multi-candidate mock over unrelated processed candidates', () => {
  const context = {
    mountCandidateSummary: cam => ({ total: cam.liveCandidates }),
    cameraQueryMatches: () => true
  };
  vm.createContext(context);
  load(mapSource, 'featuredMultiCandidateCamera', context);
  const cams = [
    { id: 'HZ-C01', liveCandidates: 2, mountDemo: true, defaultMountRecord: { candidates: [] } },
    { id: 'HZ-M02', liveCandidates: 0, mountDemo: true, defaultMountRecord: { candidates: [{ id: 'p2' }, { id: 'p3' }] } }
  ];
  assert.equal(context.featuredMultiCandidateCamera(cams, ''), cams[1]);
});

test('opening the featured multi-candidate example uses seeded candidates even after demo processing', () => {
  const events = [], context = {
    selectCamera: (...args) => events.push(args)
  };
  vm.createContext(context);
  load(mapSource, 'action', context);
  context.action({ dataset: { map: 'queue-multi-candidate-demo', id: 'HZ-M02' } });
  assert.deepEqual(events, [['HZ-M02', false, true]]);
});

test('multi-candidate preview reads the immutable seeded POI list rather than processed demo state', () => {
  const context = {
    ui: { camera: { candidateDemoPreviewId: 'HZ-M02' } },
    fixtureRecords: () => ({ project: { 'HZ-M02': { mounts: ['p1'], candidates: [] } } }),
    city: () => ({ personalOps: { records: {} } }),
    copy: value => JSON.parse(JSON.stringify(value))
  };
  vm.createContext(context);
  load(mapSource, 'mountRecordForCamera', context);
  const camera = { id: 'HZ-M02', projectId: 'project', mountDemo: true, defaultMountRecord: { mounts: [], candidates: [{ id: 'p2' }, { id: 'p3' }] } };
  assert.deepEqual(Array.from(context.mountRecordForCamera(camera).candidates, item => item.id), ['p2', 'p3']);
});

test('multi-candidate demo shows each POI with its own match evidence', () => {
  const context = {
    cityPois: () => [
      { id: 'p2', name: '钱江新城公园', category: '公园', district: '上城区' },
      { id: 'p3', name: '武林广场停车场', category: '停车场', district: '拱墅区' }
    ],
    poiEvidence: (_camera, poi) => ({ reason: `${poi.name} 的独立匹配依据` }),
    poiLabel: poi => poi.category,
    escape: value => value
  };
  vm.createContext(context);
  load(mapSource, 'multiCandidatePoiItems', context);
  load(mapSource, 'multiCandidateDemoContent', context);
  const markup = context.multiCandidateDemoContent({ defaultMountRecord: { candidates: [{ id: 'p2' }, { id: 'p3' }] } });
  assert.match(markup, /钱江新城公园 的独立匹配依据/);
  assert.match(markup, /武林广场停车场 的独立匹配依据/);
  assert.equal((markup.match(/class="camera-queue-demo-poi"/g) || []).length, 2);
});

test('selecting a POI records accept for AI target and switch for another target', () => {
  const context = {};
  vm.createContext(context);
  load(mapSource, 'preReviewDraftForSelection', context);
  const cam = { id: 'c1' };
  const record = { mounts: ['p3'], sources: { p3: 'ai_pre' } };
  assert.deepEqual(JSON.parse(JSON.stringify(context.preReviewDraftForSelection(cam, record, 'p3', null))), {
    cameraId: 'c1', prePoiId: 'p3', decision: 'accept', targetPoiId: 'p3'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(context.preReviewDraftForSelection(cam, record, 'p2', null))), {
    cameraId: 'c1', prePoiId: 'p3', decision: 'switch', targetPoiId: 'p2'
  });
});

test('reject-only AI review can advance to confirmation without selecting a POI', () => {
  const context = {};
  vm.createContext(context);
  load(mapSource, 'mountCanAdvance', context);
  assert.equal(context.mountCanAdvance(2, '', { cameraId: 'c1', decision: 'reject' }, 'c1'), true);
  assert.equal(context.mountCanAdvance(2, '', { cameraId: 'c1', decision: 'switch' }, 'c1'), false);
  assert.equal(context.mountCanAdvance(2, 'p2', null, 'c1'), true);
});

test('map relation drawing is limited to the active camera', () => {
  const context = { mountQueueOutcome: () => null, isMountQueueOutcomeProcessed: outcome => !!outcome?.processed, confirmed: () => '' };
  vm.createContext(context);
  load(mapSource, 'mountRelationCameras', context);
  assert.deepEqual(Array.from(context.mountRelationCameras([{ id: 'c1' }, { id: 'c2' }], 'c2'), item => item.id), ['c2']);
  assert.deepEqual(Array.from(context.mountRelationCameras([{ id: 'c1' }], ''), item => item.id), []);
  context.mountQueueOutcome = cam => cam.id === 'c2' ? { processed: true } : null;
  assert.deepEqual(Array.from(context.mountRelationCameras([{ id: 'c1' }, { id: 'c2' }], 'c2'), item => item.id), []);
  context.confirmed = cam => cam.id === 'c2' ? 'p2' : '';
  assert.deepEqual(Array.from(context.mountRelationCameras([{ id: 'c1' }, { id: 'c2' }], 'c2'), item => item.id), ['c2']);
});

test('terminal outcomes stop looking like pending AI mount suggestions on the map', () => {
  const context = {
    rec: () => ({ mounts: ['p2'], sources: { p2: 'ai_pre' } }),
    confirmed: () => '',
    mountQueueOutcome: () => ({ type: 'no_value', status: 'excluded' }),
    isMountQueueOutcomeProcessed: outcome => outcome?.status === 'excluded',
    hasCandidate: () => false
  };
  vm.createContext(context);
  load(mapSource, 'cameraLayer', context);
  assert.equal(context.cameraLayer({ id: 'c1' }), 'noCandidate');
  context.confirmed = () => 'p2';
  assert.equal(context.cameraLayer({ id: 'c1' }), 'mounted');
});
