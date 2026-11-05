package com.tongpin.live;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final Db db;
    public HealthController(Db db){this.db=db;}
    @GetMapping("/api/system/status")
    public Map<String,String> status(){db.jdbc.queryForObject("SELECT 1",Integer.class);return Map.of("status","OK");}
}
