/* Project-scoped governance task center. Business records remain in the existing shared demo store. */
(() => {
  'use strict';

  const STAGES = {
    base: { label: '基础信息治理', route: 'cameras' },
    poi: { label: 'POI 相机挂载', route: 'bindings' },
    event: { label: '事件检测配置', route: 'govData' }
  };
  const PEOPLE = [
    { id: 'worker-lee', name: '李同学' },
    { id: 'worker-chen', name: '陈同学' }
  ];
  const TASK_ROUTES = ['workspace', 'projects', 'cameraTasks', 'cameras', 'bindings', 'govData'];
  const labels = { pending: '待处理', active: '处理中', complete: '已完成', blocked: '受阻', rework: '待整改', reworking: '整改中', team: '待分派' };

  MODULES.cameraTasks = { name: '治理相机任务', icon: 'govern', group: 'platform' };
  if (!PLATFORM_ROUTES.includes('cameraTasks')) PLATFORM_ROUTES.splice(2, 0, 'cameraTasks');
  const taskRole = (name, person, desc, allowed = TASK_ROUTES) => ({ name, person, desc, allowed: [...allowed], cities: ['hz'], home: 'cameraTasks' });
  ROLES.govProjectManager = taskRole('项目治理管理员', '王主任', '治理批次 · 项目进度 · 质量管理', ['workspace', 'projects', 'projectOverview', 'projectConfig', 'cameraTasks']);
  ROLES.govOutsourceLead = taskRole('外包组长', '张组长', '团队任务分派 · 问题跟进', ['workspace', 'projects', 'cameraTasks']);
  ROLES.govOutsourceWorkerA = taskRole('外包执行人', '李同学', '相机资料 · POI 挂载 · 事件配置');
  ROLES.govOutsourceWorkerB = taskRole('外包执行人', '陈同学', '相机资料 · POI 挂载 · 事件配置');
  ROLES.govQualityAuditor = taskRole('内部质量抽查人', '周同学', '提交成果抽查 · 整改回派', ['workspace', 'projects', 'cameraTasks']);
  ROLES.admin.allowed = [...new Set([...ROLES.admin.allowed, 'cameraTasks'])];

  store.cameraTaskCenter ||= { version: 1, batches: [], items: [], plans: [], audits: [], logs: [] };
  const center = () => {
    store.cameraTaskCenter ||= { version: 1, batches: [], items: [], plans: [], audits: [], logs: [] };
    for (const key of ['batches', 'items', 'plans', 'audits', 'logs']) store.cameraTaskCenter[key] ||= [];
    return store.cameraTaskCenter;
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  const taskState = { tab: 'overview', filter: 'all', stage: 'all', search: '', selectedId: '', projectId: 'all', wizard: null, pendingSave: null };
  const taskRoleKind = () => store.session.role === 'govOutsourceLead' ? 'lead'
    : ['govOutsourceWorkerA', 'govOutsourceWorkerB'].includes(store.session.role) ? 'worker'
      : store.session.role === 'govQualityAuditor' ? 'auditor' : 'manager';
  const personIdForRole = () => store.session.role === 'govOutsourceWorkerA' ? 'worker-lee'
    : store.session.role === 'govOutsourceWorkerB' ? 'worker-chen' : '';
  const timeNow = () => new Date().toLocaleString('zh-CN', { hour12: false });
  const activeTask = item => ['待处理', '处理中', '受阻', '待整改', '整改中', '待分派'].includes(item.status);
  const aiDone = (cam, stage) => {
    const value = stage === 'base' ? cam.aiGovernanceStatus || cam.aiBaseStatus
      : stage === 'poi' ? cam.aiPoiMountStatus || cam.aiMountStatus : cam.aiEventConfigStatus || cam.aiEventStatus;
    return ['已完成', 'AI 已完成', '已治理', 'done', 'completed'].includes(String(value || ''));
  };
  const stageHasOpenTask = (projectId, cameraId, stage) => center().items.some(item => item.projectId === projectId && item.cameraId === cameraId && item.stage === stage && activeTask(item));
  const taskProject = id => visibleProjects().find(project => project.id === id) || null;
  const taskProjects = () => visibleProjects();
  const taskCameras = projectId => camerasForProject(taskProject(projectId));
  const taskCity = projectId => store.cities[taskProject(projectId)?.cityKey] || city();
  const taskInfo = projectId => CITY_INFO[taskProject(projectId)?.cityKey] || info();
  const taskScopeIds = () => taskState.projectId === 'all' ? new Set(taskProjects().map(project => project.id)) : new Set([taskState.projectId]);
  const scopedItems = () => center().items.filter(item => taskScopeIds().has(item.projectId));
  const scopedBatches = () => center().batches.filter(batch => taskScopeIds().has(batch.projectId));
  const scopedAudits = () => center().audits.filter(audit => taskScopeIds().has(audit.projectId));
  const cameraById = (id, projectId) => taskCameras(projectId).find(cam => cam.id === id);
  const hasEventConfig = (cameraId, projectId) => taskCity(projectId).configs.some(config => config.cameraId === cameraId);
  const hasBusinessValue = cam => ['personal', 'governance', 'both', 'none'].includes(cam.businessValue) && !!cam.governedAt;
  const isPersonalValuable = cam => ['personal', 'both'].includes(cam.businessValue);
  const isGovernanceValuable = cam => ['governance', 'both'].includes(cam.businessValue);

  function eligibility(cam, stage, plannedStages = []) {
    if (!cam) return { ok: false, future: false, reason: '相机不在当前项目' };
    if (stageHasOpenTask(cam.projectId, cam.id, stage)) return { ok: false, future: false, reason: '已有进行中的同类任务' };
    if (aiDone(cam, stage)) return { ok: false, future: false, reason: 'AI 已完成此阶段' };
    if (stage === 'base') return { ok: true, future: false, reason: '' };
    if (stage === 'poi') {
      if (!cam.personalSubscribed) return { ok: false, future: false, reason: '当前项目未开通个人版应用范围' };
      if (plannedStages.includes('base') && !hasBusinessValue(cam)) return { ok: true, future: true, reason: '等待基础信息和价值结论' };
      if (!hasBusinessValue(cam)) return { ok: false, future: false, reason: '基础信息与价值结论尚未完成' };
      if (!isPersonalValuable(cam)) return { ok: false, future: false, reason: cam.businessValue === 'none' ? '相机已标记无价值' : '价值结论不适用于个人版' };
      return { ok: true, future: false, reason: '' };
    }
    if (!cam.governanceSubscribed) return { ok: false, future: false, reason: '当前项目未开通治理版应用范围' };
    if (plannedStages.includes('base') && !hasBusinessValue(cam)) {
      return hasEventConfig(cam.id, cam.projectId) ? { ok: true, future: true, reason: '等待基础信息和价值结论' } : { ok: false, future: false, reason: '当前相机没有可用的事件配置、区域和规则' };
    }
    if (!hasBusinessValue(cam)) return { ok: false, future: false, reason: '基础信息与价值结论尚未完成' };
    if (!isGovernanceValuable(cam)) return { ok: false, future: false, reason: cam.businessValue === 'none' ? '相机已标记无价值' : '价值结论不适用于治理版' };
    if (!hasEventConfig(cam.id, cam.projectId)) return { ok: false, future: false, reason: '当前相机没有可用的事件配置、区域和规则' };
    return { ok: true, future: false, reason: '' };
  }

  function log(item, action, detail = '') {
    const entry = { id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, projectId: item.projectId, batchId: item.batchId, itemId: item.id, cameraId: item.cameraId, stage: item.stage, action, detail, actor: role().person, role: role().name, time: timeNow() };
    center().logs.unshift(entry);
    center().logs = center().logs.slice(0, 500);
    return entry;
  }
  function batchFor(item) { return center().batches.find(batch => batch.id === item.batchId); }
  function taskStageStatus(item) { return labels[item.statusCode] || item.status; }
  function taskStatus(item, code) { item.statusCode = code; item.status = labels[code]; }
  function allocationPlan(wizard, entries, projectId) {
    if (wizard.mode === 'team') return entries.map(() => ({ assigneeId: 'team', assignee: '外包团队待分派' }));
    const people = wizard.people.map(id => PEOPLE.find(person => person.id === id)).filter(Boolean);
    const loads = people.map(person => ({ ...person, existing: wizard.distribution === 'balance' ? center().items.filter(item => item.projectId === projectId && item.assigneeId === person.id && ['pending', 'active', 'blocked', 'rework', 'reworking'].includes(item.statusCode)).length : 0, added: 0 }));
    if (!loads.length) return entries.map(() => ({ assigneeId: '', assignee: '未选择执行人' }));
    return entries.map(() => {
      const person = [...loads].sort((a, b) => a.existing + a.added - b.existing - b.added)[0];
      person.added++;
      return { assigneeId: person.id, assignee: person.name };
    });
  }
  function packageFor(batch, cam, stage) {
    const group = batch.groupBy === 'district' ? cam.district : '未分组';
    const inGroup = center().items.filter(item => item.batchId === batch.id && item.stage === stage && (batch.groupBy !== 'district' || item.district === cam.district)).length;
    const number = Math.floor(inGroup / batch.packageSize) + 1;
    return { id: `${batch.id}-${stage}-${group}-${number}`, label: `${group} · ${STAGES[stage].label} · 第 ${number} 包` };
  }
  function taskItem(batch, cam, stage, assignee, packageInfo, inheritedFrom = '') {
    const id = `gt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const item = { id, batchId: batch.id, batchName: batch.name, projectId: batch.projectId, projectName: batch.projectName, cameraId: cam.id, cameraName: cam.name, district: cam.district, stage, stageName: STAGES[stage].label, assigneeId: assignee.assigneeId, assignee: assignee.assignee, originalAssigneeId: assignee.assigneeId === 'team' ? '' : assignee.assigneeId, originalAssignee: assignee.assigneeId === 'team' ? '' : assignee.assignee, statusCode: assignee.assigneeId === 'team' ? 'team' : 'pending', status: labels[assignee.assigneeId === 'team' ? 'team' : 'pending'], packageId: packageInfo.id, packageLabel: packageInfo.label, createdAt: timeNow(), submissions: [], audits: [], issue: null, inheritedFrom };
    center().items.unshift(item);
    return item;
  }
  function createBatch(wizard) {
    const project = taskProject(wizard.projectId);
    if (!project) throw new Error('请先选择所属项目。');
    if (!wizard.cameraIds.length || !wizard.stages.length) throw new Error('请先选择相机和至少一个任务阶段。');
    if (wizard.mode !== 'team' && !wizard.people.length) throw new Error('请至少选择一位外包执行人。');
    const evaluated = [];
    for (const cameraId of wizard.cameraIds) {
      const cam = taskCameras(project.id).find(item => item.id === cameraId);
      for (const stage of wizard.stages) evaluated.push({ cam, stage, ...eligibility(cam, stage, wizard.stages) });
    }
    const invalid = evaluated.filter(entry => !entry.ok);
    if (invalid.length && !wizard.acknowledged) throw new Error('请先确认已查看不适用相机及排除原因。');
    const immediate = evaluated.filter(entry => entry.ok && !entry.future);
    const future = evaluated.filter(entry => entry.ok && entry.future);
    const assignments = allocationPlan(wizard, immediate, project.id);
    if (!immediate.length && !future.length) throw new Error('当前没有可创建的任务，请调整相机或阶段。');
    const before = copy(center());
    const batch = { id: `gb-${Date.now().toString(36)}`, projectId: project.id, projectName: project.name, name: String(wizard.name || '').trim() || `${project.name}治理批次 ${center().batches.length + 1}`, stages: [...wizard.stages], cameraIds: [...wizard.cameraIds], createdBy: role().person, createdAt: timeNow(), groupBy: wizard.groupBy, packageSize: Math.min(500, Math.max(1, Number(wizard.packageSize) || 20)), mode: wizard.mode, distribution: wizard.distribution, assignees: wizard.mode === 'team' ? ['外包团队'] : wizard.people.map(id => PEOPLE.find(person => person.id === id)?.name).filter(Boolean), excluded: invalid.map(entry => ({ cameraId: entry.cam?.id || '', cameraName: entry.cam?.name || '', stage: entry.stage, stageName: STAGES[entry.stage].label, reason: entry.reason })), deferred: future.length, taskCount: immediate.length, status: '执行中' };
    center().batches.unshift(batch);
    for (const [index, entry] of immediate.entries()) {
      const assigned = assignments[index];
      const item = taskItem(batch, entry.cam, entry.stage, assigned, packageFor(batch, entry.cam, entry.stage));
      log(item, wizard.mode === 'team' ? '进入组长待分派池' : '任务已分配', item.assignee);
    }
    for (const entry of future) center().plans.push({ id: `plan-${batch.id}-${entry.cam.id}-${entry.stage}`, batchId: batch.id, projectId: batch.projectId, cameraId: entry.cam.id, cameraName: entry.cam.name, stage: entry.stage, stageName: STAGES[entry.stage].label, status: '待基础信息治理', reason: entry.reason });
    for (const entry of invalid) center().plans.push({ id: `plan-${batch.id}-${entry.cam?.id}-${entry.stage}`, batchId: batch.id, projectId: batch.projectId, cameraId: entry.cam?.id || '', cameraName: entry.cam?.name || '', stage: entry.stage, stageName: STAGES[entry.stage].label, status: '不适用', reason: entry.reason });
    log({ ...batch, id: batch.id, cameraId: '', stage: '' }, '批次已创建', `${batch.cameraIds.length} 台相机 · ${batch.stages.map(stage => STAGES[stage].label).join('、')}`);
    if (!persist()) { store.cameraTaskCenter = before; throw new Error('批次未保存，本机存储不可用。'); }
    taskState.wizard = null;
    taskState.tab = taskRoleKind() === 'manager' ? 'batches' : taskState.tab;
    render();
    notify(`治理批次已创建 · ${batch.taskCount} 个立即执行任务${batch.deferred ? ` · ${batch.deferred} 个待前置核验` : ''}`);
  }

  function plansFor(batchId) { return center().plans.filter(plan => plan.batchId === batchId); }
  function batchStatus(batch) {
    const items = center().items.filter(item => item.batchId === batch.id);
    const plans = plansFor(batch.id);
    if (items.some(item => ['blocked', 'rework', 'reworking'].includes(item.statusCode))) return '问题待处理';
    if (items.some(item => item.statusCode !== 'complete')) return '执行中';
    if (plans.some(plan => plan.status === '待基础信息治理')) return '等待前置核验';
    if (items.length && items.every(item => item.statusCode === 'complete')) return '已完成';
    return '执行中';
  }
  function createDownstreamFromBase(item, cam) {
    const batch = batchFor(item);
    if (!batch || !batch.stages.includes('poi') && !batch.stages.includes('event')) return;
    for (const stage of ['poi', 'event']) {
      if (!batch.stages.includes(stage)) continue;
      const plan = center().plans.find(entry => entry.batchId === batch.id && entry.cameraId === item.cameraId && entry.stage === stage);
      const existing = center().items.find(entry => entry.batchId === batch.id && entry.cameraId === item.cameraId && entry.stage === stage);
      if (existing) { if (plan?.status === '待基础信息治理') { plan.status = '已生成任务'; plan.reason = ''; } continue; }
      if (plan?.status === '不适用') continue;
      const check = eligibility(cam, stage, []);
      if (!check.ok) {
        if (plan) { plan.status = '不适用'; plan.reason = check.reason; }
        else center().plans.push({ id: `plan-${batch.id}-${cam.id}-${stage}`, batchId: batch.id, projectId: batch.projectId, cameraId: cam.id, cameraName: cam.name, stage, stageName: STAGES[stage].label, status: '不适用', reason: check.reason });
        log(item, '下游阶段不适用', `${STAGES[stage].label} · ${check.reason}`);
        continue;
      }
      const assigned = item.assigneeId === 'team' ? { assigneeId: 'team', assignee: '外包团队待分派' } : { assigneeId: item.assigneeId, assignee: item.assignee };
      const next = taskItem(batch, cam, stage, assigned, packageFor(batch, cam, stage), item.id);
      if (plan) { plan.status = '已生成任务'; plan.reason = ''; }
      batch.taskCount++;
      log(next, '基础信息完成，生成下游任务', `沿用基础信息执行人：${next.assignee}`);
    }
    batch.deferred = Math.max(0, center().plans.filter(plan => plan.batchId === batch.id && plan.status === '待基础信息治理').length);
  }

  function businessSnapshot(item) {
    const projectCity = taskCity(item.projectId);
    const cam = projectCity.cameras.find(record => record.id === item.cameraId) || {};
    if (item.stage === 'base') return { name: cam.name, district: cam.district, installationPosition: cam.installationPosition, longitude: cam.longitude, latitude: cam.latitude, cameraWatermark: cam.cameraWatermark, businessValue: cam.businessValue, valueReason: cam.valueReason, governedAt: cam.governedAt };
    if (item.stage === 'poi') {
      const record = projectCity.personalOps?.records?.[item.cameraId] || {};
      return { mounts: copy(record.mounts || []), sources: copy(record.sources || {}), version: record.version || 0, review: copy(record.review || null), selectedPois: (record.mounts || []).map(id => projectCity.pois.find(poi => poi.id === id)?.name).filter(Boolean) };
    }
    const config = projectCity.configs.find(entry => entry.cameraId === item.cameraId);
    const region = config && projectCity.regions.find(entry => entry.id === config.regionId);
    const rule = config && projectCity.rules.find(entry => entry.id === config.ruleId);
    return { config: copy(config || null), region: copy(region || null), rule: copy(rule || null) };
  }

  function submitTaskReceipt(pending) {
    const item = center().items.find(entry => entry.id === pending.itemId);
    if (!item || item.cameraId !== pending.cameraId || item.projectId !== currentProject()?.id || item.stage !== pending.stage || !['处理中', '整改中', '待整改'].includes(item.status)) return false;
    const snapshot = businessSnapshot(item);
    const version = (item.submissions.at(-1)?.version || 0) + 1;
    const receipt = { version, operator: role().person, role: role().name, time: timeNow(), stage: item.stage, cameraId: item.cameraId, recordVersion: snapshot.version || version, snapshot };
    item.submissions.push(receipt);
    item.currentSubmission = receipt;
    item.lastSubmittedAt = receipt.time;
    taskStatus(item, 'complete');
    item.issue = null;
    log(item, '业务成果已保存', `版本 ${version} · ${role().person}`);
    if (item.stage === 'base') createDownstreamFromBase(item, cameraById(item.cameraId, item.projectId));
    const batch = batchFor(item);
    if (batch) batch.taskCount = Math.max(batch.taskCount, center().items.filter(entry => entry.batchId === batch.id).length);
    return true;
  }

  function beginBusinessSave(item, callback) {
    const previous = taskState.pendingSave;
    taskState.pendingSave = { itemId: item.id, cameraId: item.cameraId, projectId: item.projectId, stage: item.stage, recorded: false, persisted: false, taskBefore: copy(center()), storeBefore: copy(store) };
    try {
      const result = callback();
      const pending = taskState.pendingSave;
      if (!pending.persisted || !pending.recorded) {
        if (pending.storeBefore) Object.assign(store, pending.storeBefore);
        else store.cameraTaskCenter = pending.taskBefore;
        throw new Error('业务成果未成功保存，任务仍保持未完成。');
      }
      setTimeout(() => {
        if (state.cameraTaskContext?.itemId !== item.id || state.route === 'cameraTasks') return;
        state.cameraTaskContext = null;
        state.detail = null;
        navigate('cameraTasks');
        notify(`${STAGES[item.stage].label}已保存，任務回執已記錄`);
      }, 0);
      return result;
    } catch (error) {
      if (taskState.pendingSave && !taskState.pendingSave.persisted && taskState.pendingSave.storeBefore) Object.assign(store, taskState.pendingSave.storeBefore);
      throw error;
    } finally { taskState.pendingSave = previous; }
  }

  const previousPersist = persist;
  persist = function () {
    const pending = taskState.pendingSave;
    let before = null;
    if (pending && state.cameraTaskContext?.itemId === pending.itemId) {
      before = copy(center());
      pending.recorded = submitTaskReceipt(pending);
    }
    const stored = previousPersist();
    if (pending && state.cameraTaskContext?.itemId === pending.itemId) {
      pending.persisted = stored;
      if (!stored && before) store.cameraTaskCenter = before;
    }
    return stored;
  };

  const previousModuleWorkspace = moduleWorkspace;
  function taskContextBar() {
    const ctx = state.cameraTaskContext;
    if (!ctx) return '';
    const item = center().items.find(entry => entry.id === ctx.itemId);
    if (!item) return '';
    const stages = Object.entries(STAGES).map(([stage, info]) => {
      const sameStage = entry => entry.batchId === item.batchId && entry.cameraId === item.cameraId && entry.stage === stage;
      const sibling = center().items.find(sameStage);
      const current = stage === item.stage;
      const available = sibling && sibling.assigneeId === personIdForRole() && ['pending', 'active', 'rework', 'reworking'].includes(sibling.statusCode);
      const status = sibling?.status || center().plans.find(sameStage)?.status || '未纳入本批次';
      return `<button type="button" aria-current="${current ? 'step' : 'false'}" ${available && !current ? `data-task-action="open" data-id="${esc(sibling.id)}"` : 'disabled'}>${stage === 'base' ? '相机基础信息治理' : info.label}<small>${esc(status)}</small></button>`;
    }).join('');
    return `<section class="gt-context"><div><strong>${esc(item.batchName)} · ${esc(item.cameraName)}</strong><small>${esc(item.assignee)}</small></div><div><button type="button" class="button ghost small" data-task-action="report">报告问题</button><button type="button" class="button small" data-task-action="return">返回治理任务</button></div><nav class="gt-work-stages" aria-label="相机任务阶段">${stages}</nav></section>`;
  }
  moduleWorkspace = function (content) {
    if (state.cameraTaskContext) return taskContextBar() + content;
    return previousModuleWorkspace(content);
  };

  function taskMetrics(items) {
    const all = items.length;
    const complete = items.filter(item => item.statusCode === 'complete').length;
    const working = items.filter(item => ['active', 'reworking'].includes(item.statusCode)).length;
    const blocked = items.filter(item => ['blocked', 'rework'].includes(item.statusCode)).length;
    return `<div class="metrics gt-metrics"><div class="metric"><div class="metric-label">治理任务</div><div class="metric-value">${all}<small>项</small></div><div class="metric-note">所选项目范围内生成</div></div><div class="metric"><div class="metric-label">已完成</div><div class="metric-value gt-good">${complete}<small>项</small></div><div class="metric-note">成果已写入业务资料</div></div><div class="metric"><div class="metric-label">处理中</div><div class="metric-value">${working}<small>项</small></div><div class="metric-note">执行人正在处理</div></div><div class="metric"><div class="metric-label">问题 / 整改</div><div class="metric-value gt-warn">${blocked}<small>项</small></div><div class="metric-note">仅影响对应相机阶段</div></div></div>`;
  }
  function stageProgress(items) {
    return `<div class="gt-stage-grid">${Object.entries(STAGES).map(([stage, info]) => {
      const list = items.filter(item => item.stage === stage), done = list.filter(item => item.statusCode === 'complete').length;
      return `<article class="box gt-stage-card"><div class="gt-stage-title"><strong>${info.label}</strong><span>${done} / ${list.length}</span></div><div class="gt-progress"><i style="width:${list.length ? done / list.length * 100 : 0}%"></i></div><small>${list.filter(item => ['active', 'reworking'].includes(item.statusCode)).length} 处理中 · ${list.filter(item => ['blocked', 'rework'].includes(item.statusCode)).length} 问题或整改</small></article>`;
    }).join('')}</div>`;
  }
  function statusTag(item) { return `<span class="status ${['blocked', 'rework'].includes(item.statusCode) ? 'warn' : item.statusCode === 'complete' ? 'success' : item.statusCode === 'team' ? 'neutral' : ''}">${esc(taskStageStatus(item))}</span>`; }
  function filteredItems() {
    let items = scopedItems();
    if (taskRoleKind() === 'worker') items = items.filter(item => item.assigneeId === personIdForRole());
    if (taskRoleKind() === 'lead') items = items.filter(item => item.assigneeId === 'team' || item.issue?.resolved === false);
    if (taskState.stage !== 'all') items = items.filter(item => item.stage === taskState.stage);
    if (taskState.filter !== 'all') items = items.filter(item => item.statusCode === taskState.filter);
    if (taskState.search) items = items.filter(item => `${item.cameraName} ${item.cameraId} ${item.batchName} ${item.assignee}`.toLowerCase().includes(taskState.search.toLowerCase()));
    return items;
  }
  function tabsForRole(kind) {
    const items = kind === 'manager' ? [['overview', '治理进度'], ['batches', '批次与任务'], ['people', '人员进度'], ['quality', '质量抽查'], ['issues', '问题跟进']]
      : kind === 'lead' ? [['team', '待分派任务'], ['issues', '问题跟进']]
        : kind === 'auditor' ? [['quality', '质量抽查'], ['auditLog', '抽查记录']]
          : [['mine', '我的任务'], ['rework', '整改任务'], ['issues', '问题记录']];
    return `<div class="tabs gt-tabs" role="tablist">${items.map(([id, label]) => `<button class="tab ${taskState.tab === id ? 'on' : ''}" role="tab" aria-selected="${taskState.tab === id}" data-task-action="tab" data-id="${id}">${label}</button>`).join('')}</div>`;
  }
  function taskTable(items, mode = 'default') {
    const rows = items.map((item, index) => {
      const batch = batchFor(item);
      const actions = [];
      if (mode === 'team' && item.assigneeId === 'team' && !items.slice(0, index).some(entry => entry.packageId === item.packageId)) actions.push(`<button class="button small primary" data-task-action="assign-package" data-id="${esc(item.id)}" data-package="${esc(item.packageId)}">分派工作包</button>`);
      if (mode === 'quality' && item.statusCode === 'complete' && item.currentSubmission && (item.lastAuditedVersion || 0) < item.currentSubmission.version) actions.push(`<button class="button small primary" data-task-action="audit" data-id="${esc(item.id)}">抽查</button>`);
      if (mode === 'worker' && ['pending', 'active', 'rework', 'reworking'].includes(item.statusCode)) actions.push(`<button class="button small primary" data-task-action="open" data-id="${esc(item.id)}">${item.statusCode === 'rework' ? '开始整改' : item.statusCode === 'reworking' ? '继续整改' : item.statusCode === 'active' ? '继续处理' : '开始处理'}</button>`);
      if (mode === 'issues' && item.statusCode === 'blocked' && ['manager', 'lead'].includes(taskRoleKind())) actions.push(`<button class="button small ghost" data-task-action="resolve" data-id="${esc(item.id)}">协调后恢复</button>`);
      actions.push(`<button class="button small ghost" data-task-action="detail" data-id="${esc(item.id)}">详情</button>`);
      const cells = [`<strong>${esc(item.projectName || taskProject(item.projectId)?.name || '—')}</strong>`, `<strong>${esc(item.cameraName)}</strong><small class="mono">${esc(item.cameraId)}</small>`, esc(item.stageName), `<strong>${esc(item.batchName)}</strong><small>${esc(batch?.createdAt || item.createdAt)}</small>`, esc(item.assignee || '待分派'), statusTag(item), `<div class="gt-row-actions">${actions.join('')}</div>`];
      if (mode === 'team' || mode === 'worker') cells.unshift(esc(item.packageLabel || '未分包'));
      return cells;
    });
    return table(mode === 'team' || mode === 'worker' ? ['工作包', '所属项目', '相机 / 编号', '治理阶段', '批次', '执行人', '状态', '操作'] : ['所属项目', '相机 / 编号', '治理阶段', '批次', '执行人', '状态', '操作'], rows, '当前范围没有治理任务。');
  }
  function batchList() {
    const batches = scopedBatches();
    if (!batches.length) return `<div class="empty">当前范围还没有治理批次。<p>选择项目后按相机和阶段创建治理任务。</p></div>`;
    return `<div class="gt-batch-list">${batches.map(batch => {
      const items = center().items.filter(item => item.batchId === batch.id), plans = plansFor(batch.id);
      const status = batchStatus(batch), statusClass = status === '已完成' ? 'success' : status === '问题待处理' ? 'warn' : 'neutral';
      return `<article class="box gt-batch-card"><div class="gt-batch-head"><div><span class="gt-kicker">${esc(batch.projectName)} · ${esc(batch.id)} · ${esc(batch.createdAt)}</span><h3>${esc(batch.name)}</h3><p>${batch.cameraIds.length} 台相机 · ${batch.stages.map(stage => STAGES[stage].label).join('、')} · ${batch.assignees.join('、') || '组长分派'}</p></div><span class="status ${statusClass}">${esc(status)}</span></div><div class="gt-batch-stats"><span>${items.length} 个已生成任务</span><span>${plans.filter(plan => plan.status === '待基础信息治理').length} 个等待前置核验</span><span>${plans.filter(plan => plan.status === '不适用').length} 个不适用记录</span></div><button class="button small ghost" data-task-action="batch-detail" data-id="${esc(batch.id)}">查看批次任务</button></article>`;
    }).join('')}</div>`;
  }
  function peopleProgress(items) {
    const names = [...new Set([...PEOPLE.map(person => person.name), '外包团队待分派'])];
    return `<div class="gt-people-grid">${names.map(name => {
      const assigned = items.filter(item => item.assignee === name || (name === '外包团队待分派' && item.assigneeId === 'team'));
      return `<article class="box gt-person-card"><div class="gt-person-head"><span class="avatar">${esc(name.slice(0, 1))}</span><div><strong>${esc(name)}</strong><small>${assigned.length} 项分配任务</small></div></div><div class="gt-person-stats"><span>完成 <b>${assigned.filter(item => item.statusCode === 'complete').length}</b></span><span>问题 <b>${assigned.filter(item => ['blocked', 'rework'].includes(item.statusCode)).length}</b></span><span>待办 <b>${assigned.filter(item => ['pending', 'active', 'team', 'rework', 'reworking'].includes(item.statusCode)).length}</b></span></div></article>`;
    }).join('')}</div>`;
  }
  function qualityPanel(items) {
    const eligible = items.filter(item => item.statusCode === 'complete' && item.currentSubmission && (item.lastAuditedVersion || 0) < item.currentSubmission.version);
    const completed = items.filter(item => item.currentSubmission);
    const audits = scopedAudits();
    return `<section class="box"><div class="box-title"><div><h2>质量抽查</h2><p>抽查不会阻塞执行人继续其他任务；不合格成果会按原执行人派回整改。</p></div><span class="status neutral">${eligible.length} 项待抽查</span></div>${taskTable(eligible, 'quality')}</section><section class="box gt-audit-history"><div class="box-title"><h2>最近抽查记录</h2><span class="muted">${audits.length} 条</span></div>${auditTable(audits.slice(0, 8))}</section><p class="local-note">当前范围共有 ${completed.length} 项曾提交业务成果。</p>`;
  }
  function auditTable(audits) {
    return table(['相机 / 阶段', '执行人', '提交版本', '抽查人', '结论', '问题 / 时间'], audits.map(audit => [`<strong>${esc(audit.cameraName)}</strong><small>${esc(audit.stageName)}</small>`, esc(audit.executor), `v${audit.submissionVersion}`, esc(audit.auditor), badge(audit.result), `<span>${esc(audit.issue || '—')}</span><small>${esc(audit.time)}</small>`]), '尚无抽查记录。');
  }
  function issuePanel(items) {
    const blocked = items.filter(item => ['blocked', 'rework'].includes(item.statusCode));
    return `<section class="box"><div class="box-title"><div><h2>${taskRoleKind() === 'worker' ? '我提交的问题' : '问题跟进'}</h2><p>问题只暂停当前相机当前阶段；其他任务可继续处理。</p></div><span class="status ${blocked.length ? 'warn' : 'neutral'}">${blocked.length} 项待跟进</span></div>${blocked.length ? taskTable(blocked, 'issues') : '<div class="empty">当前没有待跟进问题。</div>'}</section>`;
  }
  function detailPanel() {
    const item = scopedItems().find(entry => entry.id === taskState.selectedId);
    if (!item) return '';
    const logs = center().logs.filter(entry => entry.itemId === item.id);
    const snapshot = item.currentSubmission?.snapshot;
    const summary = snapshot ? item.stage === 'base' ? `相机名称：${snapshot.name || '—'} · 价值：${snapshot.businessValue || '—'} · 安装位置：${snapshot.installationPosition || '—'}` : item.stage === 'poi' ? `已挂载 POI：${(snapshot.selectedPois || []).join('、') || '—'}` : `检测配置：${snapshot.config?.name || '—'} · ${snapshot.config?.type || '—'}` : '尚未提交业务成果。';
    const batch = batchFor(item), siblingItems = center().items.filter(entry => entry.batchId === item.batchId && entry.cameraId === item.cameraId);
    const stages = ['base', 'poi', 'event'].map(stage => {
      const sibling = siblingItems.find(entry => entry.stage === stage), plan = center().plans.find(entry => entry.batchId === item.batchId && entry.cameraId === item.cameraId && entry.stage === stage);
      if (!batch?.stages.includes(stage)) return `<article class="gt-flow-stage"><strong>${STAGES[stage].label}</strong><span class="status neutral">未纳入本批次</span></article>`;
      if (!sibling) return `<article class="gt-flow-stage"><strong>${STAGES[stage].label}</strong><span class="status neutral">${esc(plan?.status || '等待基础信息治理')}</span><small>${esc(plan?.reason || '')}</small></article>`;
      const canWork = taskRoleKind() === 'worker' && sibling.assigneeId === personIdForRole() && ['pending', 'active', 'rework', 'reworking'].includes(sibling.statusCode);
      return `<article class="gt-flow-stage ${sibling.id === item.id ? 'current' : ''}"><strong>${STAGES[stage].label}</strong>${statusTag(sibling)}<small>${esc(sibling.assignee || '待分派')}${sibling.currentSubmission ? ` · v${sibling.currentSubmission.version}` : ''}</small>${canWork ? `<button class="button small ${sibling.id === item.id ? 'primary' : 'ghost'}" data-task-action="open" data-id="${esc(sibling.id)}">${sibling.statusCode === 'pending' ? '开始处理' : sibling.statusCode === 'rework' ? '开始整改' : '继续处理'}</button>` : ''}</article>`;
    }).join('');
    return `<section class="box gt-detail"><div class="box-title"><div><h2>${esc(item.cameraName)} · ${esc(item.stageName)}</h2><p>${esc(item.batchName)} · ${esc(item.cameraId)}</p></div>${statusTag(item)}</div><div class="detail-content"><div class="gt-detail-facts"><div><span>执行人</span><strong>${esc(item.assignee || '待分派')}</strong></div><div><span>最近提交</span><strong>${esc(item.currentSubmission?.time || '—')}</strong></div><div><span>提交版本</span><strong>${item.currentSubmission ? `v${item.currentSubmission.version}` : '—'}</strong></div><div><span>抽查状态</span><strong>${esc(item.audits.at(-1)?.result || '待抽查')}</strong></div></div><div class="gt-task-flow"><h3 class="gt-subtitle">本批次任务阶段</h3><div class="gt-flow-grid">${stages}</div></div><div class="note">${esc(summary)}</div>${item.issue ? `<div class="note ${item.statusCode === 'blocked' ? 'warn' : ''}"><strong>${esc(item.issue.title || '质量问题')}</strong><p>${esc(item.issue.description || '')}</p><small>${esc(item.issue.reporter || '')} · ${esc(item.issue.time || '')}</small></div>` : ''}<h3 class="gt-subtitle">操作记录</h3><div class="timeline">${logs.length ? logs.slice(0, 8).map(entry => `<div class="timeline-item"><strong>${esc(entry.action)}</strong><span> · ${esc(entry.actor)}</span><small>${esc(entry.time)}${entry.detail ? ` · ${esc(entry.detail)}` : ''}</small></div>`).join('') : '<p class="muted">暂无操作记录。</p>'}</div></div></section>`;
  }
  function managerContent(items) {
    if (taskState.tab === 'batches') return `<section class="box"><div class="box-title"><div><h2>治理批次</h2><p>按项目创建和追踪；单个批次只包含一个项目。</p></div></div>${batchList()}</section><section class="box"><div class="box-title"><h2>阶段任务</h2><span class="muted">${items.length} 项</span></div>${taskTable(items)}</section>`;
    if (taskState.tab === 'people') return `<section class="box"><div class="box-title"><h2>人员进度</h2><span class="muted">当前项目范围 · 按执行人汇总</span></div><div class="detail-content">${peopleProgress(items)}</div></section>`;
    if (taskState.tab === 'quality') return qualityPanel(items);
    if (taskState.tab === 'issues') return issuePanel(items);
    const batches = scopedBatches();
    return `${stageProgress(items)}<div class="gt-overview-grid"><section class="box"><div class="box-title"><h2>最近治理批次</h2><button class="button small ghost" data-task-action="tab" data-id="batches">查看全部</button></div>${batchList()}</section><section class="box"><div class="box-title"><h2>需要关注</h2><span class="muted">问题与待抽查</span></div><div class="gt-attention-row"><strong>${items.filter(item => item.statusCode === 'blocked').length}</strong><span>受阻阶段</span><button class="button small ghost" data-task-action="tab" data-id="issues">查看问题</button></div><div class="gt-attention-row"><strong>${items.filter(item => item.statusCode === 'complete' && (item.lastAuditedVersion || 0) < (item.currentSubmission?.version || 0)).length}</strong><span>待质量抽查</span><button class="button small ghost" data-task-action="tab" data-id="quality">进入抽查</button></div></section></div><section class="box"><div class="box-title"><div><h2>相机阶段任务</h2><p>按“相机 × 阶段 × 提交版本”记录进度。</p></div></div>${taskTable(items.slice(0, 12))}</section>`;
  }
  function renderContent() {
    if (taskState.projectId !== 'all' && !taskProjects().some(project => project.id === taskState.projectId)) taskState.projectId = 'all';
    const kind = taskRoleKind(), items = scopedItems();
    const allowedTabs = kind === 'manager' ? ['overview', 'batches', 'people', 'quality', 'issues'] : kind === 'lead' ? ['team', 'issues'] : kind === 'auditor' ? ['quality', 'auditLog'] : ['mine', 'rework', 'issues'];
    if (!allowedTabs.includes(taskState.tab)) taskState.tab = allowedTabs[0];
    const description = kind === 'manager' ? '按项目组织基础信息、POI 挂载和事件配置任务，跟踪成果与质量。' : kind === 'lead' ? '将团队待分派任务交给执行人，并跟进受阻问题。' : kind === 'auditor' ? '抽查已提交成果；不合格时记录问题并派回原执行人整改。' : '从相机任务进入对应业务工作区，成果保存成功后自动记录提交回执。';
    let content = header('', description, kind === 'manager' ? `<button class="button primary gt-global-create-batch" data-task-action="new-batch">${icon('plus')} 新建治理批次</button>` : '');
    content += `<div class="gt-global-filter"><label>项目范围<select data-task-project><option value="all" ${taskState.projectId === 'all' ? 'selected' : ''}>全部授权项目</option>${taskProjects().map(project => `<option value="${esc(project.id)}" ${taskState.projectId === project.id ? 'selected' : ''}>${esc(project.name)}</option>`).join('')}</select></label><span>${taskState.projectId === 'all' ? `覆盖 ${taskProjects().length} 个授权项目` : '仅展示所选项目任务'}</span></div>`;
    content += taskMetrics(kind === 'manager' || kind === 'auditor' ? items : filteredItems());
    content += tabsForRole(kind);
    if (kind === 'manager') content += managerContent(items);
    else if (kind === 'lead') content += taskState.tab === 'issues' ? issuePanel(items) : `<section class="box"><div class="box-title"><div><h2>组长待分派池</h2><p>团队承接的治理任务需分配给一位执行人。</p></div><span class="status neutral">${items.filter(item => item.assigneeId === 'team').length} 项待分派</span></div>${taskTable(items.filter(item => item.assigneeId === 'team' || item.statusCode === 'blocked'), 'team')}</section>`;
    else if (kind === 'auditor') content += taskState.tab === 'auditLog' ? auditTable(scopedAudits()) : qualityPanel(items);
    else if (taskState.tab === 'issues') content += issuePanel(items);
    else {
      const target = taskState.tab === 'rework' ? items.filter(item => ['rework', 'reworking'].includes(item.statusCode)) : items.filter(item => item.assigneeId === personIdForRole() && !['blocked'].includes(item.statusCode));
      content += `<section class="box"><div class="toolbar"><div class="gt-filter-group"><label>阶段<select data-task-stage><option value="all">全部阶段</option>${Object.entries(STAGES).map(([id, stage]) => `<option value="${id}" ${taskState.stage === id ? 'selected' : ''}>${stage.label}</option>`).join('')}</select></label><label>状态<select data-task-filter><option value="all">全部状态</option>${Object.entries(labels).map(([id, label]) => `<option value="${id}" ${taskState.filter === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label><form class="search" data-task-search>${icon('search')}<input name="q" value="${esc(taskState.search)}" placeholder="搜索相机、编号或批次"><button class="visually-hidden" type="submit">搜索</button></form></div><span class="muted">${target.length} 项任务</span></div>${taskTable(target, 'worker')}</section>`;
      content += `<p class="local-note">正常提交直接更新业务资料；质量抽查在提交后进行，不影响继续处理其他相机。</p>`;
    }
    content += detailPanel();
    if (taskRoleKind() === 'worker') content += issuePanel(items.filter(item => item.assigneeId === personIdForRole()));
    return content;
  }
  function renderTaskCenter() {
    document.getElementById('app').innerHTML = shell(`<div class="gt-page">${renderContent()}</div>`);
    document.title = `${MODULES.cameraTasks.name} · SeeTime`;
  }
  const previousRender = render;
  render = function () {
    if (state.route === 'cameraTasks') { renderTaskCenter(); return; }
    previousRender();
  };

  function wizardFilterCameras(wizard) {
    let cameras = taskCameras(wizard.projectId);
    const filter = wizard.filter;
    if (filter.query) cameras = cameras.filter(cam => `${cam.name} ${cam.id}`.toLowerCase().includes(filter.query.toLowerCase()));
    if (filter.district !== 'all') cameras = cameras.filter(cam => cam.district === filter.district);
    if (filter.street !== 'all') cameras = cameras.filter(cam => cameraStreet(cam) === filter.street);
    if (filter.source !== 'all') cameras = cameras.filter(cam => cam.source === filter.source);
    if (filter.batch !== 'all') cameras = cameras.filter(cam => cam.sourceBatch === filter.batch);
    if (filter.runtime !== 'all') cameras = cameras.filter(cam => filter.runtime === 'normal' ? cam.runtimeState === '正常' : filter.runtime === 'error' ? cam.runtimeState === '异常' : cam.runtimeState === '未启动');
    if (filter.aiBase !== 'all') cameras = cameras.filter(cam => (aiDone(cam, 'base') ? 'done' : (cam.aiGovernanceStatus || cam.aiBaseStatus) ? 'todo' : 'unknown') === filter.aiBase);
    if (filter.aiPoi !== 'all') cameras = cameras.filter(cam => (aiDone(cam, 'poi') ? 'done' : (cam.aiPoiMountStatus || cam.aiMountStatus) ? 'todo' : 'unknown') === filter.aiPoi);
    if (filter.aiEvent !== 'all') cameras = cameras.filter(cam => (aiDone(cam, 'event') ? 'done' : (cam.aiEventConfigStatus || cam.aiEventStatus) ? 'todo' : 'unknown') === filter.aiEvent);
    if (filter.ids?.length) cameras = cameras.filter(cam => filter.ids.includes(cam.id));
    return cameras;
  }
  function selectOptions(values, selected, label) { return `<label>${label}<select data-task-filter-key="${label}">${values.map(([id, name]) => `<option value="${esc(id)}" ${selected === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`; }
  function aiOption(value) { return [['all', '全部'], ['done', 'AI 已完成'], ['todo', '待处理'], ['unknown', '未提供']].map(([id, label]) => `<option value="${id}" ${value === id ? 'selected' : ''}>${label}</option>`).join(''); }
  function wizardSummary(wizard) {
    const cameras = wizard.cameraIds.map(id => taskCameras(wizard.projectId).find(cam => cam.id === id)).filter(Boolean);
    const evaluated = cameras.flatMap(cam => wizard.stages.map(stage => ({ cam, stage, ...eligibility(cam, stage, wizard.stages) })));
    const immediate = evaluated.filter(entry => entry.ok && !entry.future), future = evaluated.filter(entry => entry.ok && entry.future), invalid = evaluated.filter(entry => !entry.ok);
    return { cameras, immediate, future, invalid };
  }
  function packageCount(entries, wizard) {
    const size = Math.min(500, Math.max(1, Number(wizard.packageSize) || 1));
    const counts = new Map();
    for (const entry of entries) {
      const group = wizard.groupBy === 'district' ? entry.cam.district : '未分组';
      const key = `${entry.stage}|${group}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.values()].reduce((total, count) => total + Math.ceil(count / size), 0);
  }
  function allocationPreview(wizard, summary) {
    const projectId = wizard.projectId;
    const immediateAssignments = allocationPlan(wizard, summary.immediate, projectId);
    const immediate = summary.immediate.map((entry, index) => ({ ...entry, assignment: immediateAssignments[index] }));
    const future = summary.future.map(entry => {
      const baseIndex = summary.immediate.findIndex(task => task.cam.id === entry.cam.id && task.stage === 'base');
      return { ...entry, assignment: baseIndex >= 0 ? immediateAssignments[baseIndex] : { assigneeId: 'team', assignee: '外包团队待分派' } };
    });
    const tasks = [...immediate, ...future];
    return { immediate, future, packages: packageCount(tasks, wizard), tasks };
  }
  function allocationPreviewMarkup(wizard, summary) {
    const preview = allocationPreview(wizard, summary);
    const rows = wizard.stages.map(stage => {
      const tasks = preview.tasks.filter(entry => entry.stage === stage);
      const immediate = tasks.filter(entry => !entry.future).length;
      const future = tasks.filter(entry => entry.future).length;
      const packages = packageCount(tasks, wizard);
      const people = wizard.mode === 'team' ? `组长待分派 ${tasks.length}` : wizard.people.length ? PEOPLE.filter(person => tasks.some(entry => entry.assignment.assigneeId === person.id)).map(person => `${person.name} ${tasks.filter(entry => entry.assignment.assigneeId === person.id).length}`).join(' · ') || '无任务' : '未选择执行人';
      return `<tr><td>${STAGES[stage].label}</td><td>${immediate}</td><td>${future}</td><td>${packages}</td><td>${esc(people)}</td></tr>`;
    }).join('');
    const workload = wizard.mode === 'team' ? '团队承接的任务进入组长待分派池。' : wizard.distribution === 'balance' ? '按项目内现有待办量补齐，表内为本批新增量。' : '按本批新任务量均分，不计入历史待办。';
    return `<section class="gt-allocation-preview"><div class="gt-preview-head"><strong>发布预览</strong><span>${preview.packages} 个预计工作包 · ${workload}</span></div><div class="gt-preview-table-wrap"><table><thead><tr><th>任务阶段</th><th>立即派发</th><th>待基础完成</th><th>工作包</th><th>分配预览</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  function wizardBody() {
    const wizard = taskState.wizard, projectCamerasList = taskCameras(wizard.projectId), cameras = wizardFilterCameras(wizard), selected = wizard.cameraIds.map(id => projectCamerasList.find(cam => cam.id === id)).filter(Boolean);
    const counts = Object.keys(STAGES).map(stage => [stage, selected.filter(cam => eligibility(cam, stage, wizard.stages).ok).length]);
    const summary = wizardSummary(wizard);
    const content = wizard.step === 1 ? `<div class="gt-wizard-project"><label>所属项目<select data-task-wizard-project><option value="" ${wizard.projectId ? '' : 'selected'} disabled>请选择项目</option>${taskProjects().map(item => `<option value="${esc(item.id)}" ${wizard.projectId === item.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label><span>一个批次只能包含同一项目的相机</span></div><div class="gt-wizard-filters"><label>相机 / 编号<input data-task-wizard-query value="${esc(wizard.filter.query)}" placeholder="搜索名称或编号"></label>${selectOptions([['all', '全部区县'], ...taskInfo(wizard.projectId).districts.map(district => [district, district])], wizard.filter.district, '区县')}${selectOptions([['all', '全部街道'], ...[...new Set(projectCamerasList.map(cam => cameraStreet(cam)))].map(street => [street, street])], wizard.filter.street, '街道')}${selectOptions([['all', '全部来源'], ...[...new Set(projectCamerasList.map(cam => cam.source))].map(source => [source, source])], wizard.filter.source, '接入来源')}${selectOptions([['all', '全部批次'], ...[...new Set(projectCamerasList.map(cam => cam.sourceBatch))].map(batch => [batch, batch])], wizard.filter.batch, '来源批次')}${selectOptions([['all', '全部状态'], ['normal', '正常'], ['error', '异常'], ['not-started', '未启动']], wizard.filter.runtime, '运行状态')}</div><div class="gt-ai-filters">${[['aiBase', 'AI 基础治理'], ['aiPoi', 'AI POI 挂载'], ['aiEvent', 'AI 事件配置']].map(([key, label]) => `<label>${label}<select data-task-ai-filter="${key}">${aiOption(wizard.filter[key])}</select></label>`).join('')}</div><form class="gt-id-import" data-task-id-import><label>编号清单导入 <small>可用逗号、空格或换行分隔</small><textarea name="ids" placeholder="例如：HZ-C01&#10;HZ-C02">${esc(wizard.filter.idText)}</textarea></label><button class="button small ghost" type="submit">按编号筛选</button><span>${wizard.filter.ids.length ? `已导入 ${wizard.filter.ids.length} 个编号` : '未导入编号'}</span></form><div class="gt-select-tools"><span>当前筛选 ${cameras.length} 台 · 已选 ${selected.length} 台</span><button type="button" class="button small ghost" data-task-action="select-visible">选择当前结果</button><button type="button" class="button small ghost" data-task-action="clear-cameras">清空选择</button></div><div class="gt-camera-options">${cameras.map(cam => `<label class="gt-camera-option"><input type="checkbox" data-task-camera="${esc(cam.id)}" ${wizard.cameraIds.includes(cam.id) ? 'checked' : ''}><span><strong>${esc(cam.name)}</strong><small>${esc(cam.id)} · ${esc(cam.district)} · ${esc(cam.sourceBatch)}</small></span><span class="status neutral">${esc(cam.runtimeState)}</span></label>`).join('') || '<div class="empty">筛选条件下没有相机。</div>'}</div>`
      : wizard.step === 2 ? `<div class="gt-stage-options">${Object.entries(STAGES).map(([id, stage]) => `<label class="gt-stage-option"><input type="checkbox" data-task-stage-option="${id}" ${wizard.stages.includes(id) ? 'checked' : ''}><span><strong>${stage.label}</strong><small>${id === 'base' ? '相机档案、安装位置、业务价值判断' : id === 'poi' ? '个人版相机与 POI 关系；场所 AOI 在挂载步骤中完成' : '复用已有检测配置、区域与规则并保存治理版配置'}</small></span><b>${counts.find(entry => entry[0] === id)?.[1] || 0} 台可纳入</b></label>`).join('')}</div>${wizard.stages.length ? `<section class="gt-exclusion"><div><strong>阶段适用性核对</strong><span>${summary.immediate.length} 项立即创建 · ${summary.future.length} 项等待基础信息 · ${summary.invalid.length} 项不适用</span></div>${summary.invalid.length ? `<ul>${summary.invalid.slice(0, 8).map(entry => `<li>${esc(entry.cam.name)} · ${STAGES[entry.stage].label}：${esc(entry.reason)}</li>`).join('')}${summary.invalid.length > 8 ? `<li>另有 ${summary.invalid.length - 8} 项，发布后可在批次查看。</li>` : ''}</ul><label class="gt-ack"><input type="checkbox" data-task-ack ${wizard.acknowledged ? 'checked' : ''}>我已查看不适用相机及排除原因，确认不静默派发</label>` : ''}</section>` : '<div class="empty">请选择至少一个任务阶段。</div>'}`
        : `<div class="gt-wizard-summary"><div class="gt-wizard-summary-stats"><span><strong>${summary.cameras.length}</strong> 台相机</span><span><strong>${summary.immediate.length}</strong> 个立即创建任务</span><span><strong>${summary.future.length}</strong> 个等待基础信息</span><span><strong>${summary.invalid.length}</strong> 个不适用阶段</span></div><div class="gt-form-grid"><label>批次名称<input data-task-batch-name maxlength="60" value="${esc(wizard.name)}" placeholder="可选，默认自动生成"></label><label>分组字段<select data-task-wiz-setting="groupBy"><option value="district" ${wizard.groupBy === 'district' ? 'selected' : ''}>按区县分组</option><option value="none" ${wizard.groupBy === 'none' ? 'selected' : ''}>不分组</option></select></label><label>每包相机任务量<input data-task-wiz-setting="packageSize" type="number" min="1" max="500" value="${wizard.packageSize}"></label><label>承接方式<select data-task-wiz-setting="mode"><option value="direct" ${wizard.mode === 'direct' ? 'selected' : ''}>直接分配给外包人员</option><option value="team" ${wizard.mode === 'team' ? 'selected' : ''}>进入组长待分派池</option></select></label>${wizard.mode === 'direct' ? `<label>分配策略<select data-task-wiz-setting="distribution"><option value="even" ${wizard.distribution === 'even' ? 'selected' : ''}>本批任务均分</option><option value="balance" ${wizard.distribution === 'balance' ? 'selected' : ''}>结合现有待办量</option></select></label>` : ''}</div>${wizard.mode === 'direct' ? `<fieldset class="gt-people-picker"><legend>外包执行人 · 支持多选</legend>${PEOPLE.map(person => `<label><input type="checkbox" data-task-person="${person.id}" ${wizard.people.includes(person.id) ? 'checked' : ''}><span>${person.name}</span></label>`).join('')}</fieldset>` : '<div class="note">批次统一进入外包组长待分派池；组长可在工作包中逐包分配。</div>'}${allocationPreviewMarkup(wizard, summary)}${summary.invalid.length ? `<label class="gt-ack"><input type="checkbox" data-task-ack ${wizard.acknowledged ? 'checked' : ''}>我已确认本批次的不适用项与排除原因</label>` : ''}</div>`;
    return `<div class="modal-wrap" data-backdrop="true"><section class="modal gt-wizard" role="dialog" aria-modal="true" aria-label="新建治理批次"><header class="modal-head"><div><div class="eyebrow">PROJECT GOVERNANCE</div><h2>新建治理批次</h2><p>先选择所属项目，再选择项目相机、治理阶段和统一分配规则。</p></div><button type="button" class="close-button" data-task-action="close-wizard" aria-label="关闭">${icon('close')}</button></header><div class="gt-wizard-steps">${['选择相机', '选择任务', '分组与分配'].map((label, index) => `<span class="${wizard.step === index + 1 ? 'active' : wizard.step > index + 1 ? 'complete' : ''}"><i>${wizard.step > index + 1 ? '✓' : index + 1}</i>${label}</span>`).join('')}</div><div class="modal-body">${content}<div class="form-error" data-task-error role="alert" hidden></div></div><footer class="modal-footer"><small>本地交互演示 · 保存到当前浏览器</small>${wizard.step > 1 ? '<button type="button" class="button ghost" data-task-action="wizard-back">上一步</button>' : ''}${wizard.step < 3 ? `<button type="button" class="button primary" data-task-action="wizard-next">下一步</button>` : `<button type="button" class="button primary" data-task-action="wizard-publish">创建批次</button>`}</footer></section></div>`;
  }
  function openWizard(step = 1) {
    if (!taskState.wizard) taskState.wizard = { step: 1, projectId: taskState.projectId === 'all' ? '' : taskState.projectId, cameraIds: [], stages: ['base'], name: '', acknowledged: false, people: ['worker-lee', 'worker-chen'], groupBy: 'district', packageSize: 20, mode: 'direct', distribution: 'even', filter: { query: '', district: 'all', street: 'all', source: 'all', batch: 'all', runtime: 'all', aiBase: 'all', aiPoi: 'all', aiEvent: 'all', idText: '', ids: [] } };
    taskState.wizard.step = step;
    document.getElementById('overlay').innerHTML = wizardBody();
    document.body.style.overflow = 'hidden';
  }
  function closeWizard() { taskState.wizard = null; closeOverlay(); render(); }

  function enterTask(item) {
    if (!item || !taskScopeIds().has(item.projectId) || !taskProject(item.projectId)) return;
    if (item.assigneeId !== personIdForRole() && taskRoleKind() === 'worker') { notify('这项任务未分配给当前执行人'); return; }
    if (item.statusCode === 'blocked') { notify('该阶段已受阻，请先等待问题跟进'); return; }
    const project = taskProject(item.projectId);
    state.projectId = project.id;
    store.session.city = project.cityKey;
    persistSession();
    const before = copy(center()), previousContext = state.cameraTaskContext;
    if (item.statusCode === 'rework') taskStatus(item, 'reworking');
    else if (item.statusCode === 'pending') taskStatus(item, 'active');
    item.startedAt ||= timeNow();
    state.cameraTaskContext = { itemId: item.id, projectId: item.projectId, cameraId: item.cameraId, stage: item.stage };
    state.detail = null;
    state.search = '';
    log(item, item.statusCode === 'reworking' ? '开始整改' : '进入任务工作区');
    if (!persist()) { store.cameraTaskCenter = before; state.cameraTaskContext = previousContext; notify('任务未保存，本机存储不可用'); return; }
    if (item.stage === 'base') {
      navigate('cameras');
      openFrameworkDetail('cameras', item.cameraId);
    } else if (item.stage === 'poi') {
      navigate('bindings');
      window.SeeTimeMapOps?.openCamera(item.cameraId);
    } else {
      const config = taskCity(item.projectId).configs.find(entry => entry.cameraId === item.cameraId);
      if (!config) { notify('当前相机没有可编辑事件配置，任务不能打开'); return; }
      state.selected = config.id;
      navigate('govData', 'configs');
      state.selected = config.id;
      render();
    }
  }

  function reportIssue(itemId, description, severity) {
    const item = center().items.find(entry => entry.id === itemId);
    if (!item || item.id !== state.cameraTaskContext?.itemId) throw new Error('当前任务已变化，请返回任务列表重试。');
    const text = String(description || '').trim();
    if (!text) throw new Error('请填写问题描述。');
    const before = copy(center()), previousContext = state.cameraTaskContext, previousDetail = state.detail;
    taskStatus(item, 'blocked');
    item.issue = { title: '执行问题', description: text, severity, reporter: role().person, time: timeNow(), resolved: false };
    log(item, '上报问题', `${severity} · ${text}`);
    state.cameraTaskContext = null;
    state.detail = null;
    if (!persist()) { store.cameraTaskCenter = before; state.cameraTaskContext = previousContext; state.detail = previousDetail; throw new Error('问题未保存，本机存储不可用。'); }
    closeOverlay();
    navigate('cameraTasks');
    notify('问题已记录；其他相机任务可继续处理');
  }
  function openReportDialog(itemId) {
    document.getElementById('overlay').innerHTML = `<div class="modal-wrap" data-backdrop="true"><section class="modal" role="dialog" aria-modal="true" aria-label="报告任务问题"><header class="modal-head"><div><div class="eyebrow">TASK ISSUE</div><h2>报告问题</h2><p>只暂停当前相机的当前阶段。</p></div><button class="close-button" data-task-action="close-dialog" aria-label="关闭">${icon('close')}</button></header><form data-task-report="${esc(itemId)}"><div class="modal-body"><div class="gt-form-grid"><label>问题描述<textarea name="description" maxlength="300" required placeholder="说明遇到的情况及需要协助的内容"></textarea></label><label>严重度<select name="severity"><option>一般</option><option>重要</option><option>紧急</option></select></label></div><div class="form-error" data-task-error role="alert" hidden></div></div><footer class="modal-footer"><small>提交后可继续其他任务</small><button class="button ghost" type="button" data-task-action="close-dialog">取消</button><button class="button primary" type="submit">提交问题</button></footer></form></section></div>`;
    document.body.style.overflow = 'hidden';
  }
  function resolveIssue(item) {
    if (!['manager', 'lead'].includes(taskRoleKind())) { notify('当前身份无权协调此问题'); return; }
    if (!item?.issue || item.statusCode !== 'blocked') return;
    const before = copy(center());
    item.issue.resolved = true;
    item.issue.resolvedBy = role().person;
    item.issue.resolvedAt = timeNow();
    taskStatus(item, 'pending');
    item.assigneeId = item.originalAssigneeId || item.assigneeId;
    item.assignee = PEOPLE.find(person => person.id === item.assigneeId)?.name || item.originalAssignee || item.assignee;
    log(item, '问题已协调，任务恢复', item.assignee);
    if (!persist()) { store.cameraTaskCenter = before; notify('任务未保存，本机存储不可用'); return; }
    notify('任务已恢复并回派原执行人');
    render();
  }
  function openAssignDialog(item, packageId = '') {
    const count = packageId ? center().items.filter(entry => entry.packageId === packageId && entry.assigneeId === 'team').length : 1;
    const title = packageId ? `分派工作包 · ${count} 项任务` : '分配给执行人';
    document.getElementById('overlay').innerHTML = `<div class="modal-wrap"><section class="modal" role="dialog" aria-modal="true" aria-label="${title}"><header class="modal-head"><div><div class="eyebrow">TEAM ASSIGNMENT</div><h2>${title}</h2><p>${esc(item.packageLabel || `${item.cameraName} · ${item.stageName}`)}</p></div><button class="close-button" data-task-action="close-dialog" aria-label="关闭">${icon('close')}</button></header><form data-task-assign="${esc(item.id)}" data-package="${esc(packageId)}"><div class="modal-body"><label class="form-field"><span>执行人</span><select name="assigneeId" required>${PEOPLE.map(person => `<option value="${person.id}">${person.name}</option>`).join('')}</select></label></div><footer class="modal-footer"><small>同包任务统一交给一位执行人；下游阶段沿用基础信息执行人</small><button class="button ghost" type="button" data-task-action="close-dialog">取消</button><button class="button primary" type="submit">确认分派</button></footer></form></section></div>`;
    document.body.style.overflow = 'hidden';
  }
  function assignTeamTask(itemId, assigneeId, packageId = '') {
    const item = center().items.find(entry => entry.id === itemId), person = PEOPLE.find(entry => entry.id === assigneeId);
    if (!item || item.assigneeId !== 'team' || !person) throw new Error('请选择有效的团队任务和执行人。');
    const before = copy(center());
    const targets = packageId ? center().items.filter(entry => entry.packageId === packageId && entry.assigneeId === 'team') : [item];
    for (const target of targets) {
      target.assigneeId = person.id; target.assignee = person.name; target.originalAssigneeId ||= person.id; target.originalAssignee ||= person.name;
      taskStatus(target, 'pending'); log(target, packageId ? '组长分派工作包' : '组长分派任务', person.name);
      for (const downstream of center().items.filter(entry => entry.inheritedFrom === target.id && entry.assigneeId === 'team')) { downstream.assigneeId = person.id; downstream.assignee = person.name; downstream.originalAssigneeId = person.id; downstream.originalAssignee = person.name; taskStatus(downstream, 'pending'); log(downstream, '沿用基础信息任务执行人', person.name); }
    }
    if (!persist()) { store.cameraTaskCenter = before; throw new Error('分派未保存，本机存储不可用。'); }
    closeOverlay(); render(); notify(packageId ? `工作包已分派给${person.name}` : `任务已分派给${person.name}`);
  }
  function openAuditDialog(item) {
    const submission = item.currentSubmission;
    const snapshot = submission?.snapshot || {};
    const content = item.stage === 'base' ? `相机名称 ${snapshot.name || '—'} · 价值 ${snapshot.businessValue || '—'} · 位置 ${snapshot.installationPosition || '—'}` : item.stage === 'poi' ? `挂载 POI ${(snapshot.selectedPois || []).join('、') || '—'}` : `事件配置 ${snapshot.config?.name || '—'} · ${snapshot.config?.type || '—'}`;
    document.getElementById('overlay').innerHTML = `<div class="modal-wrap"><section class="modal" role="dialog" aria-modal="true" aria-label="质量抽查"><header class="modal-head"><div><div class="eyebrow">QUALITY REVIEW · V${submission.version}</div><h2>抽查 ${esc(item.stageName)}</h2><p>${esc(item.cameraName)} · 原执行人 ${esc(item.originalAssignee || item.assignee)}</p></div><button class="close-button" data-task-action="close-dialog" aria-label="关闭">${icon('close')}</button></header><form data-task-audit="${esc(item.id)}"><div class="modal-body"><div class="note">${esc(content)}<small> · ${esc(submission.time)}</small></div><fieldset class="gt-audit-choice"><legend>抽查结论</legend><label><input type="radio" name="result" value="pass" checked>通过</label><label><input type="radio" name="result" value="return">不合格，派回整改</label></fieldset><div class="gt-form-grid"><label>严重度<select name="severity"><option>一般</option><option>重要</option><option>严重</option></select></label><label>问题描述<textarea name="issue" maxlength="300" placeholder="抽查不合格时填写问题描述"></textarea></label></div><div class="form-error" data-task-error role="alert" hidden></div></div><footer class="modal-footer"><small>保留本次提交版本与原执行人</small><button class="button ghost" type="button" data-task-action="close-dialog">取消</button><button class="button primary" type="submit">保存抽查结果</button></footer></form></section></div>`;
    document.body.style.overflow = 'hidden';
  }
  function saveAudit(itemId, values) {
    const item = center().items.find(entry => entry.id === itemId), submission = item?.currentSubmission;
    if (!item || item.statusCode !== 'complete' || !submission) throw new Error('当前任务没有可抽查的已保存版本。');
    if (values.result === 'return' && !String(values.issue || '').trim()) throw new Error('请填写不合格问题描述。');
    const before = copy(center());
    const entry = { id: `qa-${Date.now().toString(36)}`, itemId, projectId: item.projectId, batchId: item.batchId, cameraId: item.cameraId, cameraName: item.cameraName, stage: item.stage, stageName: item.stageName, executor: item.originalAssignee || item.assignee, submissionVersion: submission.version, auditor: role().person, time: timeNow(), result: values.result === 'pass' ? '通过' : '不合格', severity: values.severity || '一般', issue: values.result === 'return' ? String(values.issue).trim() : '', submission: copy(submission) };
    item.audits.push(entry); item.lastAuditedVersion = submission.version; center().audits.unshift(entry);
    if (values.result === 'return') {
      item.issue = { title: '质量抽查不合格', description: entry.issue, severity: entry.severity, reporter: role().person, time: entry.time, resolved: false, auditId: entry.id };
      item.assigneeId = item.originalAssigneeId || item.assigneeId; item.assignee = item.originalAssignee || item.assignee; taskStatus(item, 'rework');
      log(item, '抽查不合格，回派整改', `提交 v${submission.version} · ${entry.issue}`);
    } else log(item, '质量抽查通过', `提交 v${submission.version}`);
    if (!persist()) { store.cameraTaskCenter = before; throw new Error('抽查结果未保存，本机存储不可用。'); }
    closeOverlay(); taskState.selectedId = item.id; render(); notify(entry.result === '通过' ? '抽查结果已保存' : `已回派给${item.assignee}整改`);
  }

  function actionClick(event) {
    const button = event.target.closest?.('[data-task-action]');
    if (!button) return;
    const action = button.dataset.taskAction, id = button.dataset.id || '';
    event.preventDefault(); event.stopImmediatePropagation();
    if (action === 'new-batch') { openWizard(); return; }
    if (action === 'close-wizard') { closeWizard(); return; }
    if (action === 'wizard-back') { openWizard(Math.max(1, taskState.wizard.step - 1)); return; }
    if (action === 'wizard-next') {
      const wizard = taskState.wizard;
      if (wizard.step === 1 && !taskProject(wizard.projectId)) { showWizardError('请先选择所属项目。'); return; }
      if (wizard.step === 1 && !wizard.cameraIds.length) { showWizardError('请至少选择一台相机。'); return; }
      if (wizard.step === 2 && !wizard.stages.length) { showWizardError('请至少选择一个治理阶段。'); return; }
      openWizard(wizard.step + 1); return;
    }
    if (action === 'select-visible') { const wizard = taskState.wizard; for (const cam of wizardFilterCameras(wizard)) if (!wizard.cameraIds.includes(cam.id)) wizard.cameraIds.push(cam.id); openWizard(); return; }
    if (action === 'clear-cameras') { taskState.wizard.cameraIds = []; openWizard(); return; }
    if (action === 'wizard-publish') {
      const wizard = taskState.wizard; wizard.name = document.querySelector('[data-task-batch-name]')?.value || wizard.name;
      try { createBatch(wizard); closeOverlay(); } catch (error) { showWizardError(error.message); }
      return;
    }
    if (action === 'tab') { taskState.tab = id; taskState.selectedId = ''; render(); return; }
    if (action === 'detail' || action === 'batch-detail') { taskState.selectedId = center().items.find(item => item.id === id)?.id || center().items.find(item => item.batchId === id)?.id || ''; if (action === 'batch-detail') taskState.tab = 'batches'; render(); return; }
    if (action === 'open') { enterTask(center().items.find(item => item.id === id)); return; }
    if (action === 'return') { state.cameraTaskContext = null; state.detail = null; navigate('cameraTasks'); return; }
    if (action === 'report') { if (state.cameraTaskContext) openReportDialog(state.cameraTaskContext.itemId); return; }
    if (action === 'resolve') { resolveIssue(center().items.find(item => item.id === id)); return; }
    if (action === 'assign-package') { const item = center().items.find(entry => entry.id === id); if (item) openAssignDialog(item, button.dataset.package || ''); return; }
    if (action === 'audit') { const item = center().items.find(entry => entry.id === id); if (item) openAuditDialog(item); return; }
    if (action === 'close-dialog') { closeOverlay(); return; }
  }
  function showWizardError(message) { const error = document.querySelector('[data-task-error]'); if (error) { error.hidden = false; error.textContent = message; } else notify(message); }
  document.addEventListener('click', actionClick, true);
  document.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-task-camera]') && taskState.wizard) { const id = target.dataset.taskCamera; taskState.wizard.cameraIds = target.checked ? [...new Set([...taskState.wizard.cameraIds, id])] : taskState.wizard.cameraIds.filter(value => value !== id); return; }
    if (target.matches('[data-task-stage-option]') && taskState.wizard) { const id = target.dataset.taskStageOption; taskState.wizard.stages = target.checked ? [...new Set([...taskState.wizard.stages, id])] : taskState.wizard.stages.filter(value => value !== id); taskState.wizard.acknowledged = false; openWizard(taskState.wizard.step); return; }
    if (target.matches('[data-task-ack]') && taskState.wizard) { taskState.wizard.acknowledged = target.checked; return; }
    if (target.matches('[data-task-person]') && taskState.wizard) { const id = target.dataset.taskPerson; taskState.wizard.people = target.checked ? [...new Set([...taskState.wizard.people, id])] : taskState.wizard.people.filter(value => value !== id); return; }
    if (target.matches('[data-task-filter]')) { taskState.filter = target.value; render(); return; }
    if (target.matches('[data-task-stage]')) { taskState.stage = target.value; render(); return; }
    if (target.matches('[data-task-project]')) { taskState.projectId = target.value; taskState.selectedId = ''; render(); return; }
    if (target.matches('[data-task-wizard-project]') && taskState.wizard) {
      taskState.wizard.projectId = target.value;
      taskState.wizard.cameraIds = [];
      taskState.wizard.filter = { query: '', district: 'all', street: 'all', source: 'all', batch: 'all', runtime: 'all', aiBase: 'all', aiPoi: 'all', aiEvent: 'all', idText: '', ids: [] };
      taskState.wizard.acknowledged = false;
      openWizard(taskState.wizard.step); return;
    }
    if (target.matches('[data-task-wizard-query]') && taskState.wizard) { taskState.wizard.filter.query = target.value; openWizard(); return; }
    if (target.matches('[data-task-filter-key]') && taskState.wizard) {
      const key = target.dataset.taskFilterKey === '区县' ? 'district' : target.dataset.taskFilterKey === '街道' ? 'street' : target.dataset.taskFilterKey === '接入来源' ? 'source' : target.dataset.taskFilterKey === '来源批次' ? 'batch' : 'runtime';
      taskState.wizard.filter[key] = target.value; openWizard(); return;
    }
    if (target.matches('[data-task-ai-filter]') && taskState.wizard) { taskState.wizard.filter[target.dataset.taskAiFilter] = target.value; openWizard(); return; }
    if (target.matches('[data-task-wiz-setting]') && taskState.wizard) { const key = target.dataset.taskWizSetting; taskState.wizard[key] = key === 'packageSize' ? Number(target.value) : target.value; openWizard(taskState.wizard.step); }
  }, true);
  document.addEventListener('input', event => {
    if (event.target.matches('[data-task-wizard-query]') && taskState.wizard) taskState.wizard.filter.query = event.target.value;
    if (event.target.matches('[data-task-batch-name]') && taskState.wizard) taskState.wizard.name = event.target.value;
  }, true);
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.matches('[data-task-id-import]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      const text = String(new FormData(form).get('ids') || ''), ids = [...new Set(text.split(/[\s,，;；]+/).map(value => value.trim()).filter(Boolean))];
      taskState.wizard.filter.idText = text; taskState.wizard.filter.ids = ids; openWizard(1);
      if (ids.some(id => !taskCameras(taskState.wizard.projectId).some(cam => cam.id === id))) notify('部分编号不在当前项目相机范围内，已保留匹配项并忽略其他编号');
      return;
    }
    if (form.matches('[data-task-search]')) { event.preventDefault(); event.stopImmediatePropagation(); taskState.search = String(new FormData(form).get('q') || '').trim(); render(); return; }
    if (form.matches('[data-task-report]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      try { const values = Object.fromEntries(new FormData(form)); reportIssue(form.dataset.taskReport, values.description, values.severity); } catch (error) { const el = form.querySelector('[data-task-error]'); if (el) { el.hidden = false; el.textContent = error.message; } }
      return;
    }
    if (form.matches('[data-task-assign]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      try { assignTeamTask(form.dataset.taskAssign, new FormData(form).get('assigneeId'), form.dataset.package || ''); } catch (error) { notify(error.message); }
      return;
    }
    if (form.matches('[data-task-audit]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      try { saveAudit(form.dataset.taskAudit, Object.fromEntries(new FormData(form))); } catch (error) { const el = form.querySelector('[data-task-error]'); if (el) { el.hidden = false; el.textContent = error.message; } }
    }
  }, true);

  function openStageTask(itemId, stage) {
    const item = center().items.find(entry => entry.id === itemId);
    if (!item || item.stage !== stage || state.cameraTaskContext?.itemId !== item.id) return null;
    return item;
  }
  const oldSaveCamera = saveCameraGovernance;
  saveCameraGovernance = function (values, id) {
    const item = state.cameraTaskContext && openStageTask(state.cameraTaskContext.itemId, 'base');
    if (!item || item.cameraId !== id) return oldSaveCamera(values, id);
    return beginBusinessSave(item, () => oldSaveCamera(values, id));
  };
  const oldSaveRecord = saveRecord;
  saveRecord = function (kind, values, id = '') {
    const item = state.cameraTaskContext && openStageTask(state.cameraTaskContext.itemId, 'event');
    if (kind !== 'config' || !item || values.cameraId !== item.cameraId || id && !city().configs.some(config => config.id === id && config.cameraId === item.cameraId)) return oldSaveRecord(kind, values, id);
    return beginBusinessSave(item, () => oldSaveRecord(kind, values, id));
  };
  if (window.SeeTimeMapOps) window.SeeTimeMapOps.onMountSaved = function (cameraId) {
    const item = state.cameraTaskContext && openStageTask(state.cameraTaskContext.itemId, 'poi');
    if (!item || item.cameraId !== cameraId) return;
    return beginBusinessSave(item, () => {
      const stored = persist();
      if (!stored) throw new Error('挂载关系已保存，但任务回执未保存；请联系项目管理员核对本机存储。');
      return stored;
    });
  };



  render();
})();
