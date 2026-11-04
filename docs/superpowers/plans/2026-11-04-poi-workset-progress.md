# POI 工作项进度与挂载入口实现计划

> **For agentic workers:** 本计划在当前会话内由主执行者逐项完成；每个实现任务以失败测试开始并独立验收。

**Goal:** 让 POI 挂载工作区按 POI 关联工作项显示可信进度，附近线索不混入分母，且 POI 入口锁定原目标 POI。

**Architecture:** 保持现有单页地图与本机示例数据。增加一个纯派生的 `(POI, camera)` 工作项汇总函数，供 POI 树和工作区复用；相机入口继续用现有关系状态，但将项目全量 POI 改为非空搜索后的结果；POI 入口的流程视图根据 entryMode 显示固定目标。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node `node:test`、Chrome CUA 浏览器。

## Global Constraints

- 只改 `SeeTime业务框架.html` 及该页面已引用的样式和脚本；新增测试与本地开发记录不改变运行时架构。
- 本机示例数据，不接入后端，不改导航、地图主题或地图质感。
- POI进度 = 已挂载 + 待挂载 + 待审核；显式标记无法挂载的未完成候选不进入分母；nearby 排除。
- POI入口固定目标 `targetPoiId`；相机入口仅 AI建议/附近两个主 Tab，项目 POI 只通过非空搜索显示。

---

### Task 1: 覆盖 POI 工作项口径

**Files:**
- Create: `tests/poi-workset-progress.test.cjs`
- Modify: `个人版地图运营.js`

- [ ] **Step 1: 写失败测试**
  - 测试 manual、ai_pre、candidate 分别进入已完成、待审核、待挂载。
  - 测试同一关系的重复 candidate 去重；挂载到另一个 POI 不会清掉本 POI 的 candidate；unmountable 关闭其候选工作项并从分母排除；nearby 距离不进入集合。
  - 测试计数恒等式和空数据 `0/0`。
- [ ] **Step 2: 运行测试并确认失败**
  - `node --test tests/poi-workset-progress.test.cjs`
- [ ] **Step 3: 实现纯汇总函数并复用**
  - `poiWorksetFor(poi,cameras)` 返回三类去重相机及 `total`、`completedPercent`。
  - 权威维度是 `cameraId + poiId`，不可用“相机已挂到别的 POI”全局排除其他候选关系。
- [ ] **Step 4: 重跑测试**
  - `node --test tests/poi-workset-progress.test.cjs`

### Task 2: POI目录和工作区显示进度，附近次级折叠

**Files:**
- Modify: `个人版地图运营.js`
- Modify: `个人版地图运营.css`
- Test: `tests/poi-workset-progress.test.cjs`

- [ ] **Step 1: 写渲染断言并确认失败**
  - POI树显示已挂载分子/分母和百分比、待挂载及待审核数。
  - POI工作区汇总与树使用同一个 helper；已挂载、待确认、附近相机三种状态卡筛选到一致列表，空的状态分组隐藏。
  - 附近独立于工作项进度，默认收起；筛选附近时自动展开并显示免责声明。
- [ ] **Step 2: 实现最小 UI**
  - 仅给叶子 POI 行加紧凑进度。父级 AOI不虚构汇总。
  - 工作区用完成/待挂载/待审核三组；附近组使用原生 `<details>` 默认关闭。
- [ ] **Step 3: 测试**
  - `node --test tests/poi-workset-progress.test.cjs`
  - `git diff --check`

### Task 3: 相机入口全项目搜索兜底，POI入口固定目标

**Files:**
- Modify: `个人版地图运营.js`
- Modify: `个人版地图运营.css`
- Test: `tests/poi-workset-progress.test.cjs`

- [ ] **Step 1: 写失败测试**
  - 渲染的主 Tab 仅含 AI建议、附近 POI；空搜索不显示全项目列表。
  - 搜索项目 POI 按名称/ID过滤，搜索结果不与当前附近列表叠加；选中结果只形成草稿。
  - `entryMode='poi'` 时核对、确认和保存都只能使用 `targetPoiId`，没有 POI来源 Tab/选择器。
- [ ] **Step 2: 实现最小入口分流**
  - 空 query 渲染当前 Tab；非空 query 搜索当前项目城市 POI 集合，并显示“项目 POI 搜索结果”。
  - POI入口第2步使用 `mountCurrentTarget()`，步骤标题及动作文案改为 POI 语义；保存动作在 POI 模式强制取目标 ID。
- [ ] **Step 3: 本地浏览器走查**
  - 相机入口候选/附近/远距离搜索并保存。
  - POI入口候选/附近相机核对，逐步确认目标固定，保存回同一 POI。

### Task 4: 回归和交付

**Files:**
- Modify: `个人版地图运营.js`, `个人版地图运营.css`, `SeeTime业务框架.html`, `index.html`
- Create: `验收截图/*`

- [ ] **Step 1: 运行所有 Node 回归测试、JS 语法检查、diff check**
- [ ] **Step 2: 浏览器按 POI 首页、状态筛选、附近折叠、两类入口、项目切换逐项验收**
- [ ] **Step 3: 检查窄屏显示，保存验收截图，说明 mock/实际能力边界**
- [ ] **Step 4: 同步本地交付目录；验收通过后提交并按既有授权推送**
