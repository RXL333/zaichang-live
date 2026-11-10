package com.tongpin.live;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.session.MapSessionRepository;
import org.springframework.session.Session;
import org.springframework.session.config.annotation.web.http.EnableSpringHttpSession;
import org.springframework.session.web.http.HeaderHttpSessionIdResolver;
import org.springframework.session.web.http.HttpSessionIdResolver;

@Configuration
@EnableSpringHttpSession
public class SessionConfig {
    private final ConcurrentMap<String, Session> sessions = new ConcurrentHashMap<>();

    @Bean MapSessionRepository sessionRepository() {
        var repository = new MapSessionRepository(sessions);
        repository.setDefaultMaxInactiveInterval(Duration.ofDays(7));
        return repository;
    }

    @Bean HttpSessionIdResolver httpSessionIdResolver() {
        return HeaderHttpSessionIdResolver.xAuthToken();
    }

    @Scheduled(fixedDelay = 3600000)
    void removeExpiredSessions() {
        sessions.forEach((id, ignored) -> sessions.computeIfPresent(id, (key, session) -> session.isExpired() ? null : session));
    }
}
