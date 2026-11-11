package com.tongpin.live;

import io.livekit.server.*;
import java.util.*;
import livekit.LivekitIngress;
import livekit.LivekitModels;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MeetingMediaService {
    private final Db db;
    private final String url,key,secret;
    private final RoomServiceClient rooms;
    private final IngressServiceClient ingress;
    public MeetingMediaService(Db db,@Value("${livekit.url}") String url,@Value("${livekit.api-key}") String key,@Value("${livekit.api-secret}") String secret) {
        this.db=db;this.url=url;this.key=key;this.secret=secret;
        String api=url.replaceFirst("^wss://","https://").replaceFirst("^ws://","http://");
        this.rooms=RoomServiceClient.createClient(api,key,secret);this.ingress=IngressServiceClient.createClient(api,key,secret);
    }
    static String room(String meetingId){return "meeting-"+meetingId;}
    static boolean belongs(String identity,String uid){return identity.startsWith("user."+uid+".") || identity.startsWith("obs."+uid+".");}
    private ResponseStatusException unavailable(){return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"音视频服务暂不可用，请稍后重试");}
    public Map<String,Object> token(Map<String,Object> meeting,Map<String,Object> member,String uid){
        String id=meeting.get("id").toString(), identity="user."+uid+"."+Db.id();
        AccessToken token=new AccessToken(key,secret); token.setIdentity(identity);token.setName(member.get("nickname").toString());
        token.setMetadata("{\"userId\":\""+uid+"\",\"source\":\"browser\"}");token.setTtl(300000L);
        token.addGrants(new RoomJoin(true),new RoomName(room(id)),new CanPublish(true),new CanSubscribe(true),new CanPublishData(false));
        db.jdbc.update("INSERT INTO meeting_media_grants(identity,meeting_id,user_id,created_at) VALUES(?,?,?,?)",identity,id,uid,Db.now());
        return Map.of("url",url,"token",token.toJwt(),"identity",identity);
    }
    public Map<String,Object> createObs(Map<String,Object> meeting,Map<String,Object> member,String uid){
        String id=meeting.get("id").toString();
        deleteObs(id,uid);
        String identity="obs."+uid+"."+Db.id();
        try {
            var response=ingress.createIngress("OBS "+id+" "+uid,room(id),identity,member.get("nickname").toString(),LivekitIngress.IngressInput.WHIP_INPUT).execute();
            if(!response.isSuccessful() || response.body()==null || response.body().getUrl().isBlank() || response.body().getStreamKey().isBlank()) throw unavailable();
            var info=response.body();
            try {db.jdbc.update("INSERT INTO meeting_ingresses(meeting_id,user_id,ingress_id,identity,created_at) VALUES(?,?,?,?,?)",id,uid,info.getIngressId(),identity,Db.now());}
            catch(Exception error){try{ingress.deleteIngress(info.getIngressId()).execute();}catch(Exception ignored){} throw error;}
            return Map.of("url",info.getUrl(),"streamKey",info.getStreamKey(),"protocol","WHIP");
        }catch(ResponseStatusException e){throw e;}catch(Exception e){throw unavailable();}
    }
    public void deleteObs(String id,String uid){
        var row=db.maybe("SELECT ingress_id FROM meeting_ingresses WHERE meeting_id=? AND user_id=?",id,uid);if(row==null)return;
        try {
            var response=ingress.deleteIngress(row.get("ingress_id").toString()).execute();
            if(!response.isSuccessful() && response.code()!=404)throw unavailable();
            db.jdbc.update("DELETE FROM meeting_ingresses WHERE meeting_id=? AND user_id=?",id,uid);
        }catch(ResponseStatusException e){throw e;}catch(Exception e){throw unavailable();}
    }
    private List<LivekitModels.ParticipantInfo> participants(String id){
        try {
            var response=rooms.listParticipants(room(id)).execute();
            if(response.code()==404)return List.of();
            if(!response.isSuccessful() || response.body()==null)throw unavailable();
            return response.body();
        }catch(ResponseStatusException e){throw e;}catch(Exception e){throw unavailable();}
    }
    public int mute(String id,String uid){
        int muted=0;
        try {
            for(var participant:participants(id)) if(belongs(participant.getIdentity(),uid)) {
                for(var track:participant.getTracksList()) {
                    boolean isMic=track.getType()==LivekitModels.TrackType.AUDIO && (participant.getIdentity().startsWith("obs.") || track.getSource()==LivekitModels.TrackSource.MICROPHONE);
                    if(isMic && !track.getMuted()) {
                        var response=rooms.mutePublishedTrack(room(id),participant.getIdentity(),track.getSid(),true).execute();
                        if(!response.isSuccessful())throw unavailable(); muted++;
                    }
                }
            }
            return muted;
        }catch(ResponseStatusException e){throw e;}catch(Exception e){throw unavailable();}
    }
    public void removeMember(String id,String uid){
        boolean failed=false;
        try {deleteObs(id,uid);} catch(Exception error){failed=true;}
        Set<String> identities=new LinkedHashSet<>();
        for(var row:db.jdbc.queryForList("SELECT identity FROM meeting_media_grants WHERE meeting_id=? AND user_id=?",id,uid))identities.add(row.get("identity").toString());
        try {
            for(var participant:participants(id))if(belongs(participant.getIdentity(),uid))identities.add(participant.getIdentity());
        }catch(Exception error){failed=true;}
        for(String identity:identities){
            try {
                var response=rooms.removeParticipant(room(id),identity,System.currentTimeMillis()/1000+1).execute();
                if(!response.isSuccessful() && response.code()!=404)failed=true;
            }catch(Exception error){failed=true;}
        }
        if(failed)throw unavailable();
    }
    public void close(String id){
        for(var row:db.jdbc.queryForList("SELECT user_id FROM meeting_ingresses WHERE meeting_id=?",id))deleteObs(id,row.get("user_id").toString());
        for(var row:db.jdbc.queryForList("SELECT DISTINCT user_id FROM meeting_media_grants WHERE meeting_id=?",id))removeMember(id,row.get("user_id").toString());
        try {var response=rooms.deleteRoom(room(id)).execute();if(!response.isSuccessful() && response.code()!=404)throw unavailable();}
        catch(ResponseStatusException e){throw e;}catch(Exception e){throw unavailable();}
    }
}
