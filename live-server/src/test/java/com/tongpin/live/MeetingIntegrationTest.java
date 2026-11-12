package com.tongpin.live;

import com.auth0.jwt.JWT;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=jdbc:h2:mem:meeting_test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.sql.init.mode=always","app.public-origin=https://pages.example"
})
class MeetingIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired Db db;
    @MockitoBean MeetingMediaService media;
    final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    record User(String token,String csrf,String id){}
    record Socket(WebSocket socket,BlockingQueue<String> events){}

    HttpResponse<String> request(String method,String path,User user,String body) throws Exception {
        var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).header("Origin","https://pages.example").timeout(Duration.ofSeconds(10));
        if(user!=null){b.header("X-Auth-Token",user.token());b.header("X-CSRF-TOKEN",user.csrf());}
        if(body!=null)b.header("Content-Type","application/json");
        return http.send(b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
    }
    String json(Object value){return mapper.writeValueAsString(value);}
    @SuppressWarnings("unchecked") Map<String,Object> object(String json){return mapper.readValue(json,Map.class);}
    User register() throws Exception {
        var initial=request("GET","/api/csrf",null,null);
        String token=initial.headers().firstValue("X-Auth-Token").orElseThrow(),csrf=object(initial.body()).get("token").toString();
        String username="m"+UUID.randomUUID().toString().replace("-","").substring(0,12);
        var response=request("POST","/api/auth/register",new User(token,csrf,""),json(Map.of("username",username,"password","test-password","nickname",username)));
        assertEquals(200,response.statusCode(),response.body());
        var data=object(response.body());String id=((Map<?,?>)data.get("user")).get("id").toString();
        return new User(response.headers().firstValue("X-Auth-Token").orElseThrow(),csrf,id);
    }
    Socket socket(User user,String number) throws Exception {
        var events=new LinkedBlockingQueue<String>();
        WebSocket ws=http.newWebSocketBuilder().header("Origin","https://pages.example")
            .buildAsync(URI.create("ws://127.0.0.1:"+port+"/ws/meetings"),new WebSocket.Listener(){
                final StringBuilder text=new StringBuilder();
                public void onOpen(WebSocket s){s.request(1);}
                public CompletionStage<?> onText(WebSocket s,CharSequence data,boolean last){text.append(data);if(last){events.add(text.toString());text.setLength(0);}s.request(1);return null;}
            }).get(10,TimeUnit.SECONDS);
        ws.sendText(json(Map.of("type","JOIN","number",number,"authToken",user.token())),true).join();
        assertTrue(waitFor(events,"\"type\":\"JOINED\"",5000),"meeting socket should join");
        return new Socket(ws,events);
    }
    boolean waitFor(BlockingQueue<String> events,String text,long timeoutMs) throws InterruptedException {
        long end=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        while(System.nanoTime()<end){String value=events.poll(100,TimeUnit.MILLISECONDS);if(value!=null && value.contains(text))return true;}return false;
    }
    @Test void passwordPermissionChatIsolationAndRemoval() throws Exception {
        User host=register(),guest=register(),other=register();
        var created=request("POST","/api/meetings",host,json(Map.of("title","课程讨论","password","1234")));
        assertEquals(200,created.statusCode(),created.body());String number=object(created.body()).get("number").toString();
        var another=request("POST","/api/meetings",other,json(Map.of("title","另一会议")));
        assertEquals(200,another.statusCode(),another.body());String otherNumber=object(another.body()).get("number").toString();
        assertEquals(403,request("GET","/api/meetings/"+number+"/messages",guest,null).statusCode());
        assertEquals(403,request("POST","/api/meetings/"+number+"/media-token",guest,null).statusCode());
        assertEquals(403,request("POST","/api/meetings/"+number+"/join",guest,json(Map.of("password","wrong"))).statusCode());
        assertEquals(200,request("POST","/api/meetings/"+number+"/join",host,json(Map.of())).statusCode());
        assertEquals(200,request("POST","/api/meetings/"+number+"/join",guest,json(Map.of("password","1234","nickname","参会者"))).statusCode());
        assertEquals(200,request("POST","/api/meetings/"+otherNumber+"/join",other,json(Map.of())).statusCode());
        assertEquals(403,request("PATCH","/api/meetings/"+number,guest,json(Map.of("title","越权"))).statusCode());
        Socket a=socket(host,number),b=socket(guest,number),c=socket(other,otherNumber);
        try {
            String chat=json(Map.of("type","CHAT","clientId","same-id","content","会议消息"));
            b.socket().sendText(chat,true).join();b.socket().sendText(chat,true).join();
            assertTrue(waitFor(a.events(),"会议消息",5000));
            assertFalse(waitFor(c.events(),"会议消息",700),"other meeting must not receive chat");
            assertEquals(1,db.jdbc.queryForObject("SELECT COUNT(*) FROM meeting_messages WHERE client_id='same-id'",Integer.class));
            b.socket().sendText(json(Map.of("type","RENAME","userId",host.id(),"nickname","冒名")),true).join();
            assertTrue(waitFor(b.events(),"\"code\":403",5000));
            a.socket().sendText(json(Map.of("type","RENAME","userId",guest.id(),"nickname","新昵称")),true).join();
            assertTrue(waitFor(b.events(),"新昵称",5000));
            a.socket().sendText(json(Map.of("type","KICK","userId",guest.id())),true).join();
            assertTrue(waitFor(b.events(),"\"type\":\"KICKED\"",5000));
            assertEquals(403,request("GET","/api/meetings/"+number+"/state",guest,null).statusCode());
            assertEquals(403,request("POST","/api/meetings/"+number+"/media-token",guest,null).statusCode());
            assertEquals(200,request("POST","/api/meetings/"+number+"/end",host,null).statusCode());
            assertEquals(409,request("POST","/api/meetings/"+number+"/join",guest,json(Map.of("password","1234"))).statusCode());
        } finally {
            for(var s:List.of(a,b,c))try{s.socket().sendClose(WebSocket.NORMAL_CLOSURE,"done").join();}catch(Exception ignored){}
        }
    }
    @Test void meetingParticipantsReceivePublishTokensForOnlyTheirMeeting() throws Exception {
        User host=register(),guest=register();
        var created=request("POST","/api/meetings",host,json(Map.of("title","权限测试")));
        String number=object(created.body()).get("number").toString();
        var meeting=db.one("SELECT * FROM meetings WHERE meeting_number=?",number);
        var member=Map.<String,Object>of("nickname","参会者");
        var actualMedia=new MeetingMediaService(db,"ws://localhost:7880","testkey","testsecret");
        var result=actualMedia.token(meeting,member,guest.id());var token=JWT.decode(result.get("token").toString());
        assertTrue(token.getSubject().startsWith("user."+guest.id()+"."));
        assertEquals("meeting-"+meeting.get("id"),token.getClaim("video").asMap().get("room"));
        assertEquals(true,token.getClaim("video").asMap().get("canPublish"));
        assertEquals(true,token.getClaim("video").asMap().get("canSubscribe"));
        assertEquals(false,token.getClaim("video").asMap().get("canPublishData"));
        long remaining=token.getExpiresAt().getTime()-System.currentTimeMillis();
        assertTrue(remaining>0 && remaining<=300_000,"media token must expire within five minutes");
        assertEquals(1,db.jdbc.queryForObject("SELECT COUNT(*) FROM meeting_media_grants WHERE meeting_id=? AND user_id=?",Integer.class,meeting.get("id"),guest.id()));
    }
    @Test void repeatedWrongNumbersAndPasswordsAreThrottled() throws Exception {
        User host=register(),guest=register(),other=register();
        var created=request("POST","/api/meetings",host,json(Map.of("title","限流测试","password","1234")));
        String number=object(created.body()).get("number").toString();
        for(int i=0;i<6;i++)assertEquals(404,request("POST","/api/meetings/000000000/join",guest,json(Map.of("password","wrong"))).statusCode());
        for(int i=0;i<6;i++)assertEquals(403,request("POST","/api/meetings/"+number+"/join",guest,json(Map.of("password","wrong"))).statusCode());
        assertEquals(429,request("POST","/api/meetings/"+number+"/join",guest,json(Map.of("password","1234"))).statusCode());
        assertEquals(200,request("POST","/api/meetings/"+number+"/join",other,json(Map.of("password","1234"))).statusCode());
    }
    @Test void chatLengthAndFrequencyAreEnforced() throws Exception {
        User host=register();var created=request("POST","/api/meetings",host,json(Map.of("title","聊天限流测试")));
        String number=object(created.body()).get("number").toString();
        assertEquals(200,request("POST","/api/meetings/"+number+"/join",host,json(Map.of())).statusCode());
        Socket socket=socket(host,number);
        try{
            socket.socket().sendText(json(Map.of("type","CHAT","clientId","long","content","x".repeat(1001))),true).join();
            assertTrue(waitFor(socket.events(),"\"code\":400",5000));
            for(int i=0;i<MeetingRateLimiter.CHAT_LIMIT-1;i++)
                socket.socket().sendText(json(Map.of("type","CHAT","clientId","rate-"+i,"content","消息")),true).join();
            socket.socket().sendText(json(Map.of("type","CHAT","clientId","rate-over","content","太快")),true).join();
            assertTrue(waitFor(socket.events(),"\"code\":429",5000));
            String meetingId=db.one("SELECT id FROM meetings WHERE meeting_number=?",number).get("id").toString();
            assertEquals(MeetingRateLimiter.CHAT_LIMIT-1,db.jdbc.queryForObject("SELECT COUNT(*) FROM meeting_messages WHERE meeting_id=?",Integer.class,meetingId));
        }finally{socket.socket().sendClose(WebSocket.NORMAL_CLOSURE,"done").join();}
    }
}
