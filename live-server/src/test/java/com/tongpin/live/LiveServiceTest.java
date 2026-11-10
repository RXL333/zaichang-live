package com.tongpin.live;

import com.auth0.jwt.JWT;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.session.MapSessionRepository;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:tongpin_test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.sql.init.mode=always"
})
class LiveServiceTest {
    @Autowired Db db;
    @Autowired InteractionService interactions;
    @Autowired MediaService media;
    @Autowired RoomBroadcaster broadcaster;
    @Autowired SessionController sessions;
    @Autowired SessionLocks locks;
    @Autowired LiveSocket socket;
    @Autowired MapSessionRepository httpSessions;
    @Autowired ObjectMapper mapper;
    String host, viewer, outsider, roomA, roomB, sessionA, sessionB;

    @BeforeEach void setup() {
        host=user("host"); viewer=user("viewer"); outsider=user("outsider");
        roomA=room(host); roomB=room(outsider); sessionA=session(roomA); sessionB=session(roomB);
    }
    String user(String prefix) {
        String id=Db.id(); db.jdbc.update("INSERT INTO app_users(id,username,password_hash,nickname,created_at) VALUES(?,?,?,?,?)",id,prefix+id.substring(0,8),"hash",prefix,Db.now()); return id;
    }
    String room(String owner) {
        String id=Db.id();db.jdbc.update("INSERT INTO rooms(id,owner_id,title,description,category,cover_style,created_at) VALUES(?,?,?,'','聊天','tomato',?)",id,owner,"测试房间",Db.now());return id;
    }
    String session(String room) {
        String id=Db.id();db.jdbc.update("INSERT INTO live_sessions(id,room_id,status,started_at) VALUES(?,?,'LIVE',?)",id,room,Db.now());return id;
    }
    @Test void chatRetryIsIdempotentAndSequenceIsScopedToSession() {
        var first=interactions.chat(sessionA,viewer,"client-1","第一条");
        var repeated=interactions.chat(sessionA,viewer,"client-1","第一条");
        var second=interactions.chat(sessionA,viewer,"client-2","第二条");
        var other=interactions.chat(sessionB,viewer,"client-1","其他房间");
        assertEquals(first.get("id"),repeated.get("id"));
        assertEquals(true,repeated.get("duplicate"));
        assertEquals(1L,((Number)first.get("seq")).longValue());
        assertEquals(2L,((Number)second.get("seq")).longValue());
        assertEquals(1L,((Number)other.get("seq")).longValue());
        assertEquals(2,db.jdbc.queryForObject("SELECT COUNT(*) FROM chat_messages WHERE session_id=?",Integer.class,sessionA));
    }
    @Test void pollAcceptsOnlyOneVoteAndOnlyHostCanCreate() {
        assertThrows(ResponseStatusException.class,()->interactions.createPoll(sessionA,viewer,"问题",List.of("是","否")));
        interactions.createPoll(sessionA,host,"今天看什么？",List.of("聊天","音乐"));
        var poll=(Map<?,?>)interactions.snapshot(sessionA,viewer).get("poll");
        var options=(List<?>)poll.get("options");
        String pollId=poll.get("id").toString(), first=((Map<?,?>)options.get(0)).get("id").toString(), second=((Map<?,?>)options.get(1)).get("id").toString();
        interactions.vote(sessionA,viewer,pollId,first);
        assertThrows(ResponseStatusException.class,()->interactions.vote(sessionA,viewer,pollId,second));
        assertThrows(ResponseStatusException.class,()->interactions.vote(sessionB,outsider,pollId,first));
        assertEquals(1,db.jdbc.queryForObject("SELECT COUNT(*) FROM poll_votes WHERE poll_id=?",Integer.class,pollId));
    }
    @Test void mutedUserCannotSendOrVote() {
        db.jdbc.update("INSERT INTO muted_users(room_id,user_id,until_at) VALUES(?,?,?)",roomA,viewer,Db.now()+60000);
        assertThrows(ResponseStatusException.class,()->interactions.chat(sessionA,viewer,"client-1","消息"));
        assertThrows(ResponseStatusException.class,()->interactions.ask(sessionA,viewer,"问题"));
    }
    @Test void onlyHostGetsPublishPermission() {
        var hostSession=new MockHttpSession();hostSession.setAttribute("userId",host);
        var viewerSession=new MockHttpSession();viewerSession.setAttribute("userId",viewer);
        var guestSession=new MockHttpSession();
        var hostToken=media.issue(sessionA,"host",hostSession).get("token").toString();
        var viewerToken=media.issue(sessionA,"viewer",viewerSession).get("token").toString();
        var guestToken=media.issue(sessionA,"viewer",guestSession).get("token").toString();
        assertEquals(true,JWT.decode(hostToken).getClaim("video").asMap().get("canPublish"));
        assertEquals(false,JWT.decode(viewerToken).getClaim("video").asMap().get("canPublish"));
        assertEquals(false,JWT.decode(guestToken).getClaim("video").asMap().get("canPublish"));
        assertThrows(ResponseStatusException.class,()->media.issue(sessionA,"host",viewerSession));
        assertThrows(ResponseStatusException.class,()->media.issue(sessionA,"host",hostSession));
    }
    @Test void websocketBroadcastDoesNotLeakAcrossRooms() throws Exception {
        var aMessages=new ArrayList<String>();var bMessages=new ArrayList<String>();var cMessages=new ArrayList<String>();
        WebSocketSession a=connection("a",host,aMessages), b=connection("b",viewer,bMessages), c=connection("c",outsider,cMessages);
        send(a,Map.of("type","JOIN","roomId",roomA,"sessionId",sessionA));
        send(b,Map.of("type","JOIN","roomId",roomA,"sessionId",sessionA));
        send(c,Map.of("type","JOIN","roomId",roomB,"sessionId",sessionB));
        send(a,Map.of("type","DANMAKU","clientMessageId","same-message","content","房间 A 的消息"));
        assertTrue(aMessages.stream().anyMatch(x->x.contains("DANMAKU_ACK")));
        assertTrue(bMessages.stream().anyMatch(x->x.contains("房间 A 的消息")));
        assertFalse(cMessages.stream().anyMatch(x->x.contains("房间 A 的消息")));
        socket.afterConnectionClosed(a,org.springframework.web.socket.CloseStatus.NORMAL);
        socket.afterConnectionClosed(b,org.springframework.web.socket.CloseStatus.NORMAL);
        socket.afterConnectionClosed(c,org.springframework.web.socket.CloseStatus.NORMAL);
    }
    @Test void removedMessagesStayHiddenInRecoveryAndRetry() {
        var message=interactions.chat(sessionA,viewer,"client-hidden","需要移除的消息");
        db.jdbc.update("UPDATE chat_messages SET deleted=TRUE WHERE id=?",message.get("id"));
        assertEquals("",sessions.messages(sessionA,0,false).get(0).get("content"));
        assertEquals("",sessions.messages(sessionA,0,true).get(0).get("content"));
        assertEquals("",interactions.chat(sessionA,viewer,"client-hidden","需要移除的消息").get("content"));
    }
    @Test void hostApprovalAloneDoesNotPermitPublishing() throws Exception {
        MediaService mockMedia=mock(MediaService.class);
        LiveSocket testSocket=new LiveSocket(db,interactions,mockMedia,broadcaster,mapper,locks,httpSessions);
        var hostMessages=new ArrayList<String>();var viewerMessages=new ArrayList<String>();var otherMessages=new ArrayList<String>();
        WebSocketSession a=connection("host-mic",host,hostMessages), b=connection("viewer-mic",viewer,viewerMessages), c=connection("other-mic",outsider,otherMessages);
        for(WebSocketSession client:List.of(a,b,c)) testSocket.handleTextMessage(client,new TextMessage(mapper.writeValueAsString(Map.of("type","JOIN","roomId",roomA,"sessionId",sessionA))));
        String identity="viewer-"+Db.id();
        db.jdbc.update("INSERT INTO media_connections(identity,session_id,viewer_key,user_id,role,created_at) VALUES(?,?,?,?,?,?)",identity,sessionA,"user-"+viewer,viewer,"VIEWER",Db.now());
        testSocket.handleTextMessage(b,new TextMessage(mapper.writeValueAsString(Map.of("type","MIC_APPLY","identity",identity))));
        String request=db.one("SELECT id FROM mic_requests WHERE session_id=? AND user_id=?",sessionA,viewer).get("id").toString();
        testSocket.handleTextMessage(c,new TextMessage(mapper.writeValueAsString(Map.of("type","MIC_CONFIRM","requestId",request))));
        testSocket.handleTextMessage(a,new TextMessage(mapper.writeValueAsString(Map.of("type","MIC_APPROVE","requestId",request))));
        testSocket.handleTextMessage(c,new TextMessage(mapper.writeValueAsString(Map.of("type","MIC_CONFIRM","requestId",request))));
        verify(mockMedia,never()).setPublish(anyString(),anyString(),eq(true));
        assertTrue(otherMessages.stream().anyMatch(x->x.contains("ERROR")));
        assertTrue(viewerMessages.stream().anyMatch(x->x.contains("MIC_APPROVED")));
        testSocket.handleTextMessage(b,new TextMessage(mapper.writeValueAsString(Map.of("type","MIC_CONFIRM","requestId",request))));
        verify(mockMedia).setPublish(sessionA,identity,true);
        assertTrue(viewerMessages.stream().anyMatch(x->x.contains("MIC_CONFIRMED")));
        testSocket.handleTextMessage(b,new TextMessage(mapper.writeValueAsString(Map.of("type","MIC_END","requestId",request))));
        verify(mockMedia).setPublish(sessionA,identity,false);
        for(WebSocketSession client:List.of(a,b,c))testSocket.afterConnectionClosed(client,org.springframework.web.socket.CloseStatus.NORMAL);
    }
    WebSocketSession connection(String id,String user,List<String> received) throws Exception {
        var session=mock(WebSocketSession.class);var http=new MockHttpSession();http.setAttribute("userId",user);
        Map<String,Object> attrs=new ConcurrentHashMap<>();attrs.put("httpSession",http);
        when(session.getId()).thenReturn(id);when(session.getAttributes()).thenReturn(attrs);when(session.isOpen()).thenReturn(true);
        doAnswer(call->{WebSocketMessage<?> message=call.getArgument(0);received.add(message.getPayload().toString());return null;}).when(session).sendMessage(any());
        return session;
    }
    void send(WebSocketSession session,Map<String,Object> message) throws Exception {socket.handleTextMessage(session,new TextMessage(mapper.writeValueAsString(message)));}
}
