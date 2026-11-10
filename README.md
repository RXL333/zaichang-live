# 在场 LIVE

一个面向课程设计的互动直播项目：Vue 3 前端、Spring Boot 后端、WebSocket 实时互动和 LiveKit 音视频。直播大厅、观看页和主播工作台均使用真实房间、场次和互动数据；空房间不会填充虚构观众或假消息。

[打开在场 LIVE](https://rxl333.github.io/zaichang-live/)：前端由 GitHub Pages 提供，后端运行在 InstaBox 云电脑上，数据保存在 Neon PostgreSQL，音视频由 LiveKit Cloud 提供。日常访问不依赖个人电脑开机。

云电脑自动暂停后，访问网站会尝试唤醒服务，首次连接可能需要等待。也可在 GitHub 仓库的 Actions 中运行“启动直播服务”；云端重建命令及限制见 [部署说明](docs/deployment.md)。

[光标构建展示](https://rxl333.github.io/zaichang-live/showcase/)是独立的纯前端概念演示，展示直播大厅、观看页和主播工作台。页面里的画面、聊天与设备操作均为示例，不连接直播服务。光标动画根据交互思路独立实现，不包含 Swarm Rebuild 的源码。

目前已经实现账号注册登录、房间与关注、直播与屏幕共享、聊天弹幕、点赞、免费礼物、投票、提问、连麦申请与主播审核等功能。云端服务已启动，真实设备、多设备长时间运行以及完整公网互动仍需按 [验证记录](docs/verification.md) 完成验收，请勿将本项目视为已经通过生产环境验证的服务。

## 运行环境

- Java 17、Maven 3.9+。
- Node.js 20.19+ 或 22.12+，建议使用 Node.js 24 LTS。
- PostgreSQL 16 和 LiveKit；也可使用仓库中的 Docker Compose 在本机启动。
- 电脑端建议使用最新版 Chrome 或 Edge，并连接摄像头及麦克风。

以下命令以 Windows PowerShell 和项目根目录为例。首次运行需要下载 Maven 与 npm 依赖。

### 1. 启动数据库和媒体服务

先启动 Docker Desktop，并等待其引擎就绪：

```powershell
docker compose up -d
docker compose ps
```

这会在本机 `5434` 启动 PostgreSQL，在本机 `7880` 启动 LiveKit 开发服务。Compose 配置只监听本机地址，开发口令也仅限本机使用，不要直接用于公网。

如果暂时没有 Docker，可以跳过本步并使用后端默认的 H2 本地文件数据库，先浏览界面和调试非媒体功能。要进行音视频，还须另行启动 [LiveKit 本地开发服务](https://docs.livekit.io/transport/self-hosting/local/)；不启动 LiveKit 时不能开播或观看音视频。

### 2. 启动后端

使用上面的 PostgreSQL 容器时，在同一个终端配置：

```powershell
$env:DATABASE_URL = 'jdbc:postgresql://localhost:5434/tongpin'
$env:DATABASE_USER = 'tongpin'
$env:DATABASE_PASSWORD = 'local-development-only'
powershell -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1
```

如果使用 H2，不要设置这三个数据库变量，直接运行脚本。脚本会构建并启动后端，默认端口为 `18080`，首次启动时自动建表。使用 H2 时数据位于 `live-server/data/`。

### 3. 启动前端

另开一个 PowerShell 窗口：

```powershell
cd live-web
npm ci
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173)，注册账号后进入“主播工作台”。创建直播间，检查设备，然后开始直播；本机可用另一个浏览器或隐私窗口登录观众账号并进入直播间。浏览器会在启用摄像头、麦克风或屏幕共享时请求权限。

**本机地址限制：** 默认 LiveKit 地址是 `ws://localhost:7880`，并且 Compose 端口仅对本机开放。因此按上述配置，多个浏览器页面只能在这台电脑上连接音视频；手机上的 `localhost` 指手机自己。跨设备测试需要所有设备可访问的 HTTPS 网站和 WSS 媒体服务，推荐按下方部署说明配置云端服务后测试。手机浏览器也需要安全上下文才能使用摄像头和麦克风。

## 使用和互动

1. 主播创建直播间，在开播前选择摄像头、麦克风或屏幕；至少开启一项并允许浏览器访问后开播。屏幕共享会在开播时让主播选择屏幕或窗口，当前只共享画面，讲解声音通过麦克风传入。播放画面以实际媒体连接为准。
2. 观众可登录后发送弹幕、点赞、赠送免费礼物、参与投票或提出问题；关注直播间后可在“我的关注”查看。
3. 观众申请连麦后，主播同意只会发出邀请；观众进一步确认后，服务端才会开放该连接的发布权限并请求设备权限。双方均可结束连麦。
4. 主播可管理消息、临时禁言、发起投票和处理提问。下播后场次结束。

观看人数按 LiveKit 中实际在线的不同观众身份去重，主播本人不计入；“连接状态”里的互动连接数是 WebSocket 连接数，两者统计口径不同。网络异常时，如果人数无法及时核实，页面会显示未知状态而不是编造数字。弹幕断线恢复有上限，超过范围时页面会提示。

## 测试

```powershell
cd live-server
mvn -B test
cd ..\live-web
npm test
npm run build
```

测试结果与未执行项目见 [验证记录](docs/verification.md)。课程知识和代码位置见 [课程知识对应说明](docs/course-map.md)。公网环境配置见 [部署说明](docs/deployment.md)。

项目不包含付费礼物、录制回放或 AI 摘要。正式开放前还需要进行安全审查、内容治理、监控告警、备份和容量测试。
