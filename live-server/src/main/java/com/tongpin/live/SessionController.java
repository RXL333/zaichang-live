package com.tongpin.live;

import jakarta.servlet.http.HttpSession;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {
    private final Db db; private final MediaService media; private final InteractionService interactions;
    public SessionController(Db db,MediaService media,InteractionService interactions){this.db=db;this.media=media;this.interactions=interactions;}
    @PostMapping("/{id}/media-token") Map<String,Object> token(@PathVariable String id,@RequestBody Map<String,Object> request,HttpSession session){return media.issue(id,Db.text(request.get("role")),session);}
    @PostMapping("/{id}/activate") Map<String,Object> activate(@PathVariable String id,HttpSession session){media.activate(id,db.requireUser(session));return Map.of("status","LIVE");}
    @PostMapping("/{id}/end") Map<String,Object> end(@PathVariable String id,HttpSession session){return media.end(id,db.requireUser(session));}
    @GetMapping("/{id}/messages") List<Map<String,Object>> messages(@PathVariable String id,@RequestParam(defaultValue="0") long after,@RequestParam(defaultValue="false") boolean latest){
        db.one("SELECT id FROM live_sessions WHERE id=?",id);
        String columns="SELECT id,seq,user_id,client_id,nickname,CASE WHEN deleted=TRUE THEN '' ELSE content END AS content,created_at,deleted FROM chat_messages WHERE session_id=? ";
        if(latest){var rows=new ArrayList<>(db.jdbc.queryForList(columns+"ORDER BY seq DESC LIMIT 200",id));Collections.reverse(rows);return rows;}
        return db.jdbc.queryForList(columns+"AND seq>? ORDER BY seq ASC LIMIT 200",id,Math.max(0,after));
    }
    @GetMapping("/{id}/interactions") Map<String,Object> interactions(@PathVariable String id,HttpSession session){return interactions.snapshot(id,(String)session.getAttribute("userId"));}
}
