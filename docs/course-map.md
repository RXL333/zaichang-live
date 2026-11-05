# 课程知识与项目代码对应

| 课程内容 | 项目中的对应位置 |
| --- | --- |
| 第 1–3 周：HTTP、REST、JSON 和前后端交互 | `live-server/.../AuthController.java`、`RoomController.java`、`SessionController.java`；前端 `live-web/src/api.js` |
| 第 4–6 周：WebSocket、房间与消息广播 | `SocketConfig.java`、`LiveSocket.java`、`RoomBroadcaster.java` 和 `live-web/src/liveSocket.js`；包含 `JOIN`、`DANMAKU`、`USER_COUNT`、`SYSTEM`、`ERROR` 等消息 |
| 第 7 周：弹幕展示与动画 | `live-web/src/components/DanmakuLayer.vue`；消息进入轨道，动画结束后清理，页面可以关闭弹幕 |
| 回调：事件处理与异步响应 | `liveSocket.js` 的消息和连接状态回调；`RoomInteractions.vue` 对消息、恢复和互动事件的处理 |
| 数据库 | `live-server/src/main/resources/schema.sql` 和 `Db.java`；正式环境使用 PostgreSQL |
| 媒体通信与权限 | `MediaService.java` 签发 LiveKit 凭证，`RoomView.vue` 和 `StudioView.vue` 管理媒体连接 |

浏览器调用 `fetch()` 时立即得到的是 `Promise`，等待结果后才能读取响应；项目的 `api.js` 用 `await` 处理这一过程。

**人数口径：** WebSocket 的 `USER_COUNT` 表示房间中的互动连接数；展示给观众的观看人数基于媒体服务中的实际观众身份去重，并排除主播。一个账号在多个页面打开不会被重复算作多个观众。
