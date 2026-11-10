package com.tongpin.live;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:header_session_test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.sql.init.mode=always",
    "app.public-origin=https://pages.example"
})
class HeaderSessionIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired Db db;
    final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    HttpResponse<String> request(String method, String path, String session, String csrf, String body) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path))
            .header("Origin","https://pages.example").timeout(Duration.ofSeconds(10));
        if(session!=null)builder.header("X-Auth-Token",session);
        if(csrf!=null)builder.header("X-CSRF-TOKEN",csrf);
        if(body!=null)builder.header("Content-Type","application/json");
        builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body));
        return client.send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }

    @Test void crossSiteLoginAndSocketIdentityAreInvalidatedOnLogout() throws Exception {
        var initial=request("GET","/api/csrf",null,null,null);
        assertEquals(200,initial.statusCode());
        assertEquals("https://pages.example",initial.headers().firstValue("Access-Control-Allow-Origin").orElse(""));
        String guest=initial.headers().firstValue("X-Auth-Token").orElseThrow();
        String csrf=mapper.readValue(initial.body(),Map.class).get("token").toString();
        String username="u"+UUID.randomUUID().toString().replace("-","").substring(0,12);
        var registered=request("POST","/api/auth/register",guest,csrf,mapper.writeValueAsString(Map.of("username",username,"nickname","测试主播","password","temporary-password")));
        assertEquals(200,registered.statusCode(),registered.body());
        String authenticated=registered.headers().firstValue("X-Auth-Token").orElseThrow();
        assertNotEquals(guest,authenticated);
        assertEquals(true,mapper.readValue(request("GET","/api/auth/me",authenticated,null,null).body(),Map.class).get("authenticated"));
        assertEquals(false,mapper.readValue(request("GET","/api/auth/me",guest,null,null).body(),Map.class).get("authenticated"));

        var room=request("POST","/api/rooms",authenticated,csrf,mapper.writeValueAsString(Map.of("title","测试直播间")));
        assertEquals(200,room.statusCode(),room.body());
        String roomId=mapper.readValue(room.body(),Map.class).get("id").toString();
        var live=request("POST","/api/rooms/"+roomId+"/sessions",authenticated,csrf,"{}");
        assertEquals(200,live.statusCode(),live.body());
        String liveId=mapper.readValue(live.body(),Map.class).get("id").toString();
        db.jdbc.update("UPDATE live_sessions SET status='LIVE' WHERE id=?",liveId);

        var messages=new LinkedBlockingQueue<String>();
        WebSocket socket=client.newWebSocketBuilder().header("Origin","https://pages.example")
            .buildAsync(URI.create("ws://127.0.0.1:"+port+"/ws/live"),new QueueListener(messages)).get(10,TimeUnit.SECONDS);
        try {
            socket.sendText(mapper.writeValueAsString(Map.of("type","JOIN","roomId",roomId,"sessionId",liveId,"authToken",authenticated)),true).join();
            socket.sendText(mapper.writeValueAsString(Map.of("type","DANMAKU","clientMessageId","first","content","hello")),true).join();
            assertTrue(waitFor(messages,"DANMAKU_ACK"),"authenticated socket should be able to send chat");
            var logout=request("POST","/api/auth/logout",authenticated,csrf,null);
            assertEquals(200,logout.statusCode(),logout.body());
            socket.sendText(mapper.writeValueAsString(Map.of("type","REACTION","value","heart")),true).join();
            assertTrue(waitFor(messages,"\"code\":401"),"logged-out socket must lose permission");
        } finally { socket.sendClose(WebSocket.NORMAL_CLOSURE,"done").join(); }
    }

    private boolean waitFor(BlockingQueue<String> messages,String expected) throws InterruptedException {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
        while(System.nanoTime()<deadline){String message=messages.poll(200,TimeUnit.MILLISECONDS);if(message!=null && message.contains(expected))return true;}
        return false;
    }

    private static class QueueListener implements WebSocket.Listener {
        private final BlockingQueue<String> messages;
        private final StringBuilder parts=new StringBuilder();
        QueueListener(BlockingQueue<String> messages){this.messages=messages;}
        @Override public void onOpen(WebSocket webSocket){webSocket.request(1);}
        @Override public CompletionStage<?> onText(WebSocket webSocket,CharSequence data,boolean last){
            parts.append(data);if(last){messages.add(parts.toString());parts.setLength(0);}webSocket.request(1);return null;
        }
    }
}
