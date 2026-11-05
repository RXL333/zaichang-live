package com.tongpin.live;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

@Configuration
public class SecurityConfig {
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }
    @Bean SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        var csrfHandler = new CsrfTokenRequestAttributeHandler();
        http.csrf(csrf -> csrf.csrfTokenRequestHandler(csrfHandler).ignoringRequestMatchers("/api/livekit/webhook"))
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
            .headers(headers -> headers.frameOptions(frame -> frame.deny()));
        return http.build();
    }
}
