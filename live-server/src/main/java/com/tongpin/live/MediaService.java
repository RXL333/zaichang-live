package com.tongpin.live;

import io.livekit.server.*;
import jakarta.servlet.http.HttpSession;
import java.util.*;
import livekit.LivekitModels;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MediaService {
    private final Db db; private final RoomBroadcaster broadcaster; private final SessionLocks locks;
    private final String url,key,secret; private final RoomServiceClient client;
    private final Object[] hostLocks=java.util.stream.IntStream.range(0,128).mapToObj(i -> new Object()).toArray();
    public MediaService(Db db,RoomBroadcaster broadcaster,SessionLocks locks,@Value("${livekit.url}")String url,@Value("${livekit.api-key}")String key,@Value("${livekit.api-secret}")String secret) {
        this.db=db;this.broadcaster=broadcaster;this.locks=locks;this.url=url;this.key=key;this.secret=secret;
        String api=url.replaceFirst("^wss://","https://").replaceFirst("^ws://","http://");
        this.client=RoomServiceClient.createClient(api,key,secret);
    }
    public Map<String,Object> issue(String sessionId, String role, HttpSession session) {
        if("host".equals(role)) synchronized(hostLocks[Math.floorMod(sessionId.hashCode(),hostLocks.length)]) { return issueLocked(sessionId,role,session); }
        return issueLocked(sessionId,role,session);
    }
    private Map<String,Object> issueLocked(String sessionId, String role, HttpSession session) {
        Map<String,Object> live=db.one("SELECT * FROM live_sessions WHERE id=?",sessionId);
        String status=live.get("status").toString(),roomId=live.get("room_id").toString();
        if(status.equals("ENDED"))throw new ResponseStatusException(HttpStatus.CONFLICT,"这场直播已经结束");
        String user=(String)session.getAttribute("userId"); boolean host="host".equals(role);
        if(host) {
            if(user==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"请先登录"); db.requireOwner(roomId,user);
            String previous=Objects.toString(live.get("host_identity"),"");
            if(!previous.isBlank()) {
                var issued=db.maybe("SELECT created_at FROM media_connections WHERE identity=? AND session_id=?",previous,sessionId);
                if(issued!=null && Db.now()-((Number)issued.get("created_at")).longValue()<10000)
                    throw new ResponseStatusException(HttpStatus.CONFLICT,"主播端正在连接，请稍后重试");
                try {
                    var response=client.getParticipant(sessionId,previous).execute();
                    if(response.isSuccessful() && response.body()!=null)throw new ResponseStatusException(HttpStatus.CONFLICT,"直播正在其他页面进行，请先关闭原页面");
                    if(!response.isSuccessful() && response.code()!=404)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"直播连接暂不可用，请稍后重试");
                } catch(ResponseStatusException e){throw e;} catch(Exception e){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"直播连接暂不可用，请稍后重试");}
            }
        }
        else if(status.equals("PREPARING"))throw new ResponseStatusException(HttpStatus.CONFLICT,"主播正在准备，请稍后再试");
        Object guest=session.getAttribute("viewerKey"); if(guest==null){guest=Db.id();session.setAttribute("viewerKey",guest);}
        String identity=(host?"host-":"viewer-")+Db.id();
        String viewerKey=user==null?"guest-"+guest:"user-"+user;
        String name=user==null?"游客":db.user(user).get("nickname").toString();
        db.jdbc.update("INSERT INTO media_connections(identity,session_id,viewer_key,user_id,role,created_at) VALUES(?,?,?,?,?,?)",identity,sessionId,viewerKey,user,host?"HOST":"VIEWER",Db.now());
        if(host)db.jdbc.update("UPDATE live_sessions SET host_identity=? WHERE id=?",identity,sessionId);
        AccessToken token=new AccessToken(key,secret);token.setIdentity(identity);token.setName(name);token.setTtl(600000L);
        token.addGrants(new RoomJoin(true),new RoomName(sessionId),new CanPublish(host),new CanSubscribe(true),new CanPublishData(false));
        return Map.of("url",url,"token",token.toJwt(),"identity",identity);
    }
    public void activate(String sessionId,String user) {
        Map<String,Object> live=db.one("SELECT * FROM live_sessions WHERE id=?",sessionId);db.requireOwner(live.get("room_id").toString(),user);
        if("ENDED".equals(live.get("status")))throw new ResponseStatusException(HttpStatus.CONFLICT,"这场直播已经结束");
        String identity=Objects.toString(live.get("host_identity"),"");
        try {
            var response=client.getParticipant(sessionId,identity).execute();
            if(!response.isSuccessful() || response.body()==null || response.body().getTracksCount()==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"媒体尚未成功发布，请检查摄像头和麦克风");
        } catch(ResponseStatusException e){throw e;} catch(Exception e){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"直播服务暂不可用，请稍后重试");}
        db.jdbc.update("UPDATE live_sessions SET status='LIVE',last_host_seen_at=? WHERE id=? AND status<>'ENDED'",Db.now(),sessionId);
        broadcaster.broadcast(live.get("room_id").toString(),Map.of("type","SESSION_STATE","sessionId",sessionId,"status","LIVE"));
    }
    public Map<String,Object> end(String sessionId,String user) {
        Map<String,Object> live=db.one("SELECT * FROM live_sessions WHERE id=?",sessionId);db.requireOwner(live.get("room_id").toString(),user);
        db.jdbc.update("UPDATE live_sessions SET status='ENDED',ended_at=?,viewer_count=0 WHERE id=? AND status<>'ENDED'",Db.now(),sessionId);
        db.jdbc.update("UPDATE polls SET status='CLOSED' WHERE session_id=? AND status='OPEN'",sessionId);
        db.jdbc.update("UPDATE mic_requests SET status='ENDED' WHERE session_id=? AND status IN ('PENDING','APPROVED')",sessionId);
        boolean mediaClosed=true;try{var response=client.deleteRoom(sessionId).execute();mediaClosed=response.isSuccessful() || response.code()==404;}catch(Exception e){mediaClosed=false;}
        broadcaster.broadcast(live.get("room_id").toString(),Map.of("type","SESSION_STATE","sessionId",sessionId,"status","ENDED"));
        return Map.of("status","ENDED","mediaClosed",mediaClosed);
    }
    public void setPublish(String sessionId,String identity,boolean publish) {
        try {
            var permission=LivekitModels.ParticipantPermission.newBuilder().setCanSubscribe(true).setCanPublish(publish).setCanPublishData(false).build();
            var response=client.updateParticipant(sessionId,identity,null,null,permission).execute();
            if(!response.isSuccessful() && (publish || response.code()!=404)) throw new IllegalStateException("媒体服务拒绝更新权限");
        }catch(Exception e){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"连麦权限更新失败，请稍后重试");}
    }
    @Scheduled(fixedDelay=8000,initialDelay=8000)
    public void refreshViewers() {
        for(Map<String,Object> live:db.jdbc.queryForList("SELECT id FROM live_sessions WHERE status IN ('LIVE','RECONNECTING')")) reconcile(live.get("id").toString());
    }
    public void reconcile(String id) {
        Map<String,Object> live=db.maybe("SELECT s.id,s.room_id,s.status,s.host_identity,s.last_host_seen_at,r.owner_id FROM live_sessions s JOIN rooms r ON r.id=s.room_id WHERE s.id=? AND s.status IN ('LIVE','RECONNECTING')",id);
        if(live==null)return;
        try {
            var response=client.listParticipants(id).execute();
            if(!response.isSuccessful() && response.code()!=404)return;
            var participants=response.body()==null?List.<LivekitModels.ParticipantInfo>of():response.body();
            Set<String> keys=new HashSet<>(), present=new HashSet<>();boolean host=false;
            for(var participant:participants) {
                present.add(participant.getIdentity());
                if(participant.getState()!=LivekitModels.ParticipantInfo.State.ACTIVE)continue;
                if(participant.getIdentity().equals(live.get("host_identity"))){host=true;continue;}
                var record=db.maybe("SELECT viewer_key FROM media_connections WHERE session_id=? AND identity=? AND role='VIEWER'",id,participant.getIdentity());
                if(record!=null && !("user-"+live.get("owner_id")).equals(record.get("viewer_key")))keys.add(record.get("viewer_key").toString());
            }
            synchronized(locks.mic(id)) {
                boolean requestsChanged=false;
                for(var request:db.jdbc.queryForList("SELECT id,identity FROM mic_requests WHERE session_id=? AND status IN ('PENDING','APPROVED') AND created_at<?",id,Db.now()-10000)) {
                    if(!present.contains(request.get("identity").toString())) {
                        int ended=db.jdbc.update("UPDATE mic_requests SET status='ENDED' WHERE id=? AND status IN ('PENDING','APPROVED')",request.get("id"));
                        if(ended>0){requestsChanged=true;broadcaster.broadcast(live.get("room_id").toString(),Map.of("type","MIC_ENDED","sessionId",id,"identity",request.get("identity")));}
                    }
                }
                if(requestsChanged)broadcaster.broadcast(live.get("room_id").toString(),Map.of("type","INTERACTION_CHANGED","sessionId",id));
            }
            long now=Db.now(); Object seen=live.get("last_host_seen_at");
            if(!host && seen instanceof Number previous && now-previous.longValue()>120000) {
                int changed=db.jdbc.update("UPDATE live_sessions SET status='ENDED',ended_at=?,viewer_count=0,viewer_count_updated_at=? WHERE id=? AND status IN ('LIVE','RECONNECTING')",now,now,id);
                if(changed>0){db.jdbc.update("UPDATE polls SET status='CLOSED' WHERE session_id=? AND status='OPEN'",id);db.jdbc.update("UPDATE mic_requests SET status='ENDED' WHERE session_id=? AND status IN ('PENDING','APPROVED')",id);try{client.deleteRoom(id).execute();}catch(Exception ignored){}broadcaster.broadcast(live.get("room_id").toString(),Map.of("type","SESSION_STATE","sessionId",id,"status","ENDED"));}
                return;
            }
            String state=host?"LIVE":"RECONNECTING";
            int changed;
            if(host)changed=db.jdbc.update("UPDATE live_sessions SET viewer_count=?,viewer_count_updated_at=?,status=?,last_host_seen_at=? WHERE id=? AND status IN ('LIVE','RECONNECTING')",keys.size(),now,state,now,id);
            else changed=db.jdbc.update("UPDATE live_sessions SET viewer_count=?,viewer_count_updated_at=?,status=? WHERE id=? AND status IN ('LIVE','RECONNECTING')",keys.size(),now,state,id);
            if(changed>0)broadcaster.broadcast(live.get("room_id").toString(),Map.of("type","VIEWER_COUNT","sessionId",id,"count",keys.size(),"status",state));
        }catch(Exception ignored) { /* Keep the count timestamp unchanged so clients can show it as unknown. */ }
    }
}
