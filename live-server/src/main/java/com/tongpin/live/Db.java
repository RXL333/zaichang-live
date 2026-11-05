package com.tongpin.live;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;

@Component
public class Db {
    public final JdbcTemplate jdbc;
    public Db(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public static String id() { return UUID.randomUUID().toString(); }
    public static long now() { return System.currentTimeMillis(); }
    public Map<String, Object> one(String sql, Object... args) {
        List<Map<String,Object>> rows = jdbc.queryForList(sql, args);
        if (rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND, "没有找到对应的内容");
        return rows.get(0);
    }
    public Map<String, Object> maybe(String sql, Object... args) {
        List<Map<String,Object>> rows = jdbc.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.get(0);
    }
    public static String text(Object value) { return value == null ? "" : value.toString().trim(); }
    public static String checked(Object value, int max, String label) {
        String result = text(value);
        if (result.isEmpty() || result.length() > max) throw new ResponseStatusException(BAD_REQUEST, label + "不能为空且不能超过 " + max + " 个字符");
        return result;
    }
    public String requireUser(jakarta.servlet.http.HttpSession session) {
        Object id = session == null ? null : session.getAttribute("userId");
        if (id == null) throw new ResponseStatusException(UNAUTHORIZED, "请登录后参与互动");
        return id.toString();
    }
    public Map<String,Object> user(String id) { return one("SELECT id, username, nickname, created_at FROM app_users WHERE id=?", id); }
    public void requireOwner(String roomId, String userId) {
        Map<String,Object> room = one("SELECT owner_id FROM rooms WHERE id=?", roomId);
        if (!room.get("owner_id").equals(userId)) throw new ResponseStatusException(FORBIDDEN, "只有主播可以进行此操作");
    }
}
