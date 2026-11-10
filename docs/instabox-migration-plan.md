# InstaBox 迁移与验收

目标：GitHub Pages 承载完整 Vue 前端，InstaBox 承载 Spring Boot 和 WebSocket；继续使用现有 Neon 和 LiveKit Cloud。旧 Render 服务在新部署验证通过前保留。

1. 调整前端构建路径、API 地址及路由，使 GitHub Pages 可直接提供完整网站。
2. 为跨站点前后端配置明确的来源限制和不依赖第三方 Cookie 的会话；验证登录、退出、房间权限与 WebSocket 身份。
3. 为 InstaBox 准备可重复执行的一键启动脚本、受限权限的环境文件和容器自动重启配置；公开 HTTPS 端口用于访问及空闲唤醒。
4. 安全配置现有数据库及 LiveKit 凭据，部署后端，检查健康接口、跨域和 WebSocket；更新 LiveKit Webhook。
5. 发布 Pages，验证桌面和移动端入口、登录与直播互动；核对自动唤醒及断线恢复。记录实际通过、失败和未执行项。

仅在新后端通过验证后切换 Pages；密钥不进入仓库、日志或网页。真实摄像头、多网络音视频和五名观众持续测试需要实际设备参与，未执行时不得写成通过。
