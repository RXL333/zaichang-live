package com.tongpin.live;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.session.MapSessionRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.ObjectMapper;

@Component
public class MeetingSocket extends TextWebSocketHandler {
    private final Db db;
    private final MeetingService meetings;
    private final MeetingMediaService media;
    private final MeetingRateLimiter limits;
    private final MapSessionRepository sessions;
    private final ObjectMapper mapper;
    private final SessionLocks locks;
    private final TaskScheduler scheduler;
    private final long hostReconnectDelayMs;

    // The per-meeting monitor protects these maps' values and preserves member arrival order.
    private final Map<String, LinkedHashMap<String, Set<WebSocketSession>>> active = new ConcurrentHashMap<>();
    private final Map<String, HostHandoff> handoffs = new ConcurrentHashMap<>();
    private final Map<String, MeetingPresentation> presentations = new ConcurrentHashMap<>();

    private static class HostHandoff {
        final String host;
        ScheduledFuture<?> future;

        HostHandoff(String host) { this.host = host; }
    }

    public MeetingSocket(Db db, MeetingService meetings, MeetingMediaService media, MapSessionRepository sessions,
                         ObjectMapper mapper, SessionLocks locks, MeetingRateLimiter limits, TaskScheduler scheduler,
                         @Value("${meeting.host-reconnect-delay-ms:15000}") long hostReconnectDelayMs) {
        this.db = db;
        this.meetings = meetings;
        this.media = media;
        this.sessions = sessions;
        this.mapper = mapper;
        this.locks = locks;
        this.limits = limits;
        this.scheduler = scheduler;
        this.hostReconnectDelayMs = hostReconnectDelayMs;
    }

    @Override protected void handleTextMessage(WebSocketSession socket, TextMessage message) {
        String errorType = "ERROR";
        String errorAction = "";
        try {
            if (message.getPayloadLength() > 10000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "消息过长");
            Map<?,?> data = mapper.readValue(message.getPayload(), Map.class);
            String type = Db.text(data.get("type"));
            if ("PRESENTATION".equals(type) || "SCREEN_POINT".equals(type)) {
                errorType = "PRESENTATION_ERROR";
                if ("ACCEPT".equals(data.get("action"))) errorAction = "ACCEPT";
            }
            if ("JOIN".equals(type)) {
                join(socket, Db.checked(data.get("number"), 12, "会议号"), Db.text(data.get("authToken")));
                return;
            }

            String id = (String) socket.getAttributes().get("meetingId");
            if (id == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "请先加入会议");

            synchronized (locks.meeting(id)) {
                if (!socket.isOpen() || !id.equals(socket.getAttributes().get("meetingId"))) return;
                var meeting = meetings.byId(id);
                String uid = authenticated(socket, meeting, (String) socket.getAttributes().get("authToken"));

                switch (type) {
                    case "PING" -> send(socket, Map.of("type", "PONG", "timestamp", Db.now()));
                    case "CHAT" -> chat(socket, id, uid, data);
                    case "PRESENTATION" -> handlePresentation(id, uid, meeting, data);
                    case "SCREEN_POINT" -> screenPoint(id, uid, data);
                    case "RENAME" -> {
                        meetings.rename(meeting, uid, Db.checked(data.get("userId"), 40, "成员"), Db.text(data.get("nickname")));
                        snapshot(id, meeting);
                    }
                    case "MUTE", "KICK", "MUTE_ALL", "SET_MEETING_LOCK", "TRANSFER_HOST" -> {
                        meetings.requireHost(meeting, uid);
                        handleHostAction(socket, id, uid, meeting, type, data);
                    }
                    default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不支持的会议操作");
                }
            }
        } catch (ResponseStatusException error) {
            send(socket, Map.of("type", errorType, "action", errorAction, "code", error.getStatusCode().value(),
                "message", Objects.toString(error.getReason(), "操作失败")));
        } catch (Exception error) {
            send(socket, Map.of("type", errorType, "action", errorAction, "code", "INVALID_MESSAGE", "message", "操作未完成，请重试"));
        }
    }

    private void join(WebSocketSession socket, String number, String token) {
        var meeting = meetings.byNumber(number);
        String id = meeting.get("id").toString();
        String current = (String) socket.getAttributes().get("meetingId");
        if (current != null && !current.equals(id)) {
            authenticated(socket, meeting, token);
            leave(socket);
        }
        synchronized (locks.meeting(id)) {
            meeting = meetings.byId(id);
            String uid = authenticated(socket, meeting, token);
            socket.getAttributes().put("meetingId", id);
            if (!socket.isOpen()) {
                socket.getAttributes().remove("meetingId");
                return;
            }
            socket.getAttributes().put("userId", uid);
            socket.getAttributes().put("authToken", token);
            active.computeIfAbsent(id, key -> new LinkedHashMap<>())
                .computeIfAbsent(uid, key -> new LinkedHashSet<>()).add(socket);
            String host = MeetingService.hostId(meeting);
            if (host.equals(uid)) cancelHandoff(id);
            var presentation = presentations.get(id);
            send(socket, Map.of("type", "JOINED", "meetingId", id, "hostUserId", host,
                "locked", MeetingService.isLocked(meeting), "presentationTools", true, "hasPresentation", presentation != null));
            snapshot(id, meeting);
            if (presentation != null) {
                presentation.emptySince = 0;
                send(socket, presentation.snapshot(uid, host.equals(uid), Db.now()));
            }
        }
    }

    private String authenticated(WebSocketSession socket, Map<String,Object> meeting, String token) {
        var session = token == null ? null : sessions.findById(token);
        String uid = session == null ? null : session.getAttribute("userId");
        if (uid == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请重新登录");
        Object prior = socket.getAttributes().get("userId");
        if (prior != null && !uid.equals(prior)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "会议身份已失效");
        }
        meetings.requireGrant(meeting, uid, session.getAttribute(MeetingService.grantKey(meeting.get("id").toString())));
        return uid;
    }

    private void chat(WebSocketSession socket, String id, String uid, Map<?,?> data) {
        limits.chat(id, uid);
        var chat = meetings.chat(id, uid, Db.text(data.get("clientId")), Db.text(data.get("content")));
        var event = new LinkedHashMap<String,Object>(chat);
        event.put("type", "CHAT_ACK");
        send(socket, event);
        if (!Boolean.TRUE.equals(chat.get("duplicate"))) {
            event.put("type", "CHAT");
            broadcast(id, event);
        }
    }

    private void handlePresentation(String id, String uid, Map<String, Object> meeting, Map<?,?> data) {
        limits.presentation(id, uid);
        String action = Db.text(data.get("action"));
        String segmentId = Db.text(data.get("segmentId"));
        var presentation = presentations.get(id);
        switch (action) {
            case "SAVE", "INVITE", "SKIP", "FINISH", "ANSWER" -> meetings.requireHost(meeting, uid);
        }
        if ("SAVE".equals(action)) {
            if (presentation != null && !presentation.editable()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "汇报已经开始");
            }
            presentations.put(id, new MeetingPresentation(readAgenda(id, data.get("agenda"))));
        } else {
            if (presentation == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "主持人尚未安排议程");
            switch (action) {
                case "READY" -> presentation.ready(uid, segmentId);
                case "INVITE" -> presentation.invite(segmentId, candidate -> hasOnlineGrant(id, candidate, meeting));
                case "SKIP" -> presentation.skip(segmentId, candidate -> hasOnlineGrant(id, candidate, meeting));
                case "ACCEPT" -> presentation.accept(uid, segmentId, Db.now());
                case "FINISH" -> presentation.finish();
                case "PACE" -> presentation.pace(uid, segmentId, Db.text(data.get("value")));
                case "QUESTION" -> presentation.ask(Db.checked(data.get("questionId"), 40, "问题编号"),
                    segmentId, meetings.member(id, uid).get("nickname").toString(),
                    Db.checked(data.get("content"), 300, "问题"), Db.now() - ((Number) meeting.get("created_at")).longValue());
                case "ANSWER" -> presentation.answer(Db.checked(data.get("questionId"), 40, "问题编号"));
                default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "不支持的议程操作");
            }
        }
        broadcastPresentation(id, meeting);
    }

    private List<MeetingPresentation.Segment> readAgenda(String id, Object value) {
        if (!(value instanceof List<?> rows) || rows.isEmpty() || rows.size() > 10) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请填写 1 至 10 个环节");
        }
        var agenda = new ArrayList<MeetingPresentation.Segment>();
        for (Object row : rows) {
            if (!(row instanceof Map<?,?> item) || !(item.get("minutes") instanceof Integer minutes) || minutes < 1 || minutes > 30) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "每个环节限时 1 至 30 分钟");
            }
            String title = Db.checked(item.get("title"), 60, "环节名称");
            String presenter = Db.checked(item.get("presenterId"), 40, "汇报人");
            String name = meetings.member(id, presenter).get("nickname").toString();
            agenda.add(new MeetingPresentation.Segment(Db.id(), title, presenter, name, minutes));
        }
        return agenda;
    }

    private void broadcastPresentation(String id, Map<String, Object> meeting) {
        var presentation = presentations.get(id);
        if (presentation == null) return;
        String host = MeetingService.hostId(meeting);
        long now = Db.now();
        users(id).forEach((uid, sockets) -> {
            var state = presentation.snapshot(uid, host.equals(uid), now);
            for (var socket : sockets) {
                if (hasGrant(socket, uid, meeting)) send(socket, state);
            }
        });
    }

    private void reassignInvitation(String id, Map<String, Object> meeting) {
        var presentation = presentations.get(id);
        if (presentation == null) return;
        if (users(id).isEmpty()) presentation.emptySince = Db.now();
        var invitation = presentation.invitation();
        if (invitation != null && !hasOnlineGrant(id, invitation.presenterId(), meeting)) {
            presentation.skip(invitation.id(), candidate -> hasOnlineGrant(id, candidate, meeting));
            broadcastPresentation(id, meeting);
        }
    }

    private void screenPoint(String id, String uid, Map<?,?> data) {
        limits.screenPoint(id, uid);
        String trackSid = Db.checked(data.get("trackSid"), 60, "共享画面");
        if (!trackSid.matches("[A-Za-z0-9_-]+")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "共享画面无效");
        broadcast(id, Map.of("type", "SCREEN_POINT", "trackSid", trackSid,
            "x", screenCoordinate(data.get("x")), "y", screenCoordinate(data.get("y"))));
    }

    private double screenCoordinate(Object value) {
        if (value instanceof Number number) {
            double coordinate = number.doubleValue();
            if (coordinate >= 0 && coordinate <= 1) return coordinate;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请在共享画面内标记位置");
    }

    private void handleHostAction(WebSocketSession socket, String id, String uid, Map<String,Object> meeting,
                                  String type, Map<?,?> data) {
        switch (type) {
            case "MUTE" -> {
                String target = anotherMember(uid, data.get("userId"));
                meetings.member(id, target);
                if (media.mute(id, target) == 0) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "该成员当前没有开启麦克风");
                }
                sendTo(id, target, Map.of("type", "MUTED", "message", "主持人已将你静音"));
                send(socket, Map.of("type", "NOTICE", "message", "已静音该成员"));
            }
            case "KICK" -> {
                String target = anotherMember(uid, data.get("userId"));
                meetings.revoke(meeting, target);
                boolean mediaClosed = true;
                try { media.removeMember(id, target); } catch (Exception error) { mediaClosed = false; }
                disconnectUser(id, target);
                snapshot(id, meeting);
                reassignInvitation(id, meeting);
                send(socket, Map.of("type", "NOTICE", "message",
                    mediaClosed ? "已移出该成员" : "已移出成员，但音视频断开未确认，请检查媒体服务"));
            }
            case "MUTE_ALL" -> muteAll(socket, id, uid, meeting);
            case "SET_MEETING_LOCK" -> {
                if (!(data.get("locked") instanceof Boolean locked)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择锁定或解锁会议");
                }
                meetings.setLocked(id, locked);
                broadcast(id, Map.of("type", "MEETING_LOCK_CHANGED", "locked", locked));
            }
            case "TRANSFER_HOST" -> {
                String target = anotherMember(uid, data.get("userId"));
                if (!hasOnlineGrant(id, target, meeting)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "该成员已离开会议，请选择在会成员");
                }
                transferHost(id, target);
            }
        }
    }

    private String anotherMember(String uid, Object value) {
        String target = Db.checked(value, 40, "成员");
        if (uid.equals(target)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择其他成员");
        return target;
    }

    private void muteAll(WebSocketSession socket, String id, String uid, Map<String,Object> meeting) {
        var targets = new LinkedHashSet<String>();
        for (String target : users(id).keySet()) {
            if (!uid.equals(target) && hasOnlineGrant(id, target, meeting)) targets.add(target);
        }
        var result = media.muteAll(id, targets);
        for (String target : targets) {
            if (result.failedUsers().contains(target)) {
                sendTo(id, target, Map.of("type", "NOTICE", "message", "主持人请求全员静音，请检查你的麦克风"));
            } else {
                sendTo(id, target, Map.of("type", "MUTED", "message", "主持人已开启全员静音，你可自行开麦"));
            }
        }
        int muted = result.mutedUsers().size(), failed = result.failedUsers().size();
        String feedback = "已静音 " + muted + " 人";
        if (targets.isEmpty()) feedback = "当前没有其他在会成员";
        else if (failed > 0) feedback += "，" + failed + " 人的静音未确认";
        else if (muted == 0) feedback = "其他成员的麦克风已处于关闭状态";
        send(socket, Map.of("type", "MUTE_ALL_RESULT", "muted", muted, "failed", failed, "message", feedback));
    }

    private void transferHost(String id, String target) {
        String nickname = meetings.member(id, target).get("nickname").toString();
        meetings.transferHost(id, target);
        cancelHandoff(id);
        broadcast(id, Map.of("type", "HOST_CHANGED", "hostUserId", target, "nickname", nickname));
        var meeting = meetings.byId(id);
        snapshot(id, meeting);
        broadcastPresentation(id, meeting);
    }

    private void leave(WebSocketSession socket) {
        String id = (String) socket.getAttributes().get("meetingId");
        if (id == null) return;
        synchronized (locks.meeting(id)) {
            if (!socket.getAttributes().remove("meetingId", id)) return;
            var users = active.get(id);
            if (users == null) return;
            String uid = (String) socket.getAttributes().get("userId");
            var connections = users.get(uid);
            if (connections == null || !connections.remove(socket)) return;
            if (connections.isEmpty()) users.remove(uid);
            if (users.isEmpty()) active.remove(id);

            var meeting = openMeeting(id);
            if (meeting == null) return;
            snapshot(id, meeting);
            reassignInvitation(id, meeting);
            if (uid.equals(MeetingService.hostId(meeting)) && !hasOnlineGrant(id, uid, meeting)) {
                scheduleHandoff(id, uid);
            }
        }
    }

    private void scheduleHandoff(String id, String host) {
        if (handoffs.containsKey(id)) return;
        var handoff = new HostHandoff(host);
        handoffs.put(id, handoff);
        handoff.future = scheduler.schedule(() -> handOffIfAbsent(id, handoff),
            scheduler.getClock().instant().plusMillis(hostReconnectDelayMs));
    }

    private void handOffIfAbsent(String id, HostHandoff handoff) {
        synchronized (locks.meeting(id)) {
            if (!handoffs.remove(id, handoff)) return;
            var meeting = openMeeting(id);
            if (meeting == null || !handoff.host.equals(MeetingService.hostId(meeting)) || hasOnlineGrant(id, handoff.host, meeting)) return;
            for (String candidate : users(id).keySet()) {
                if (hasOnlineGrant(id, candidate, meeting)) {
                    transferHost(id, candidate);
                    return;
                }
            }
        }
    }

    private void cancelHandoff(String id) {
        var handoff = handoffs.remove(id);
        if (handoff != null) handoff.future.cancel(false);
    }

    private Map<String,Object> openMeeting(String id) {
        return db.maybe("SELECT * FROM meetings WHERE id=? AND status='OPEN'", id);
    }

    private Map<String, Set<WebSocketSession>> users(String id) {
        var users = active.get(id);
        return users == null ? Map.of() : users;
    }

    private boolean hasOnlineGrant(String id, String uid, Map<String,Object> meeting) {
        return users(id).getOrDefault(uid, Set.of()).stream().anyMatch(socket -> hasGrant(socket, uid, meeting));
    }

    private boolean hasGrant(WebSocketSession socket, String uid, Map<String, Object> meeting) {
        if (!socket.isOpen()) return false;
        try {
            return uid.equals(authenticated(socket, meeting, (String) socket.getAttributes().get("authToken")));
        } catch (ResponseStatusException ignored) {
            return false; // An open socket can outlive the account session or its meeting grant.
        }
    }

    private void snapshot(String id, Map<String,Object> meeting) {
        var members = new ArrayList<Map<String,Object>>();
        String host = MeetingService.hostId(meeting);
        users(id).forEach((uid, sockets) -> {
            if (sockets.stream().noneMatch(WebSocketSession::isOpen)) return;
            var member = db.maybe("SELECT nickname FROM meeting_members WHERE meeting_id=? AND user_id=?", id, uid);
            if (member != null) members.add(Map.of("userId", uid, "nickname", member.get("nickname"), "host", uid.equals(host)));
        });
        broadcast(id, Map.of("type", "MEMBERS", "members", members));
    }

    private void send(WebSocketSession socket, Object value) {
        try {
            synchronized (socket) {
                if (socket.isOpen()) socket.sendMessage(new TextMessage(mapper.writeValueAsString(value)));
            }
        } catch (Exception ignored) {}
    }

    private void broadcast(String id, Object value) { users(id).values().forEach(sockets -> sockets.forEach(socket -> send(socket, value))); }

    private void sendTo(String id, String uid, Object value) {
        users(id).getOrDefault(uid, Set.of()).forEach(socket -> send(socket, value));
    }

    private void disconnectUser(String id, String uid) {
        var users = active.get(id);
        var connections = users == null ? null : users.remove(uid);
        if (connections == null) return;
        for (var socket : connections) {
            socket.getAttributes().remove("meetingId");
            send(socket, Map.of("type", "KICKED", "message", "主持人已将你移出会议"));
            try { socket.close(CloseStatus.POLICY_VIOLATION); } catch (Exception ignored) {}
        }
        if (users.isEmpty()) active.remove(id);
    }

    public void meetingEnded(String id) {
        synchronized (locks.meeting(id)) {
            cancelHandoff(id);
            presentations.remove(id);
            var users = active.remove(id);
            if (users == null) return;
            for (var connections : users.values()) {
                for (var socket : connections) {
                    socket.getAttributes().remove("meetingId");
                    send(socket, Map.of("type", "ENDED", "message", "会议已结束"));
                    try { socket.close(CloseStatus.NORMAL); } catch (Exception ignored) {}
                }
            }
        }
    }

    @Scheduled(fixedDelay = 60_000)
    void clearAbandonedPresentations() {
        long cutoff = Db.now() - 30 * 60_000L;
        for (String id : presentations.keySet()) {
            synchronized (locks.meeting(id)) {
                var presentation = presentations.get(id);
                if (presentation != null && presentation.emptySince != 0 && presentation.emptySince <= cutoff) {
                    presentations.remove(id);
                }
            }
        }
    }

    public void meetingChanged(String id) {
        synchronized (locks.meeting(id)) {
            var meeting = openMeeting(id);
            if (meeting != null) snapshot(id, meeting);
        }
    }

    @Override public void afterConnectionClosed(WebSocketSession socket, CloseStatus status) { leave(socket); }
}
