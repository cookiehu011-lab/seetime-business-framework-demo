const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const mapSource = fs.readFileSync(path.join(root, '个人版地图运营.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const framework = fs.readFileSync(path.join(root, 'SeeTime业务框架.html'), 'utf8');
const mountingSpec = fs.readFileSync(path.join(root, 'docs/superpowers/specs/2026-11-03-camera-mounting-workbench.md'), 'utf8');

function loadMapFunction(name, environment = {}, invoke = true) {
  const lines = mapSource.split('\n');
  const start = lines.findIndex(line => line.startsWith(` function ${name}(`));
  assert.notEqual(start, -1, `Missing function ${name}`);
  let depth = 0;
  const declaration = [];
  for (const line of lines.slice(start)) {
    declaration.push(line);
    depth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
    if (depth === 0) break;
  }
  const context = { ...environment };
  vm.createContext(context);
  vm.runInContext(declaration.join('\n'), context);
  return invoke ? context[name]() : context[name];
}

test('camera static tag references match the six supplied categories', () => {
  const categories = loadMapFunction('staticTagCategories');
  assert.deepEqual(JSON.parse(JSON.stringify(categories)), [
    { category: '空间与场地', values: ['广场', '庭院', '观景平台', '步道', '林荫道', '滨水空间', '室内空间'] },
    { category: '自然景观', values: ['水面', '湖景', '河景', '山景', '林地', '草坪', '花园', '开阔视野'] },
    { category: '步行与休憩设施', values: ['座椅', '休息区', '遮阴', '台阶', '栈道', '骑行道'] },
    { category: '文化与建筑', values: ['古建筑', '历史遗迹', '寺庙', '雕塑', '展馆'] },
    { category: '交通与公共设施', values: ['出入口', '停车场', '公交站', '骑行停放点', '卫生间', '服务中心'] },
    { category: '场景体验', values: ['适合散步', '可短暂停留', '适合观景', '适合拍照'] }
  ]);
});

test('camera profile labels use 静态标签 while detection 要素 remains separate', () => {
  for (const legacyLabel of ['画面静态元素', '静态元素', '相机元素', '输入元素', '删除元素', '添加元素', '暂无元素']) {
    assert.equal(mapSource.includes(legacyLabel), false, `Found legacy label: ${legacyLabel}`);
  }
  assert.match(mapSource, /静态标签/);
  assert.match(mapSource, /检测要素/);
  assert.match(mapSource, /data-profile-field="elements"/);
  assert.match(framework, /静态标签/);
  assert.match(framework, /检测要素/);
  assert.match(mountingSpec, /相机静态标签按六类参考值/);
});

test('published HTML entry points load the refreshed static-tag map script', () => {
  const assets = [
    '<link rel="stylesheet" href="个人版地图运营.css?v=static-tags-20261106">',
    '<script src="个人版地图运营.js?v=static-tags-migration-20261106"></script>'
  ];
  for (const asset of assets) {
    assert.ok(index.includes(asset));
    assert.ok(framework.includes(asset));
  }
});

test('legacy saved camera tags migrate to static defaults and keep custom static tags', () => {
  const migrate = loadMapFunction('migrateLegacyProfileTags', {
    normaliseProfileTags: loadMapFunction('normaliseProfileTags', {}, false)
  }, false);
  assert.deepEqual(JSON.parse(JSON.stringify(migrate(['游客', '行人'], ['广场', '适合散步']))), ['广场', '适合散步']);
  assert.deepEqual(JSON.parse(JSON.stringify(migrate(['行人', '自定义树木'], ['广场']))), ['自定义树木']);
  assert.deepEqual(JSON.parse(JSON.stringify(migrate(['步道', '出入口'], ['广场']))), ['步道', '出入口']);

  const key = 'hz:hz-public:HZ-C02';
  const profiles = { [key]: { scene: '公共休闲空间、步行区域', tags: ['游客', '行人'], elements: ['人流', '排队'] } };
  let persisted;
  const analysisProfile = loadMapFunction('analysisProfile', {
    analysisProfileKey: 'seetime-personal-analysis-profiles-v1',
    analysisProfileStore: () => profiles,
    analysisProfileStorageKey: () => key,
    analysisProfileDefaults: camera => camera.demoProfile,
    migrateLegacyProfileTags: migrate,
    localStorage: { setItem: (storageKey, value) => { persisted = { storageKey, value }; } }
  }, false);
  const camera = { id: 'HZ-C02', demoProfile: { tags: ['广场', '适合散步'] } };
  assert.deepEqual(JSON.parse(JSON.stringify(analysisProfile(camera).tags)), ['广场', '适合散步']);
  assert.equal(persisted.storageKey, 'seetime-personal-analysis-profiles-v1');
  assert.deepEqual(JSON.parse(persisted.value)[key].tags, ['广场', '适合散步']);
});

test('analysis config starts with 36 static tags and migrates only the old built-in defaults', () => {
  const categories = loadMapFunction('staticTagCategories');
  const lines = framework.split('\n');
  const context = {
    PAC_KEY: 'seetime-personal-analysis-config-v1',
    window: { SeeTimeMapOps: { staticTagCategories: categories } },
    localStorage: { getItem: key => key === 'seetime-personal-analysis-config-v1' ? null : null }
  };
  vm.createContext(context);
  for (const name of ['pacStaticTags', 'pacLoad']) {
    const declaration = lines.find(line => line.startsWith(`function ${name}(`));
    assert.ok(declaration, `Missing function ${name}`);
    vm.runInContext(declaration, context);
  }
  const defaults = context.pacLoad();
  assert.equal(defaults.tags.length, 36);
  assert.equal(defaults.tags[0].category, '空间与场地');

  const oldDefaults = ['车辆', '行人', '排队', '车位', '道路', '步行区域'].map((name, index) => ({ id: `t${index + 1}`, name }));
  const savedPrompts = [{ id: 'custom-prompt', name: '保留配置', version: '1.0' }];
  context.localStorage.getItem = () => JSON.stringify({ tags: oldDefaults, prompts: savedPrompts });
  const migrated = context.pacLoad();
  assert.equal(migrated.tags.length, 36);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.prompts)), savedPrompts);

  const customTags = [{ id: 'custom', name: '用户自定义' }];
  context.localStorage.getItem = () => JSON.stringify({ tags: customTags, prompts: savedPrompts });
  const preserved = context.pacLoad();
  assert.deepEqual(JSON.parse(JSON.stringify(preserved.tags)), customTags);
});

test('sidebar controls use dark circular collapse and account card styling', () => {
  assert.ok(framework.includes('.sidebar>.sidebar-toggle{position:absolute;top:50%;right:-16px;'));
  assert.ok(framework.includes('.sidebar-bottom{position:relative;padding:18px 8px 2px}'));
  assert.ok(framework.includes('.user-box{min-height:68px;gap:11px;padding:12px 10px;border-radius:13px;background:#111f33}'));
});
