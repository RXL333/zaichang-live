package com.tongpin.live;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {
    @GetMapping({"/", "/following", "/room/{roomId}", "/studio", "/studio/{roomId}", "/join/{number}", "/meeting/{number}"})
    public String index(){return "forward:/index.html";}
}
