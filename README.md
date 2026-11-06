# SeeTime 业务框架原型

前端使用本机示例数据。新增 POI 的名称搜索通过单独的高德代理执行。

## 相机挂载地图配置

- 底图使用 `SeeTime高德地图配置.js` 中的高德 JS API 配置。
- 名称模糊检索调用高德 Web 服务 `GET /v3/place/text`，用 `keywords`、`city`、`citylimit=true`、`offset=20`、`page=1`、`extensions=all` 获取当前城市的结果。
- 本地运行前在服务进程环境中设置 `SEETIME_AMAP_WEB_SERVICE_KEY`，再执行 `python3 scripts/serve_demo.py --port 8794`。从 `http://127.0.0.1:8794/` 打开，搜索请求走同源 `/api/amap/poi-search`。Key 需为高德 Web 服务类型。
- GitHub Pages 只能提供静态前端。部署时在地图运营脚本加载前配置 `window.SEETIME_AMAP_POI_SEARCH_URL` 为受授权的 HTTPS 代理。代理接收 `keywords` 与 `city`，返回高德 JSON 响应，并允许 GitHub Pages 站点跨域访问。将 Web 服务 Key 保留在代理环境中。
- 百度全景及快照由 `window.SEETIME_BAIDU_PANORAMA_AK` 启用。部署时在地图运营脚本加载前设置授权了该站点和相应全景服务的浏览器端 AK。缺少配置时，新标签页打开 POI 的百度地图定位，地图内快照卡片显示服务状态。
