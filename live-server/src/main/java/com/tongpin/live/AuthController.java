package com.tongpin.live;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class AuthController {
    private final Db db;
    private final PasswordEncoder encoder;
    public AuthController(Db db, PasswordEncoder encoder) { this.db=db; this.encoder=encoder; }
    @GetMapping("/csrf") Map<String,String> csrf(CsrfToken token) { return Map.of("headerName",token.getHeaderName(),"token",token.getToken()); }
    @GetMapping("/auth/me") Map<String,Object> me(HttpSession session) {
        Object id=session.getAttribute("userId");
        if (id == null) return Map.of("authenticated", false);
        Map<String,Object> user=db.maybe("SELECT id, username, nickname FROM app_users WHERE id=?",id);
        return user == null ? Map.of("authenticated",false) : Map.of("authenticated",true,"user",user);
    }
    @PostMapping("/auth/register") Map<String,Object> register(@RequestBody Map<String,Object> input, HttpServletRequest request) {
        String username=Db.checked(input.get("username"),32,"账号").toLowerCase();
        String nickname=Db.checked(input.get("nickname"),40,"昵称");
        String password=Db.text(input.get("password"));
        if (!username.matches("[a-z0-9_]{3,32}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"账号请使用 3–32 位小写字母、数字或下划线");
        if (password.length()<8 || password.length()>72) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"密码需要 8–72 个字符");
        String id=Db.id();
        try { db.jdbc.update("INSERT INTO app_users(id,username,password_hash,nickname,created_at) VALUES(?,?,?,?,?)",id,username,encoder.encode(password),nickname,Db.now()); }
        catch (DuplicateKeyException ex) { throw new ResponseStatusException(HttpStatus.CONFLICT,"这个账号已经被注册了"); }
        HttpSession session=request.getSession(true); request.changeSessionId(); session.setAttribute("userId",id);
        return Map.of("user",db.user(id));
    }
    @PostMapping("/auth/login") Map<String,Object> login(@RequestBody Map<String,Object> input, HttpServletRequest request) {
        String username=Db.text(input.get("username")).toLowerCase();
        String password=Db.text(input.get("password"));
        Map<String,Object> user=db.maybe("SELECT id, password_hash FROM app_users WHERE username=?",username);
        if (user==null || !encoder.matches(password,user.get("password_hash").toString())) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"账号或密码不正确");
        HttpSession session=request.getSession(true); request.changeSessionId(); session.setAttribute("userId",user.get("id"));
        return Map.of("user",db.user(user.get("id").toString()));
    }
    @PostMapping("/auth/logout") Map<String,Boolean> logout(HttpSession session) { session.invalidate(); return Map.of("ok",true); }
}
