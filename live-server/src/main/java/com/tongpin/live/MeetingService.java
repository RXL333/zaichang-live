package com.tongpin.live;

import jakarta.servlet.http.HttpSession;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.*;

@Service
public class MeetingService {
    private final Db db;
    private final PasswordEncoder passwords;
    private final MeetingRateLimiter limits;
    private final SecureRandom random = new SecureRandom();
    public MeetingService(Db db, PasswordEncoder passwords, MeetingRateLimiter limits) { this.db=db; this.passwords=passwords; this.limits=limits; }
    static String grantKey(String id) { return "meeting:"+id; }

    public Map<String,Object> byNumber(String number) {
        return db.one("SELECT m.*, u.nickname AS owner_name FROM meetings m JOIN app_users u ON u.id=m.owner_id WHERE m.meeting_number=? AND m.status<>'DELETED'",number);
    }
    public Map<String,Object> byId(String id) {
        return db.one("SELECT m.*, u.nickname AS owner_name FROM meetings m JOIN app_users u ON u.id=m.owner_id WHERE m.id=? AND m.status<>'DELETED'",id);
    }
    public Map<String,Object> publicInfo(Map<String,Object> meeting, String uid) {
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("id",meeting.get("id")); result.put("number",meeting.get("meeting_number"));
        result.put("title",meeting.get("title")); result.put("ownerId",meeting.get("owner_id"));
        result.put("ownerName",meeting.get("owner_name")); result.put("status",meeting.get("status"));
        result.put("hasPassword",meeting.get("password_hash")!=null);
        result.put("isOwner",Objects.equals(uid,meeting.get("owner_id"))); result.put("createdAt",meeting.get("created_at"));
        return result;
    }
    public List<Map<String,Object>> mine(String uid) {
        return db.jdbc.queryForList("SELECT m.*, u.nickname AS owner_name FROM meetings m JOIN app_users u ON u.id=m.owner_id WHERE m.owner_id=? AND m.status<>'DELETED' ORDER BY m.created_at DESC",uid)
            .stream().map(row -> publicInfo(row,uid)).toList();
    }
    private String passwordHash(Object value) {
        String password=Db.text(value);
        if(password.isEmpty()) return null;
        if(password.length()<4 || password.length()>32 || password.getBytes(StandardCharsets.UTF_8).length>72)
            throw new ResponseStatusException(BAD_REQUEST,"会议密码请使用 4–32 个字符");
        return passwords.encode(password);
    }
    public Map<String,Object> create(String uid, Map<String,Object> input) {
        String title=Db.checked(input.get("title"),80,"会议名称"), hash=passwordHash(input.get("password"));
        for(int attempt=0;attempt<8;attempt++) {
            String id=Db.id(), number=Integer.toString(100000000+random.nextInt(900000000));
            try {
                db.jdbc.update("INSERT INTO meetings(id,meeting_number,owner_id,title,password_hash,status,created_at) VALUES(?,?,?,?,?,'OPEN',?)",id,number,uid,title,hash,Db.now());
                return publicInfo(byId(id),uid);
            } catch(DuplicateKeyException ignored) { }
        }
        throw new ResponseStatusException(SERVICE_UNAVAILABLE,"暂时无法创建会议，请重试");
    }
    public void requireOwner(Map<String,Object> meeting,String uid) {
        if(!Objects.equals(meeting.get("owner_id"),uid)) throw new ResponseStatusException(FORBIDDEN,"只有主持人可以进行此操作");
    }
    public void requireOpen(Map<String,Object> meeting) {
        if(!"OPEN".equals(meeting.get("status"))) throw new ResponseStatusException(CONFLICT,"会议已结束");
    }
    public Map<String,Object> update(String number,String uid,Map<String,Object> input) {
        Map<String,Object> meeting=byNumber(number); requireOwner(meeting,uid); requireOpen(meeting);
        String title=Db.checked(input.get("title"),80,"会议名称");
        String action=Db.text(input.get("passwordAction")); Object hash=meeting.get("password_hash");
        if("set".equals(action)) { hash=passwordHash(input.get("password")); if(hash==null) throw new ResponseStatusException(BAD_REQUEST,"请输入会议密码"); }
        else if("remove".equals(action)) hash=null;
        else if(!action.isEmpty() && !"keep".equals(action)) throw new ResponseStatusException(BAD_REQUEST,"密码设置不正确");
        db.jdbc.update("UPDATE meetings SET title=?,password_hash=? WHERE id=?",title,hash,meeting.get("id"));
        return publicInfo(byNumber(number),uid);
    }
    public Map<String,Object> join(String number, HttpSession session, Map<String,Object> input) {
        String uid=db.requireUser(session); limits.join(uid); Map<String,Object> meeting=byNumber(number); requireOpen(meeting);
        Object hash=meeting.get("password_hash");
        if(hash!=null && !Objects.equals(uid,meeting.get("owner_id")) && !passwords.matches(Db.text(input.get("password")),hash.toString()))
            throw new ResponseStatusException(FORBIDDEN,"会议密码不正确");
        String nickname=Db.text(input.get("nickname")); if(nickname.isEmpty()) nickname=db.user(uid).get("nickname").toString();
        nickname=Db.checked(nickname,40,"会议昵称"); String id=meeting.get("id").toString();
        Map<String,Object> existing=db.maybe("SELECT grant_version FROM meeting_members WHERE meeting_id=? AND user_id=?",id,uid);
        if(existing==null) {
            try { db.jdbc.update("INSERT INTO meeting_members(meeting_id,user_id,nickname,grant_version,joined_at) VALUES(?,?,?,1,?)",id,uid,nickname,Db.now()); }
            catch(DuplicateKeyException ignored) { db.jdbc.update("UPDATE meeting_members SET nickname=?,joined_at=? WHERE meeting_id=? AND user_id=?",nickname,Db.now(),id,uid); }
        } else db.jdbc.update("UPDATE meeting_members SET nickname=?,joined_at=? WHERE meeting_id=? AND user_id=?",nickname,Db.now(),id,uid);
        var member=member(id,uid); session.setAttribute(grantKey(id),((Number)member.get("grant_version")).intValue());
        var result=new LinkedHashMap<>(publicInfo(meeting,uid)); result.put("nickname",member.get("nickname")); return result;
    }
    public Map<String,Object> member(String meetingId,String uid) {
        return db.one("SELECT * FROM meeting_members WHERE meeting_id=? AND user_id=?",meetingId,uid);
    }
    public Map<String,Object> requireGrant(Map<String,Object> meeting,String uid,Object version) {
        requireOpen(meeting);
        if(uid==null || version==null) throw new ResponseStatusException(FORBIDDEN,"请先加入会议");
        Map<String,Object> member=db.maybe("SELECT * FROM meeting_members WHERE meeting_id=? AND user_id=?",meeting.get("id"),uid);
        if(member==null || !(version instanceof Number) || ((Number)version).intValue()!=((Number)member.get("grant_version")).intValue())
            throw new ResponseStatusException(FORBIDDEN,"会议访问已失效，请重新加入");
        return member;
    }
    public Map<String,Object> requireGrant(Map<String,Object> meeting,HttpSession session) {
        String uid=db.requireUser(session); return requireGrant(meeting,uid,session.getAttribute(grantKey(meeting.get("id").toString())));
    }
    public void rename(Map<String,Object> meeting,String actor,String target,String nickname) {
        if(!actor.equals(target)) requireOwner(meeting,actor);
        String value=Db.checked(nickname,40,"会议昵称");
        if(db.jdbc.update("UPDATE meeting_members SET nickname=? WHERE meeting_id=? AND user_id=?",value,meeting.get("id"),target)==0)
            throw new ResponseStatusException(NOT_FOUND,"没有找到该成员");
    }
    public void revoke(Map<String,Object> meeting,String uid) {
        if(db.jdbc.update("UPDATE meeting_members SET grant_version=grant_version+1 WHERE meeting_id=? AND user_id=?",meeting.get("id"),uid)==0)
            throw new ResponseStatusException(NOT_FOUND,"没有找到该成员");
    }
    public void finish(Map<String,Object> meeting,String status) {
        db.jdbc.update("UPDATE meetings SET status=?,ended_at=? WHERE id=?",status,Db.now(),meeting.get("id"));
        db.jdbc.update("UPDATE meeting_members SET grant_version=grant_version+1 WHERE meeting_id=?",meeting.get("id"));
    }
    public List<Map<String,Object>> messages(String id) {
        var rows=new ArrayList<>(db.jdbc.queryForList("SELECT id,user_id,nickname,content,client_id,seq,created_at FROM meeting_messages WHERE meeting_id=? ORDER BY seq DESC LIMIT 200",id));
        Collections.reverse(rows); return rows;
    }
    @Transactional
    public Map<String,Object> chat(String id,String uid,String clientId,String content) {
        String message=Db.checked(content,1000,"消息"), key=Db.checked(clientId,100,"消息编号");
        var meeting=db.one("SELECT chat_seq FROM meetings WHERE id=? FOR UPDATE",id);
        var previous=db.maybe("SELECT id,user_id,nickname,content,client_id,seq,created_at FROM meeting_messages WHERE meeting_id=? AND user_id=? AND client_id=?",id,uid,key);
        if(previous!=null) { var result=new LinkedHashMap<>(previous);result.put("duplicate",true);return result; }
        long seq=((Number)meeting.get("chat_seq")).longValue()+1,now=Db.now();String mid=Db.id();
        String name=member(id,uid).get("nickname").toString();
        db.jdbc.update("UPDATE meetings SET chat_seq=? WHERE id=?",seq,id);
        db.jdbc.update("INSERT INTO meeting_messages(id,meeting_id,user_id,nickname,content,client_id,seq,created_at) VALUES(?,?,?,?,?,?,?,?)",mid,id,uid,name,message,key,seq,now);
        var result=new LinkedHashMap<>(db.one("SELECT id,user_id,nickname,content,client_id,seq,created_at FROM meeting_messages WHERE id=?",mid));result.put("duplicate",false);return result;
    }
}
