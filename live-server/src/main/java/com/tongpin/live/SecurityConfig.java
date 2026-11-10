package com.tongpin.live;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }
    @Bean CorsConfigurationSource corsConfigurationSource(@Value("${app.public-origin}") String origin,
                                                            @Value("${app.environment}") String environment) {
        var cors = new CorsConfiguration();
        cors.setAllowedOrigins("production".equals(environment) ? List.of(origin) :
            List.of(origin, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:18080", "http://127.0.0.1:18080"));
        cors.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Content-Type", "X-CSRF-TOKEN", "X-Auth-Token"));
        cors.setExposedHeaders(List.of("X-Auth-Token"));
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cors);
        return source;
    }
    @Bean SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        var csrfHandler = new CsrfTokenRequestAttributeHandler();
        http.cors(Customizer.withDefaults())
            .csrf(csrf -> csrf.csrfTokenRequestHandler(csrfHandler).ignoringRequestMatchers("/api/livekit/webhook"))
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
            .headers(headers -> headers.frameOptions(frame -> frame.deny()));
        return http.build();
    }
}
