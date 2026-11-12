# 验证记录

记录日期：2026-11-12。下面仅记录本轮实际执行的检查。历史版本中的记录可从 Git 历史查看，不作为本轮重新验收的结果。

## 自动化验证

- `cd live-web` 后执行 `npm ci`：依赖安装完成。
- `cd live-web` 后执行 `npm test`：40 项测试通过，包含服务启动重试、错误提示、弹窗焦点与确认、入会查询及限流消息的前端处理。
- `cd live-web` 后执行 `npm run build`：生产构建成功；会议室分块约 599 KB，Vite 提示超过 500 KB，尚未处理。
- `cd live-server` 后执行 `mvn '-Djdk.net.unixdomain.tmpdir=C:\Windows\Temp' -B test`：15 项测试通过，包含会议密码、消息隔离、限流、凭证权限和结束后加入的本地测试；媒体管理服务在集成测试中使用模拟对象。
- 使用 Python 的 PyYAML 解析 `.github/workflows/ci.yml` 和 `.github/workflows/pages.yml`：YAML 语法解析成功。这不等于 GitHub 上的工作流和发布门禁已经验收。
- GitHub 上的 [CI 运行 43221645169](https://github.com/RXL333/zaichang-live/actions/runs/43221645169) 对提交 `6fb54c2` 的前端和后端均成功；随后 [Pages 运行 43221752357](https://github.com/RXL333/zaichang-live/actions/runs/43221752357) 完成构建和发布。故意失败的 PR 场景未执行。
- 公网健康接口返回 HTTP 200 和 `status: OK`，响应中包含 GitHub Pages 来源的 CORS 允许头；以不存在的会议号检查 WSS，收到预期的 404 错误。没有用真实账号或实际音视频做线上测试。
- 更新云端前已生成 PostgreSQL 备份，并用 `pg_restore --list` 检查文件格式；同时备份了原代码和原镜像。未执行数据库恢复演练。

本机直接运行 Maven 测试时，Windows JDK 的 AF_UNIX 临时目录导致 3 项测试无法建立本地连接；增加上述 `jdk.net.unixdomain.tmpdir` 参数后重跑通过。

## 人工验证

- 2026-11-12，Windows 11 本机、Codex 内置浏览器；使用本地 Vite 和临时 H2 内存数据库。打开登录弹窗后，焦点进入账号输入框；按 Esc 后弹窗关闭、焦点回到登录按钮。
- 在首页输入不存在的会议号并进入入会页，看到“没有找到这个会议，请检查会议号”，可以返回首页。未创建线上账号或会议。

## 未验证

- InstaBox 自动休眠后的实际唤醒耗时、手动停止后的恢复以及跨网络访问；页面的重试仅通过模拟测试验证。本次先观察到机器处于休眠状态，一次公网请求在 30 秒后超时，之后机器显示运行中且健康检查成功；没有测得完整唤醒耗时。
- 在 GitHub 创建故意失败的测试 PR 并核验 CI 标红及 Pages 不发布；工作流通过语法检查不代表已完成这项验证。
- 真实摄像头、麦克风、屏幕共享、扬声器、OBS 推流、多设备、多网络及多人音视频；没有以模拟设备结果替代真实设备验收。
- LiveKit Cloud 在成员被移出后的已签发凭证、断网重连、会议结束和服务异常时的实际行为。当前媒体服务是 LiveKit Cloud，不是自建流媒体服务器。
- 完整键盘操作、读屏、对比度、真实手机和长时间稳定性；本轮只验证上面列出的弹窗键盘行为。

安全限制和代码核对见 [安全核对](security-review.md)。
