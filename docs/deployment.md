# 会议系统部署与使用

[在场会议](https://rxl333.github.io/zaichang-live/)的前端使用 GitHub Pages；Spring Boot 和 WebSocket 运行在 InstaBox，数据库使用 Neon PostgreSQL，音视频和 OBS 入口使用 LiveKit Cloud。InstaBox 后端镜像也包含一份前端，可以从后端的公开 HTTPS 地址访问。

## 日常使用与启动

打开网站后登录，创建会议或输入会议号。InstaBox 因空闲自动暂停时，访问公开 HTTPS 地址会尝试唤醒，首次连接可能需要等待；手动停止、手动暂停或平台冷却时不能保证自动恢复。也可以打开仓库的 Actions，运行“启动会议服务”工作流。工作流只发送健康检查请求，不持有云电脑管理凭证。

自动休眠后的实际唤醒耗时：待实测。页面启动时会有限次数地重试；超过等待上限时可手动重试。

云电脑的应用目录为 `/data/zaichang-live/app`，环境配置保存在 `/data/zaichang-live/secrets.env`，不要将其加入 Git 或输出到日志。构建或代码更新后，在云电脑中运行：

```bash
cd /data/zaichang-live/app
./scripts/instabox-start.sh
```

容器配置了 `restart: unless-stopped`。自动暂停恢复、整机重启恢复和免费额度，以平台实际运行状态为准。

## 前端发布

推送 `main` 分支的前端代码后，GitHub Actions 构建并发布 `live-web/dist`。GitHub Pages 使用 `/zaichang-live/` 子路径和哈希路由；媒体和业务请求通过 HTTPS/WSS 连接 InstaBox。环境变量中的后端地址改变时，同步更新 `.github/workflows/pages.yml` 和 `compose.instabox.yaml` 的允许来源。

## 会议与 OBS

创建会议后，登录用户可以通过会议号或邀请链接加入。会议昵称只影响当前会议。摄像头、麦克风和屏幕共享需要由参会者主动开启；浏览器可能需要用户授权。

在会议内打开“OBS”，生成服务器地址和 Bearer Token。OBS Studio 中进入“设置 → 推流”，将服务选为 WHIP，分别填写服务器地址和 Bearer Token，再选择摄像头、桌面和音频源并开始推流。该信息只供本人使用，重新生成或停止推流会使旧凭证失效。浏览器和 OBS 不应同时采集同一麦克风，以免回声；OBS 中混合为同一音轨的声音会一同被主持人静音。

LiveKit Cloud 的 Ingress 有免费额度和并发限制；不保证所有网络和 OBS 版本均可用。[服务商的限制说明](https://docs.livekit.io/deploy/admin/quotas-and-limits/)。当前系统未自行在云服务器部署流媒体服务，课程要求中的该项应如实说明。

## 数据和验收

账号保留在 `app_users`；旧直播测试记录使用 `scripts/clear-live-test-data.sql` 一次性清空，该脚本不会删除账号或会议表。执行前确认目标数据库，禁止把数据库凭据写入命令行、Git 或日志。

参见 [测试记录](verification.md)。演示前应通过不同设备及网络检查会议密码、摄像头、麦克风、屏幕共享、实时聊天、成员管理和 OBS 推流，并如实记录未执行的项目。
