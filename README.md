# SeeTime 业务框架原型

静态前端演示，使用本机示例数据；无后端服务。

## 相机挂载地图配置

- 新增 POI 调用高德 JS API 的 `AMap.PlaceSearch`。部署时需配置具有地点搜索权限的 Web 端 Key 和匹配的安全配置。现有配置入口为 `SeeTime高德地图配置.js`，也支持通过 `serviceHost` 接入高德安全代理。
- 百度全景及快照由 `window.SEETIME_BAIDU_PANORAMA_AK` 启用。部署时在地图运营脚本加载前设置授权了该站点和相应全景服务的浏览器端 AK。缺少配置时，新标签页打开 POI 的百度地图定位，地图内快照卡片显示服务状态。
