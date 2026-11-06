# 部署说明

仓库提供 GitHub Pages 入口和 Render 单个 Docker Web Service 配置：Pages 提供入口页，入口指向 Render 上的完整网站；Render 构建阶段编译 Vue 前端并打包进 Spring Boot，运行阶段由 Java 在同一站点提供网页和 API。数据库使用 PostgreSQL，音视频使用单独的 LiveKit 服务。这样登录、互动和媒体连接不依赖跨站点 Cookie，适合手机浏览器。

当前部署使用 Neon 免费 PostgreSQL、Render 免费 Web Service 和 LiveKit Cloud。之前创建的 Supabase 项目保留，但当前网站没有连接它：从 Render 连接其连接池时 TLS 握手失败。

## GitHub Pages 入口

1. 仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。工作流 `.github/workflows/pages.yml` 会发布 `pages/` 目录。
2. `pages/config.js` 指向 Render 的 HTTPS 地址。修改并推送此文件后，Pages 工作流会更新入口并跳转到相应网站。
3. 登录和注册在 Render 网站完成；GitHub Pages 入口本身不接收账号密码。

GitHub Pages 为免费个人账号提供公开仓库站点；具体使用限制见 [GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。本项目为课程演示，尚未完成正式运营所需的验收。

## 准备服务

1. 将项目放入用户自己的 Git 仓库，创建 PostgreSQL 数据库和 LiveKit Cloud 项目。
2. 在 Render 连接仓库，使用根目录的 `render.yaml` 或以 `Dockerfile` 创建 Web Service。根据实际账号确认免费额度、休眠行为和计费条件。
3. 在 Render 环境变量中配置下列值；真实密钥只填在服务提供商的密钥设置中，不要提交到仓库。

| 变量 | 内容 |
| --- | --- |
| `APP_ENV` | `production`，`render.yaml` 已设置 |
| `COOKIE_SECURE` | `true`，`render.yaml` 已设置 |
| `DATABASE_URL` | `jdbc:postgresql://主机:端口/数据库?sslmode=require` |
| `DATABASE_USER` | PostgreSQL 用户名，连接池用户名以数据库提供商的设置为准 |
| `DATABASE_PASSWORD` | PostgreSQL 密码 |
| `LIVEKIT_URL` | LiveKit 项目提供的 `wss://` 地址 |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | 对应的 LiveKit API secret |
| `APP_PUBLIC_ORIGIN` | 可选。默认使用 Render 提供的 `RENDER_EXTERNAL_URL`；使用自定义域名时设为实际的 `https://域名`，不要带路径或末尾斜杠 |

4. 当前 Neon 连接使用连接池、TLS 和 `prepareThreshold=0`。如果使用 Supabase，建议为本项目单独创建免费项目并关闭 Data API，避免将本项目的表直接暴露到自动生成的接口；本应用通过后端 JDBC 访问数据库，不需要 Data API。按项目提供的连接信息检查 IPv4、连接池和 TLS 要求。
5. 在 LiveKit 项目的 Webhook 配置中添加 `https://你的域名/api/livekit/webhook`。后端会验证签名；即使 Webhook 延迟，也会定期核对媒体连接状态。
6. 完成部署后访问 `/api/system/status`，再用实际的主播和观众设备检查注册、开播、播放、互动、连麦及结束直播。测试手机和校园网时使用真实的公网 HTTPS 地址。

生产配置会拒绝 H2、默认开发密钥、非 HTTPS 页面来源、非 WSS 媒体地址及未启用 Secure 的会话 Cookie。会话保存在应用进程内，实例重启后用户需重新登录；当前配置以单实例为目标，不适合直接扩展为多个应用实例。

## 发布前检查

- 核对数据库备份和服务商额度；不要将开发口令或 `.env` 文件提交仓库。
- 检查 HTTPS、摄像头和麦克风授权、不同网络下的 LiveKit 连接。
- 完成 [验证记录](verification.md) 中尚未执行的真实设备和持续运行测试。
- 增加正式运营需要的审计、内容审核、请求限流、监控告警、数据保留与恢复策略。

Render 已成功构建并启动生产镜像。本地 Docker Compose 容器启动仍未验证。

当前 Render 服务通过公开仓库地址部署，代码推送后不会自动更新后端。需要更新网站时，在 Render 服务页面选择 **Manual Deploy → Deploy latest commit**；GitHub Pages 入口仍由 Actions 自动更新。

## 免费额度与限制

- [Render 免费服务](https://render.com/docs/free)：工作区内所有免费 Web 服务共享每月 750 小时；空闲 15 分钟后休眠，首次访问可能需要约一分钟唤醒。带宽或构建额度超限后，如果账户已添加付款方式可能产生费用；请在 Render 控制台核对当前额度和账单设置。免费 Render Postgres 30 天后到期，因此当前使用 Neon 保存数据。
- [Neon 免费计划](https://neon.com/docs/introduction/plans)：每项目每月包含 100 CU 小时、1 GB PostgreSQL 存储和 5 GB 公网传输；闲置 5 分钟后计算实例会暂停。计算或传输额度耗尽后服务会暂停至下个计费周期或升级，请在控制台关注用量。
- [Supabase 免费项目](https://supabase.com/docs/guides/platform/free-project-pausing)：数据库活动长期不足时可能暂停，需要在控制台恢复；定期备份重要数据。
- [LiveKit Cloud Build 免费额度](https://docs.livekit.io/deploy/admin/quotas-and-limits/)：当前包括每月 5,000 参与者分钟及 50 GB 下行流量。每个连接各自计时，例如一位主播和五位观众同时在线 30 分钟约使用 180 参与者分钟；达到免费额度后新请求会受限。实际额度以服务商控制台为准。
