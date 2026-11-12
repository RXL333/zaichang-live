# 在场会议

[![CI](https://github.com/RXL333/zaichang-live/actions/workflows/ci.yml/badge.svg)](https://github.com/RXL333/zaichang-live/actions/workflows/ci.yml)

一个基于 Vue 3、Spring Boot、WebSocket 和 LiveKit 的在线会议课程设计。会议创建者可以管理会议，参会成员可以使用摄像头、麦克风、屏幕共享、会议聊天和 OBS 推流。

线上入口：[在场会议](https://rxl333.github.io/zaichang-live/)。前端由 GitHub Pages 提供，后端运行在 InstaBox，账号和会议数据保存在 Neon PostgreSQL，音视频由 LiveKit Cloud 提供。InstaBox 后端也包含一份前端构建产物。

## 使用方式

1. 注册或登录，创建会议并设置名称；可选设置会议密码。
2. 将会议号或邀请链接发送给其他人。参会者登录后输入会议昵称和会议密码加入。
3. 参会时根据需要主动开启摄像头、麦克风或屏幕共享。主持人可以管理成员昵称、静音、移出成员及结束会议。
4. 如使用 OBS，在会议中打开 OBS 推流面板，生成专属信息，在 OBS 的“设置 → 推流”中选择 WHIP，填写服务器地址和 Bearer Token。请勿泄露 Token；重新生成会使之前的地址失效。OBS 和浏览器不要同时采集同一麦克风，以免回声。

LiveKit Cloud 免费套餐的具体额度和并发限制以服务商控制台为准。自动休眠唤醒、不同网络以及真实音视频设备的表现，应在演示前确认。自建流媒体服务器仍是教师要求中未完成的一项；当前使用的是 LiveKit Cloud。

## 本地运行

需要 Java 17、Maven、Node.js 和 PostgreSQL 或 H2。以下以 PowerShell 为例：

```powershell
# 项目根目录，另开一个终端启动前端
powershell -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1
```

```powershell
cd live-web
npm ci
npm run dev
```

默认前端为 `http://localhost:5173`，后端为 `http://localhost:18080`。后端未配置 PostgreSQL 时使用本地 H2 数据库。音视频还需要可访问的 LiveKit 服务及对应的 `LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`，参见 [部署说明](docs/deployment.md)。

## 检查与资料

```powershell
cd live-server
mvn test
cd ..\live-web
npm test
npm run build
```

- [部署与 OBS 说明](docs/deployment.md)
- [课程内容与代码对应](docs/course-map.md)
- [测试记录](docs/verification.md)
- [会议改造计划](docs/meeting-implementation-plan.md)

原直播测试记录按用户要求清空，原账号保留。项目不声称已通过生产环境安全、容量或长时间运行验收。
