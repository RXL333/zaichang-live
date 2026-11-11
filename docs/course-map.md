# 课程知识与项目代码对应

| 课程内容 | 项目中的对应位置 |
| --- | --- |
| HTTP、REST、JSON | `AuthController.java`、`MeetingController.java`；前端 `api.js` |
| WebSocket 与会议隔离 | `SocketConfig.java`、`MeetingSocket.java`、`meetingSocket.js`；连接、聊天、成员变化和管理指令均按会议处理 |
| 回调与断线恢复 | `meetingSocket.js` 的事件和连接状态回调；会议页面在重新连接后重新获取聊天记录和成员状态 |
| 数据库与事务 | `schema.sql`、`Db.java`、`MeetingService.java`；会议消息按客户端消息编号去重 |
| 账号和访问权限 | `AuthController.java`、`SecurityConfig.java`、`MeetingService.java`；密码哈希存储，服务端校验会议加入和主持人权限 |
| 音视频和 OBS | `MeetingMediaService.java` 签发会议媒体凭证并创建 OBS Ingress；`MeetingRoomView.vue`、`MeetingMedia.vue` 管理浏览器媒体和画面 |

`fetch()` 在结果未到达时返回 Promise；`api.js` 使用 `await` 处理响应。视频由 LiveKit Cloud 转发，WebSocket 聊天与会议管理由本项目后端实现。
