package com.tongpin.live;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;

@Component
public class RoomBroadcaster {
    private final ObjectMapper mapper;
    private final Map<String, Set<WebSocketSession>> rooms=new ConcurrentHashMap<>();
    public RoomBroadcaster(ObjectMapper mapper) { this.mapper=mapper; }
    public void join(String room,WebSocketSession session) { rooms.compute(room,(key,set)->{if(set==null)set=ConcurrentHashMap.newKeySet();set.add(session);return set;}); count(room); }
    public void leave(String room,WebSocketSession session) { if(room==null)return; rooms.computeIfPresent(room,(key,set)->{set.remove(session);return set.isEmpty()?null:set;}); count(room); }
    public void count(String room) { broadcast(room,Map.of("type","USER_COUNT","roomId",room,"count",rooms.getOrDefault(room,Set.of()).size())); }
    public void send(WebSocketSession session,Object body) {
        try { synchronized(session) { if(session.isOpen())session.sendMessage(new TextMessage(mapper.writeValueAsString(body))); } } catch(Exception ignored) { }
    }
    public void broadcast(String room,Object body) { for(WebSocketSession session:rooms.getOrDefault(room,Set.of()))send(session,body); }
}
