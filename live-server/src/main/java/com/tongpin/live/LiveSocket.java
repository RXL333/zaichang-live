package com.tongpin.live;

import jakarta.servlet.http.HttpSession;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.ObjectMapper;

@Component
public class LiveSocket extends TextWebSocketHandler {
    private final Db db; private final InteractionService interactions; private final MediaService media; private final RoomBroadcaster rooms; private final ObjectMapper mapper; private final SessionLocks locks;
    private final Map<String,Long> lastActions=new ConcurrentHashMap<>();
    public LiveSocket(Db db,InteractionService interactions,MediaService media,RoomBroadcaster rooms,ObjectMapper mapper,SessionLocks locks){this.db=db;this.interactions=interactions;this.media=media;this.rooms=rooms;this.mapper=mapper;this.locks=locks;}
    private String user(WebSocketSession socket){try{return (String)((HttpSession)socket.getAttributes().get("httpSession")).getAttribute("userId");}catch(Exception ex){return null;}}
    private String requiredUser(WebSocketSession socket){String user=user(socket);if(user==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"请登录后参与互动");return user;}
    private void limit(WebSocketSession socket,String type,long interval){String key=socket.getId()+":"+type;long now=Db.now();Long last=lastActions.put(key,now);if(last!=null && now-last<interval)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"操作过于频繁，请稍后重试");}
    private String str(Map<?,?> m,String key){return Db.text(m.get(key));}
    private Map<String,Object> event(String type,String sessionId){return new LinkedHashMap<>(Map.of("type",type,"sessionId",sessionId));}
    @Override protected void handleTextMessage(WebSocketSession socket,TextMessage text){
        try {
            if(text.getPayloadLength()>10000)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"消息内容过长");
            Map<?,?> data=mapper.readValue(text.getPayload(),Map.class);String type=str(data,"type");
            if(type.equals("JOIN")){
                String room=Db.checked(data.get("roomId"),40,"房间编号"),sessionId=str(data,"sessionId");db.one("SELECT id FROM rooms WHERE id=?",room);
                if(!sessionId.isBlank())db.one("SELECT id FROM live_sessions WHERE id=? AND room_id=?",sessionId,room);
                String old=(String)socket.getAttributes().get("room");if(old!=null)rooms.leave(old,socket);
                socket.getAttributes().put("room",room);socket.getAttributes().put("liveSession",sessionId);rooms.join(room,socket);
                rooms.send(socket,Map.of("type","SYSTEM","roomId",room,"message","已进入房间"));return;
            }
            if(type.equals("PING")){rooms.send(socket,Map.of("type","PONG","timestamp",Db.now()));return;}
            String room=(String)socket.getAttributes().get("room"),sid=(String)socket.getAttributes().get("liveSession");
            if(room==null || sid==null || sid.isBlank())throw new ResponseStatusException(HttpStatus.CONFLICT,"请先进入正在直播的房间");
            var live=interactions.live(sid);if(!room.equals(live.get("room_id")))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"房间不匹配");
            String uid=user(socket);
            switch(type){
                case "DANMAKU" -> {limit(socket,type,400);var chat=interactions.chat(sid,requiredUser(socket),str(data,"clientMessageId"),str(data,"content"));
                    var ack=event("DANMAKU_ACK",sid);ack.putAll(chat);rooms.send(socket,ack);
                    if(!Boolean.TRUE.equals(chat.get("duplicate"))){var message=event("DANMAKU",sid);message.putAll(chat);rooms.broadcast(room,message);}}
                case "REACTION", "GIFT" -> {limit(socket,type,type.equals("GIFT")?700:150);String user=requiredUser(socket);interactions.canSpeak(room,user);
                    String value=str(data,"value");Set<String> allowed=type.equals("GIFT")?Set.of("flower","cookie","star"):Set.of("heart","clap","fire","wow");
                    if(!allowed.contains(value))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"不支持这个互动");
                    var msg=event(type,sid);msg.put("value",value);msg.put("nickname",db.user(user).get("nickname"));rooms.broadcast(room,msg);}
                case "POLL_CREATE" -> {limit(socket,type,500);interactions.createPoll(sid,requiredUser(socket),str(data,"question"),data.get("options") instanceof List<?> x?x:null);changed(room,sid);}
                case "POLL_VOTE" -> {interactions.vote(sid,requiredUser(socket),str(data,"pollId"),str(data,"optionId"));changed(room,sid);}
                case "POLL_CLOSE" -> {interactions.closePoll(sid,requiredUser(socket),str(data,"pollId"));changed(room,sid);}
                case "QUESTION_ASK" -> {limit(socket,type,700);interactions.ask(sid,requiredUser(socket),str(data,"content"));changed(room,sid);}
                case "QUESTION_VOTE" -> {interactions.upvote(sid,requiredUser(socket),str(data,"questionId"));changed(room,sid);}
                case "QUESTION_ANSWER" -> {interactions.answer(sid,requiredUser(socket),str(data,"questionId"));changed(room,sid);}
                case "MIC_APPLY" -> {synchronized(locks.mic(sid)) {String user=requiredUser(socket),identity=str(data,"identity");interactions.canSpeak(room,user);
                    db.one("SELECT identity FROM media_connections WHERE identity=? AND session_id=? AND user_id=? AND role='VIEWER'",identity,sid,user);
                    if(db.maybe("SELECT id FROM mic_requests WHERE session_id=? AND user_id=? AND status IN ('PENDING','APPROVED')",sid,user)!=null)throw new ResponseStatusException(HttpStatus.CONFLICT,"你已经申请过连麦");
                    db.jdbc.update("INSERT INTO mic_requests(id,session_id,user_id,nickname,identity,status,created_at) VALUES(?,?,?,?,?,'PENDING',?)",Db.id(),sid,user,db.user(user).get("nickname"),identity,Db.now());changed(room,sid);}}
                case "MIC_APPROVE" -> {synchronized(locks.mic(sid)) {String user=requiredUser(socket);db.requireOwner(room,user);String request=str(data,"requestId");
                    var mic=db.one("SELECT * FROM mic_requests WHERE id=? AND session_id=? AND status='PENDING'",request,sid);
                    if(db.maybe("SELECT id FROM mic_requests WHERE session_id=? AND status='APPROVED'",sid)!=null)throw new ResponseStatusException(HttpStatus.CONFLICT,"当前已有一位连麦嘉宾");
                    db.jdbc.update("UPDATE mic_requests SET status='APPROVED' WHERE id=?",request);
                    var msg=event("MIC_APPROVED",sid);msg.put("requestId",request);msg.put("userId",mic.get("user_id"));msg.put("identity",mic.get("identity"));rooms.broadcast(room,msg);changed(room,sid);}}
                case "MIC_CONFIRM" -> {synchronized(locks.mic(sid)) {String user=requiredUser(socket),request=str(data,"requestId");
                    var mic=db.one("SELECT * FROM mic_requests WHERE id=? AND session_id=? AND status='APPROVED'",request,sid);
                    if(!user.equals(mic.get("user_id")))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"只能确认自己的连麦邀请");
                    if(!Boolean.TRUE.equals(mic.get("confirmed"))){media.setPublish(sid,mic.get("identity").toString(),true);db.jdbc.update("UPDATE mic_requests SET confirmed=TRUE WHERE id=?",request);}
                    var msg=event("MIC_CONFIRMED",sid);msg.put("requestId",request);msg.put("identity",mic.get("identity"));rooms.broadcast(room,msg);changed(room,sid);}}
                case "MIC_END" -> {synchronized(locks.mic(sid)) {String user=requiredUser(socket);var mic=db.one("SELECT * FROM mic_requests WHERE id=? AND session_id=? AND status IN ('PENDING','APPROVED')",str(data,"requestId"),sid);
                    if(!user.equals(mic.get("user_id")))db.requireOwner(room,user);
                    if(Boolean.TRUE.equals(mic.get("confirmed")))media.setPublish(sid,mic.get("identity").toString(),false);
                    db.jdbc.update("UPDATE mic_requests SET status='ENDED' WHERE id=?",mic.get("id"));var msg=event("MIC_ENDED",sid);msg.put("identity",mic.get("identity"));rooms.broadcast(room,msg);changed(room,sid);}}
                case "MUTE" -> {String user=requiredUser(socket),target=str(data,"userId");db.requireOwner(room,user);db.one("SELECT id FROM app_users WHERE id=?",target);if(user.equals(target))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"不能禁言自己");
                    db.jdbc.update("DELETE FROM muted_users WHERE room_id=? AND user_id=?",room,target);db.jdbc.update("INSERT INTO muted_users(room_id,user_id,until_at) VALUES(?,?,?)",room,target,Db.now()+600000);
                    var msg=event("SYSTEM",sid);msg.put("message","主播已对一位观众禁言 10 分钟");rooms.broadcast(room,msg);}
                case "DELETE_MESSAGE" -> {db.requireOwner(room,requiredUser(socket));String id=str(data,"messageId");db.jdbc.update("UPDATE chat_messages SET deleted=TRUE WHERE id=? AND session_id=?",id,sid);var msg=event("MESSAGE_DELETED",sid);msg.put("messageId",id);rooms.broadcast(room,msg);}
                default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"不认识这个互动消息");
            }
        } catch(ResponseStatusException e){rooms.send(socket,Map.of("type","ERROR","code",e.getStatusCode().value(),"message",Objects.toString(e.getReason(),"操作失败")));}
          catch(Exception e){rooms.send(socket,Map.of("type","ERROR","code","INVALID_MESSAGE","message","消息处理失败，请重试"));}
    }
    private void changed(String room,String sid){rooms.broadcast(room,Map.of("type","INTERACTION_CHANGED","sessionId",sid));}
    @Override public void afterConnectionClosed(WebSocketSession socket,CloseStatus status){rooms.leave((String)socket.getAttributes().get("room"),socket);lastActions.keySet().removeIf(k->k.startsWith(socket.getId()+":"));}
}
