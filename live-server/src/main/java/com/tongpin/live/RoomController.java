package com.tongpin.live;

import jakarta.servlet.http.HttpSession;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {
    private static final Set<String> CATEGORIES=Set.of("聊天", "游戏", "音乐", "学习", "生活", "其他");
    private static final Set<String> COVERS=Set.of("tomato", "lime", "cream", "charcoal");
    private final Db db;
    public RoomController(Db db) { this.db=db; }
    private Map<String,Object> view(Map<String,Object> row, String viewer) {
        var r=new LinkedHashMap<String,Object>();
        r.put("id",row.get("id")); r.put("title",row.get("title")); r.put("description",row.get("description"));
        r.put("category",row.get("category")); r.put("coverStyle",row.get("cover_style")); r.put("ownerId",row.get("owner_id"));
        r.put("ownerName",row.get("nickname")); r.put("createdAt",row.get("created_at"));
        Map<String,Object> live=db.maybe("SELECT id,status,started_at,viewer_count,viewer_count_updated_at FROM live_sessions WHERE room_id=? AND status<>? ORDER BY started_at DESC LIMIT 1",row.get("id"),"ENDED");
        r.put("status",live==null ? "OFFLINE" : live.get("status")); r.put("sessionId",live==null ? null : live.get("id"));
        Object count=null;
        if(live==null) count=0;
        else if(live.get("viewer_count_updated_at") instanceof Number last && Db.now()-last.longValue()<30000) count=live.get("viewer_count");
        r.put("startedAt",live==null ? null : live.get("started_at")); r.put("viewerCount",count);
        r.put("following", viewer!=null && db.maybe("SELECT user_id FROM follows WHERE room_id=? AND user_id=?",row.get("id"),viewer)!=null);
        return r;
    }
    @GetMapping List<Map<String,Object>> list(@RequestParam(defaultValue="") String q, @RequestParam(defaultValue="") String category,
                                             @RequestParam(defaultValue="false") boolean following, HttpSession session) {
        String viewer=(String)session.getAttribute("userId");
        if (following && viewer==null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"登录后查看关注的直播间");
        List<Map<String,Object>> rows=db.jdbc.queryForList("SELECT r.*,u.nickname FROM rooms r JOIN app_users u ON u.id=r.owner_id ORDER BY r.created_at DESC");
        String query=q.trim().toLowerCase();
        return rows.stream().map(row -> view(row,viewer)).filter(room -> (query.isEmpty() || (room.get("title")+" "+room.get("ownerName")).toLowerCase().contains(query)) && (category.isBlank() || category.equals(room.get("category"))) && (!following || Boolean.TRUE.equals(room.get("following")))).toList();
    }
    @GetMapping("/{roomId}") Map<String,Object> detail(@PathVariable String roomId, HttpSession session) {
        return view(db.one("SELECT r.*,u.nickname FROM rooms r JOIN app_users u ON u.id=r.owner_id WHERE r.id=?",roomId),(String)session.getAttribute("userId"));
    }
    @PostMapping Map<String,Object> create(@RequestBody Map<String,Object> input,HttpSession session) {
        String user=db.requireUser(session), title=Db.checked(input.get("title"),80,"标题");
        String description=Db.text(input.get("description")); if(description.length()>500) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"简介不能超过 500 字");
        String category=Db.text(input.get("category")); if(!CATEGORIES.contains(category)) category="聊天";
        String cover=Db.text(input.get("coverStyle")); if(!COVERS.contains(cover)) cover="tomato";
        String id=Db.id(); db.jdbc.update("INSERT INTO rooms(id,owner_id,title,description,category,cover_style,created_at) VALUES(?,?,?,?,?,?,?)",id,user,title,description,category,cover,Db.now());
        return detail(id,session);
    }
    @PatchMapping("/{roomId}") Map<String,Object> update(@PathVariable String roomId,@RequestBody Map<String,Object> input,HttpSession session) {
        db.requireOwner(roomId,db.requireUser(session));
        String title=Db.checked(input.get("title"),80,"标题"),description=Db.text(input.get("description"));
        String category=Db.text(input.get("category")),cover=Db.text(input.get("coverStyle"));
        if(description.length()>500 || !CATEGORIES.contains(category) || !COVERS.contains(cover)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"房间信息不正确");
        db.jdbc.update("UPDATE rooms SET title=?,description=?,category=?,cover_style=? WHERE id=?",title,description,category,cover,roomId);
        return detail(roomId,session);
    }
    @PostMapping("/{roomId}/follow") Map<String,Boolean> follow(@PathVariable String roomId,HttpSession session) {
        String user=db.requireUser(session); db.one("SELECT id FROM rooms WHERE id=?",roomId);
        try { db.jdbc.update("INSERT INTO follows(user_id,room_id,created_at) VALUES(?,?,?)",user,roomId,Db.now()); } catch(DuplicateKeyException ignored) {}
        return Map.of("following",true);
    }
    @DeleteMapping("/{roomId}/follow") Map<String,Boolean> unfollow(@PathVariable String roomId,HttpSession session) {
        db.jdbc.update("DELETE FROM follows WHERE user_id=? AND room_id=?",db.requireUser(session),roomId); return Map.of("following",false);
    }
    @PostMapping("/{roomId}/sessions") @Transactional Map<String,Object> start(@PathVariable String roomId,HttpSession session) {
        String user=db.requireUser(session); db.requireOwner(roomId,user);
        db.one("SELECT id FROM rooms WHERE id=? FOR UPDATE",roomId);
        Map<String,Object> previous=db.maybe("SELECT * FROM live_sessions WHERE room_id=? AND status<>? ORDER BY started_at DESC LIMIT 1",roomId,"ENDED");
        if(previous!=null) return Map.of("id",previous.get("id"),"status",previous.get("status"));
        String id=Db.id(); db.jdbc.update("INSERT INTO live_sessions(id,room_id,status,started_at) VALUES(?,?,?,?)",id,roomId,"PREPARING",Db.now());
        return Map.of("id",id,"status","PREPARING");
    }
}
