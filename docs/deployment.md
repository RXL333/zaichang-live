# 部署说明

在场 LIVE 的完整 Vue 前端发布在 [GitHub Pages](https://rxl333.github.io/zaichang-live/)，Spring Boot 和 WebSocket 运行在 InstaBox，数据使用 Neon PostgreSQL，音视频使用 LiveKit Cloud。GitHub Pages 不保存数据库或服务密钥。

## 日常使用

直接打开网站即可。InstaBox 因空闲自动暂停时，网站请求公开 HTTPS 地址可触发恢复；页面首次连接可能需要等待。平台冷却期间、机器被手动暂停或停止时，普通访问不能保证立即恢复，需按平台控制台提示操作。[InstaBox 自动暂停规则](https://instabox.sh/docs/machines/auto-pause)

也可在 GitHub 仓库的 **Actions → 启动直播服务 → Run workflow** 中点击运行。此操作向服务发送健康检查请求，适用于自动暂停后的唤醒；它不持有云电脑的管理密钥，不能解除手动停止或平台冷却。

## 云电脑启动与更新

应用目录是 `/data/zaichang-live/app`，数据库及 LiveKit 配置单独保存在 `/data/zaichang-live/secrets.env`，文件权限为 `600`，不放入仓库或 Docker 构建目录。

在云电脑终端执行：

```bash
cd /data/zaichang-live/app
./scripts/instabox-start.sh
```

脚本使用 `compose.instabox.yaml` 构建并启动后端，等待 `/api/system/status` 成功。Docker 容器配置了 `restart: unless-stopped`；云电脑重启后，Docker 服务启用时会尝试恢复容器。自动暂停和恢复保留运行中的进程。构建或配置变更需要重新运行脚本；普通访问无需运行。

环境文件包含 `DATABASE_URL`、`DATABASE_USER`、`DATABASE_PASSWORD`、`LIVEKIT_URL`、`LIVEKIT_API_KEY`、`LIVEKIT_API_SECRET`。如需从原 Render 服务重新导入，可在云电脑交互式终端运行 `python3 scripts/import-render-env.py`，按提示输入临时 Render API Key；导入后撤销该临时密钥。脚本不会覆盖已存在的配置文件。

## 前端发布

仓库 Settings → Pages 的来源为 **GitHub Actions**。推送 `main` 的前端代码后，`.github/workflows/pages.yml` 构建 Vue 并发布 `live-web/dist`，同时保留原有 `showcase` 页面。构建配置中的 `VITE_API_ORIGIN` 是 InstaBox 提供的公开 HTTPS 地址；更换端口地址时同步修改该值。

GitHub Pages 使用子路径和哈希路由，因此刷新和分享房间链接不依赖服务器端路由。跨站会话通过请求头传递，保存在当前浏览器标签页，避免依赖第三方 Cookie；后端只允许配置的 GitHub Pages 来源。后端重启后需要重新登录。

## LiveKit 与备用服务

LiveKit Cloud 的 Webhook 应指向 `https://18080-agq4iihhd6ie55qjpl2ezecsrm.instabox.tech/api/livekit/webhook`，使用与后端一致的签名密钥。即使通知延迟，后端也会定期核对媒体连接状态。

原 Render 服务可作为备用；它保留原有部署，运行自己的前后端。切换入口前应先验证新服务，出现问题时可使用原 Render 地址访问。备份服务与新后端连接同一数据库，避免同时进行可能冲突的管理操作。

## 验收与限制

查看 [验证记录](verification.md)，并使用真实设备检查登录、开播、屏幕共享、观众观看、互动和连麦。InstaBox 免费套餐的最长连续运行时间、冷却、流量以及 GitHub Actions 和 LiveKit 的免费额度均以各自控制台与当前政策为准；短时课程演示前应提前检查服务状态。
