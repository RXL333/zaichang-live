package com.tongpin.live;

import jakarta.servlet.http.HttpSession;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/meetings")
public class MeetingController {
    private final Db db;private final MeetingService meetings;private final MeetingMediaService media;private final MeetingSocket sockets;private final SessionLocks locks;
    public MeetingController(Db db,MeetingService meetings,MeetingMediaService media,MeetingSocket sockets,SessionLocks locks){this.db=db;this.meetings=meetings;this.media=media;this.sockets=sockets;this.locks=locks;}
    @GetMapping public List<Map<String,Object>> mine(HttpSession session){return meetings.mine(db.requireUser(session));}
    @PostMapping public Map<String,Object> create(@RequestBody Map<String,Object> input,HttpSession session){return meetings.create(db.requireUser(session),input);}
    @GetMapping("/{number}") public Map<String,Object> info(@PathVariable String number,HttpSession session){
        return meetings.publicInfo(meetings.byNumber(number),(String)session.getAttribute("userId"));
    }
    @PatchMapping("/{number}") public Map<String,Object> update(@PathVariable String number,@RequestBody Map<String,Object> input,HttpSession session){
        var updated=meetings.update(number,db.requireUser(session),input);sockets.meetingChanged(updated.get("id").toString());return updated;
    }
    @PostMapping("/{number}/join") public Map<String,Object> join(@PathVariable String number,@RequestBody Map<String,Object> input,HttpSession session){return meetings.join(number,session,input);}
    @GetMapping("/{number}/state") public Map<String,Object> state(@PathVariable String number,HttpSession session){
        var meeting=meetings.byNumber(number);var member=meetings.requireGrant(meeting,session);
        var result=new LinkedHashMap<>(meetings.publicInfo(meeting,db.requireUser(session)));result.put("nickname",member.get("nickname"));return result;
    }
    @GetMapping("/{number}/messages") public List<Map<String,Object>> messages(@PathVariable String number,HttpSession session){
        var meeting=meetings.byNumber(number);meetings.requireGrant(meeting,session);return meetings.messages(meeting.get("id").toString());
    }
    @PostMapping("/{number}/media-token") public Map<String,Object> token(@PathVariable String number,HttpSession session){
        String id=meetings.byNumber(number).get("id").toString();synchronized(locks.meeting(id)){
            var meeting=meetings.byNumber(number);var member=meetings.requireGrant(meeting,session);return media.token(meeting,member,db.requireUser(session));
        }
    }
    @PostMapping("/{number}/obs") public Map<String,Object> obs(@PathVariable String number,HttpSession session){
        String id=meetings.byNumber(number).get("id").toString();synchronized(locks.meeting(id)){
            var meeting=meetings.byNumber(number);var member=meetings.requireGrant(meeting,session);return media.createObs(meeting,member,db.requireUser(session));
        }
    }
    @DeleteMapping("/{number}/obs") public Map<String,Boolean> stopObs(@PathVariable String number,HttpSession session){
        String id=meetings.byNumber(number).get("id").toString();synchronized(locks.meeting(id)){
            var meeting=meetings.byNumber(number);meetings.requireGrant(meeting,session);media.deleteObs(id,db.requireUser(session));return Map.of("ok",true);
        }
    }
    @PostMapping("/{number}/end") public Map<String,Boolean> end(@PathVariable String number,HttpSession session){
        String id=meetings.byNumber(number).get("id").toString();synchronized(locks.meeting(id)){
            var meeting=meetings.byNumber(number);meetings.requireOwner(meeting,db.requireUser(session));meetings.requireOpen(meeting);
            media.close(id);meetings.finish(meeting,"ENDED");sockets.meetingEnded(id);return Map.of("ok",true);
        }
    }
    @DeleteMapping("/{number}") public Map<String,Boolean> delete(@PathVariable String number,HttpSession session){
        String id=meetings.byNumber(number).get("id").toString();synchronized(locks.meeting(id)){
            var meeting=meetings.byNumber(number);meetings.requireOwner(meeting,db.requireUser(session));
            if("OPEN".equals(meeting.get("status")))media.close(id);
            meetings.finish(meeting,"DELETED");sockets.meetingEnded(id);return Map.of("ok",true);
        }
    }
}
