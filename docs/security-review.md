# 会议安全核对

核对日期：2026-11-12。范围是现有会议接口、会议 WebSocket 和 LiveKit Cloud 凭证；这是一份代码核对与本地测试记录，不是外部安全审计。

| 项目 | 现状与位置 | 边界与后续建议 |
| --- | --- | --- |
| 会议号和密码尝试 | 已加固：`MeetingService.join` 调用 `MeetingRateLimiter`；每个已登录账号一分钟最多尝试入会 12 次，错误会议号和错误密码也计入。超限返回 429；正常加入也计入，避免并发猜测绕过。对应 `MeetingRateLimiterTest` 和 `MeetingIntegrationTest`。 | 这是单进程内存限制，重启后清空；多账号或多实例可绕过。公开会议详情查询目前没有独立的按来源限流。生产环境代理来源地址的可信边界尚未实测，暂不按 IP 限流，避免错误归因或误伤同网用户。 |
| 密码保存 | 已有：`MeetingService.passwordHash` 验证长度并使用 Spring Security 的 BCrypt，密码不放进邀请链接。 | 未做密码强度评估；会议号和密码仍需妥善分享。 |
| 音视频凭证权限和有效期 | 已有：`MeetingMediaService.token` 将凭证限定到当前会议，允许发布和订阅，禁止发布数据；有效期为 5 分钟。`MeetingIntegrationTest` 检查房间、权限及有效期。 | 浏览器会议需要发布摄像头、麦克风和屏幕共享，当前没有更细的轨道来源限制。签发前由 `MeetingController` 检查会议授权。 |
| 移出成员后的授权 | 部分已有：`MeetingSocket` 增加成员的 `grant_version`、关闭该成员的会议 WebSocket，并调用 `MeetingMediaService.removeMember` 删除 OBS 入口和媒体参与者；后续会议状态与媒体凭证请求再次校验授权。测试覆盖旧会议授权失效。 | 已签发的 LiveKit JWT 不是由应用直接撤销的；服务端断开操作失败会向主持人提示，已签发凭证在 LiveKit Cloud 的拒绝与重新连接表现仍需实测。移出不是永久封禁：成员可重新完成正常入会流程。 |
| 聊天消息长度和频率 | 已有长度限制并新增频率限制：`MeetingSocket` 限制 WebSocket 消息长度，`MeetingService.chat` 将聊天内容限制为 1000 个字符；`MeetingRateLimiter` 对每个会议中的每个账号限制为 10 秒内 20 条。测试覆盖超长、限频和用户／会议隔离。前端会保留被限流而未发送的文本。 | 每次聊天请求均计入，包括重复发送的消息；限流状态在服务重启后清空。其他 WebSocket 指令尚无统一频率限制；分布式限流和恶意连接防护未做。 |
| CORS 与 WebSocket 来源 | 已有：`SecurityConfig` 对 `/api/**` 配置允许来源、方法和请求头；`SocketConfig` 为会议 WebSocket 配置允许来源。`HeaderSessionIntegrationTest` 验证配置来源的响应头。 | 来源检查主要约束浏览器，不能代替身份验证；代理头的信任配置、所有拒绝路径及生产配置仍需单独核验。 |
| 会议结束后重新加入 | 已有：`MeetingService.requireOpen` 在加入和授权校验时拒绝已结束会议；结束时 `MeetingController.end` 关闭媒体、更新状态并使授权版本失效。集成测试验证结束后加入返回 409。 | 真实 LiveKit Cloud 在结束、断网和媒体服务异常时的表现未实测。 |

未调整数据库表、鉴权机制或 WebSocket 消息协议。注册／登录接口、公开查询、基础设施层的防刷与防拒绝服务保护不在本次加固范围内，不能把上述限流视为完整的生产安全方案。
