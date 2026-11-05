package com.tongpin.live;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ProductionChecks {
    @Value("${app.environment}") String environment;
    @Value("${app.public-origin}") String origin;
    @Value("${spring.datasource.url}") String database;
    @Value("${livekit.url}") String mediaUrl;
    @Value("${livekit.api-key}") String mediaKey;
    @Value("${livekit.api-secret}") String mediaSecret;
    @Value("${server.servlet.session.cookie.secure}") boolean secureCookie;
    @PostConstruct void validate(){
        if(!"production".equals(environment))return;
        if(!database.startsWith("jdbc:postgresql:") || !mediaUrl.startsWith("wss://") || mediaKey.isBlank() || mediaKey.equals("devkey") || mediaSecret.isBlank() || mediaSecret.equals("secret") || !origin.startsWith("https://") || !secureCookie)
            throw new IllegalStateException("正式环境必须配置 PostgreSQL、HTTPS、WSS、LiveKit 密钥及安全 Cookie。");
    }
}
