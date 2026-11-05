package com.tongpin.live;

import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class InteractionService {
    private final Db db;
    public InteractionService(Db db){this.db=db;}
    public Map<String,Object> live(String id) { var live=db.one("SELECT * FROM live_sessions WHERE id=?",id); if(!"LIVE".equals(live.get("status")) && !"RECONNECTING".equals(live.get("status")))throw new ResponseStatusException(HttpStatus.CONFLICT,"直播尚未开始或已经结束"); return live; }
    public void canSpeak(String room,String user){
        if(user==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"请登录后参与互动");
        var mute=db.maybe("SELECT until_at FROM muted_users WHERE room_id=? AND user_id=?",room,user);
        if(mute!=null && ((Number)mute.get("until_at")).longValue()>Db.now())throw new ResponseStatusException(HttpStatus.FORBIDDEN,"你暂时不能在这个房间发言");
    }
    @Transactional public Map<String,Object> chat(String sessionId,String user,String clientId,String content){
        var live=live(sessionId);canSpeak(live.get("room_id").toString(),user);
        clientId=Db.checked(clientId,100,"消息编号");content=Db.checked(content,300,"弹幕");
        var old=db.maybe("SELECT id,seq,nickname,CASE WHEN deleted=TRUE THEN '' ELSE content END AS content,created_at,deleted FROM chat_messages WHERE session_id=? AND user_id=? AND client_id=?",sessionId,user,clientId);
        if(old!=null){var result=new LinkedHashMap<>(old);result.put("duplicate",true);result.put("userId",user);result.put("clientMessageId",clientId);return result;}
        db.one("SELECT id FROM live_sessions WHERE id=? FOR UPDATE",sessionId);
        old=db.maybe("SELECT id,seq,nickname,CASE WHEN deleted=TRUE THEN '' ELSE content END AS content,created_at,deleted FROM chat_messages WHERE session_id=? AND user_id=? AND client_id=?",sessionId,user,clientId);
        if(old!=null){var result=new LinkedHashMap<>(old);result.put("duplicate",true);result.put("userId",user);result.put("clientMessageId",clientId);return result;}
        db.jdbc.update("UPDATE live_sessions SET chat_seq=chat_seq+1 WHERE id=?",sessionId);
        long seq=((Number)db.one("SELECT chat_seq FROM live_sessions WHERE id=?",sessionId).get("chat_seq")).longValue();
        String id=Db.id(),name=db.user(user).get("nickname").toString();long now=Db.now();
        db.jdbc.update("INSERT INTO chat_messages(id,session_id,user_id,nickname,content,client_id,seq,created_at) VALUES(?,?,?,?,?,?,?,?)",id,sessionId,user,name,content,clientId,seq,now);
        return Map.of("id",id,"seq",seq,"nickname",name,"content",content,"created_at",now,"userId",user,"clientMessageId",clientId,"duplicate",false);
    }
    @Transactional public void createPoll(String id,String user,String question,List<?> options){
        var live=live(id);db.requireOwner(live.get("room_id").toString(),user); question=Db.checked(question,150,"投票问题");
        db.one("SELECT id FROM live_sessions WHERE id=? FOR UPDATE",id);
        if(options==null || options.size()<2 || options.size()>4)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"投票需要 2–4 个选项");
        List<String> values=options.stream().map(x->Db.checked(x,100,"投票选项")).toList();
        if(values.stream().distinct().count()!=values.size())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"投票选项不能重复");
        db.jdbc.update("UPDATE polls SET status='CLOSED' WHERE session_id=? AND status='OPEN'",id);
        String poll=Db.id();db.jdbc.update("INSERT INTO polls(id,session_id,question,status,created_at) VALUES(?,?,?,'OPEN',?)",poll,id,question,Db.now());
        for(int i=0;i<values.size();i++)db.jdbc.update("INSERT INTO poll_options(id,poll_id,label,sort_order) VALUES(?,?,?,?)",Db.id(),poll,values.get(i),i);
    }
    @Transactional public void vote(String sessionId,String user,String poll,String option){
        var live=live(sessionId);canSpeak(live.get("room_id").toString(),user);
        var row=db.one("SELECT id,status FROM polls WHERE id=? AND session_id=?",poll,sessionId);
        if(!"OPEN".equals(row.get("status")))throw new ResponseStatusException(HttpStatus.CONFLICT,"投票已经结束");
        db.one("SELECT id FROM poll_options WHERE id=? AND poll_id=?",option,poll);
        try{db.jdbc.update("INSERT INTO poll_votes(poll_id,user_id,option_id) VALUES(?,?,?)",poll,user,option);}catch(DuplicateKeyException e){throw new ResponseStatusException(HttpStatus.CONFLICT,"你已经参与过本次投票");}
    }
    public void closePoll(String sessionId,String user,String poll){var live=live(sessionId);db.requireOwner(live.get("room_id").toString(),user);db.jdbc.update("UPDATE polls SET status='CLOSED' WHERE id=? AND session_id=?",poll,sessionId);}
    public void ask(String sessionId,String user,String content){var live=live(sessionId);canSpeak(live.get("room_id").toString(),user);String name=db.user(user).get("nickname").toString();db.jdbc.update("INSERT INTO questions(id,session_id,user_id,nickname,content,status,created_at) VALUES(?,?,?,?,?,'OPEN',?)",Db.id(),sessionId,user,name,Db.checked(content,300,"问题"),Db.now());}
    public void upvote(String sessionId,String user,String question){var live=live(sessionId);canSpeak(live.get("room_id").toString(),user);db.one("SELECT id FROM questions WHERE id=? AND session_id=?",question,sessionId);try{db.jdbc.update("INSERT INTO question_votes(question_id,user_id) VALUES(?,?)",question,user);}catch(DuplicateKeyException ignored){}}
    public void answer(String sessionId,String user,String question){var live=live(sessionId);db.requireOwner(live.get("room_id").toString(),user);db.jdbc.update("UPDATE questions SET status='ANSWERED' WHERE id=? AND session_id=?",question,sessionId);}
    public Map<String,Object> snapshot(String id,String user){
        db.one("SELECT id FROM live_sessions WHERE id=?",id);
        List<Map<String,Object>> polls=db.jdbc.queryForList("SELECT id,question,status,created_at FROM polls WHERE session_id=? ORDER BY created_at DESC LIMIT 1",id);
        Map<String,Object> poll=null;
        if(!polls.isEmpty()){
            poll=new LinkedHashMap<>(polls.get(0));String pollId=poll.get("id").toString();
            poll.put("options",db.jdbc.queryForList("SELECT o.id,o.label,(SELECT COUNT(*) FROM poll_votes v WHERE v.option_id=o.id) AS votes FROM poll_options o WHERE o.poll_id=? ORDER BY o.sort_order",pollId));
            var vote=user==null?null:db.maybe("SELECT option_id FROM poll_votes WHERE poll_id=? AND user_id=?",pollId,user);poll.put("myVote",vote==null?null:vote.get("option_id"));
        }
        List<Map<String,Object>> questions=db.jdbc.queryForList("SELECT q.id,q.nickname,q.content,q.status,q.created_at,(SELECT COUNT(*) FROM question_votes v WHERE v.question_id=q.id) AS votes FROM questions q WHERE q.session_id=? ORDER BY q.created_at DESC LIMIT 100",id);
        var requests=db.jdbc.queryForList("SELECT id,user_id,nickname,identity,status,confirmed,created_at FROM mic_requests WHERE session_id=? AND status IN ('PENDING','APPROVED') ORDER BY created_at",id);
        var result=new LinkedHashMap<String,Object>();result.put("poll",poll);result.put("questions",questions);result.put("micRequests",requests);return result;
    }
}
