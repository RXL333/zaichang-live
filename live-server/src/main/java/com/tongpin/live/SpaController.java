package com.tongpin.live;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {
    @GetMapping({"/", "/following", "/room/{roomId}", "/studio", "/studio/{roomId}"})
    public String index(){return "forward:/index.html";}
}
