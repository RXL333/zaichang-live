package com.tongpin.live;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.session.MapSessionRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.ObjectMapper;

@Component
public class MeetingSocket extends TextWebSocketHandler {
    private final Db db; private final MeetingService meetings; private final MeetingMediaService media; private final MeetingRateLimiter limits;
    private final MapSessionRepository sessions; private final ObjectMapper mapper;private final SessionLocks locks;
    private final Map<String,Set<WebSocketSession>> active=new ConcurrentHashMap<>();
    public MeetingSocket(Db db,MeetingService meetings,MeetingMediaService media,MapSessionRepository sessions,ObjectMapper mapper,SessionLocks locks,MeetingRateLimiter limits){
        this.db=db;this.meetings=meetings;this.media=media;this.sessions=sessions;this.mapper=mapper;this.locks=locks;this.limits=limits;
    }
    private void send(WebSocketSession socket,Object value){try{synchronized(socket){if(socket.isOpen())socket.sendMessage(new TextMessage(mapper.writeValueAsString(value)));}}catch(Exception ignored){}}
    private void broadcast(String id,Object value){for(var socket:active.getOrDefault(id,Set.of()))send(socket,value);}
    private void leave(WebSocketSession socket){
        String id=(String)socket.getAttributes().remove("meetingId");
        if(id==null)return;
        active.computeIfPresent(id,(key,set)->{set.remove(socket);return set.isEmpty()?null:set;});
        snapshot(id);
    }
    private String authenticated(WebSocketSession socket,Map<String,Object> meeting){
        String token=(String)socket.getAttributes().get("authToken");
        var session=token==null?null:sessions.findById(token);
        if(session==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"请重新登录");
        String uid=session.getAttribute("userId");
        if(uid==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"请重新登录");
        meetings.requireGrant(meeting,uid,session.getAttribute(MeetingService.grantKey(meeting.get("id").toString())));
        if(socket.getAttributes().get("userId")!=null && !uid.equals(socket.getAttributes().get("userId")))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"会议身份已失效");
        return uid;
    }
    private void snapshot(String id){
        var meeting=db.maybe("SELECT owner_id FROM meetings WHERE id=?",id);if(meeting==null)return;
        var ids=new LinkedHashSet<String>();
        for(var socket:active.getOrDefault(id,Set.of()))if(socket.isOpen() && socket.getAttributes().get("userId")!=null)ids.add(socket.getAttributes().get("userId").toString());
        var members=new ArrayList<Map<String,Object>>();
        for(String uid:ids){
            var member=db.maybe("SELECT nickname FROM meeting_members WHERE meeting_id=? AND user_id=?",id,uid);
            if(member!=null)members.add(Map.of("userId",uid,"nickname",member.get("nickname"),"host",uid.equals(meeting.get("owner_id"))));
        }
        broadcast(id,Map.of("type","MEMBERS","members",members));
    }
    @Override protected void handleTextMessage(WebSocketSession socket,TextMessage message){
        try {
            if(message.getPayloadLength()>10000)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"消息过长");
            Map<?,?> data=mapper.readValue(message.getPayload(),Map.class);String type=Db.text(data.get("type"));
            if("JOIN".equals(type)){
                String number=Db.checked(data.get("number"),12,"会议号");var meeting=meetings.byNumber(number);
                socket.getAttributes().put("authToken",Db.text(data.get("authToken")));
                String uid=authenticated(socket,meeting),id=meeting.get("id").toString();
                leave(socket);socket.getAttributes().put("meetingId",id);socket.getAttributes().put("userId",uid);
                active.computeIfAbsent(id,k->ConcurrentHashMap.newKeySet()).add(socket);
                send(socket,Map.of("type","JOINED","meetingId",id));snapshot(id);return;
            }
            String id=(String)socket.getAttributes().get("meetingId");
            if(id==null)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"请先加入会议");
            var meeting=meetings.byId(id);String uid=authenticated(socket,meeting);
            if("PING".equals(type)){send(socket,Map.of("type","PONG","timestamp",Db.now()));return;}
            switch(type){
                case "CHAT" -> {
                    limits.chat(id,uid);
                    var chat=meetings.chat(id,uid,Db.text(data.get("clientId")),Db.text(data.get("content")));
                    var ack=new LinkedHashMap<String,Object>(chat);ack.put("type","CHAT_ACK");send(socket,ack);
                    if(!Boolean.TRUE.equals(chat.get("duplicate"))){var event=new LinkedHashMap<String,Object>(chat);event.put("type","CHAT");broadcast(id,event);}
                }
                case "RENAME" -> {
                    String target=Db.checked(data.get("userId"),40,"成员");meetings.rename(meeting,uid,target,Db.text(data.get("nickname")));snapshot(id);
                }
                case "MUTE" -> {
                    meetings.requireOwner(meeting,uid);String target=Db.checked(data.get("userId"),40,"成员");
                    if(uid.equals(target))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请使用自己的麦克风按钮");
                    meetings.member(id,target);int count=media.mute(id,target);
                    if(count==0)throw new ResponseStatusException(HttpStatus.CONFLICT,"该成员当前没有开启麦克风");
                    sendTo(id,target,Map.of("type","MUTED","message","主持人已将你静音"));send(socket,Map.of("type","NOTICE","message","已静音该成员"));
                }
                case "KICK" -> {
                    meetings.requireOwner(meeting,uid);String target=Db.checked(data.get("userId"),40,"成员");
                    if(uid.equals(target))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"不能移出主持人");
                    synchronized(locks.meeting(id)){
                        meeting=meetings.byId(id);authenticated(socket,meeting);meetings.requireOwner(meeting,uid);
                        meetings.revoke(meeting,target);boolean mediaClosed=true;
                        try{media.removeMember(id,target);}catch(Exception e){mediaClosed=false;}
                        disconnectUser(id,target,"主持人已将你移出会议");
                        send(socket,Map.of("type","NOTICE","message",mediaClosed?"已移出该成员":"已移出成员，但音视频断开未确认，请检查媒体服务"));
                    }
                }
                default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"不支持的会议操作");
            }
        }catch(ResponseStatusException e){send(socket,Map.of("type","ERROR","code",e.getStatusCode().value(),"message",Objects.toString(e.getReason(),"操作失败")));}
        catch(Exception e){send(socket,Map.of("type","ERROR","code","INVALID_MESSAGE","message","操作未完成，请重试"));}
    }
    private void sendTo(String id,String uid,Object value){for(var socket:active.getOrDefault(id,Set.of()))if(uid.equals(socket.getAttributes().get("userId")))send(socket,value);}
    private void disconnectUser(String id,String uid,String reason){
        for(var socket:List.copyOf(active.getOrDefault(id,Set.of())))if(uid.equals(socket.getAttributes().get("userId"))){
            send(socket,Map.of("type","KICKED","message",reason));
            try{socket.close(CloseStatus.POLICY_VIOLATION);}catch(Exception ignored){}
        }
        snapshot(id);
    }
    public void meetingEnded(String id){
        broadcast(id,Map.of("type","ENDED","message","会议已结束"));
        for(var socket:List.copyOf(active.getOrDefault(id,Set.of())))try{socket.close(CloseStatus.NORMAL);}catch(Exception ignored){}
    }
    public void meetingChanged(String id){snapshot(id);}
    @Override public void afterConnectionClosed(WebSocketSession socket,CloseStatus status){leave(socket);}
}
