package com.tongpin.live;

import jakarta.servlet.http.HttpSession;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.HandshakeInterceptor;

@Configuration @EnableWebSocket
public class SocketConfig implements WebSocketConfigurer {
    private final LiveSocket socket;private final MeetingSocket meetings;private final String origin,environment,extraOrigin;
    public SocketConfig(LiveSocket socket,MeetingSocket meetings,@Value("${app.public-origin}")String origin,@Value("${app.environment}")String environment,@Value("${app.extra-origin:}")String extraOrigin){this.socket=socket;this.meetings=meetings;this.origin=origin;this.environment=environment;this.extraOrigin=extraOrigin;}
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry){
        var registration=registry.addHandler(socket,"/ws/live").addInterceptors(new HandshakeInterceptor(){
            public boolean beforeHandshake(ServerHttpRequest request,ServerHttpResponse response,WebSocketHandler handler,Map<String,Object> attrs){
                if(request instanceof ServletServerHttpRequest servlet){HttpSession session=servlet.getServletRequest().getSession(false);if(session!=null)attrs.put("httpSession",session);} return true;
            }
            public void afterHandshake(ServerHttpRequest request,ServerHttpResponse response,WebSocketHandler handler,Exception exception){}
        });
        if("production".equals(environment)) registration.setAllowedOrigins(extraOrigin.isBlank()?new String[]{origin}:new String[]{origin,extraOrigin});
        else registration.setAllowedOrigins(origin,"http://localhost:5173","http://127.0.0.1:5173","http://localhost:18080","http://127.0.0.1:18080");
        var conference=registry.addHandler(meetings,"/ws/meetings");
        if("production".equals(environment)) conference.setAllowedOrigins(extraOrigin.isBlank()?new String[]{origin}:new String[]{origin,extraOrigin});
        else conference.setAllowedOrigins(origin,"http://localhost:5173","http://127.0.0.1:5173","http://localhost:18080","http://127.0.0.1:18080");
    }
}
