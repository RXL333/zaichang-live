package com.tongpin.live;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Small in-memory guard for the current single-instance deployment. */
@Component
public class MeetingRateLimiter {
    static final int JOIN_LIMIT=12, CHAT_LIMIT=20;
    static final long JOIN_WINDOW=TimeUnit.MINUTES.toNanos(1), CHAT_WINDOW=TimeUnit.SECONDS.toNanos(10);
    private static final int MAX_BUCKETS=4096;
    private final Map<String,Bucket> buckets=new HashMap<>();
    private final LongSupplier clock;
    private long lastCleanup;
    private static class Bucket {
        final ArrayDeque<Long> events=new ArrayDeque<>();
        final long window;
        long lastSeen;
        Bucket(long window,long now){this.window=window;this.lastSeen=now;}
    }
    public MeetingRateLimiter(){this(System::nanoTime);}
    MeetingRateLimiter(LongSupplier clock){this.clock=clock;}

    public void join(String uid){acquire("join:"+uid,JOIN_LIMIT,JOIN_WINDOW,"入会尝试过于频繁，请稍后再试");}
    public void chat(String meetingId,String uid){acquire("chat:"+meetingId+":"+uid,CHAT_LIMIT,CHAT_WINDOW,"发送消息过于频繁，请稍后再试");}

    private synchronized void acquire(String key,int limit,long window,String message){
        long now=clock.getAsLong();
        if(now-lastCleanup>=TimeUnit.MINUTES.toNanos(1) || buckets.size()>=MAX_BUCKETS){
            buckets.values().removeIf(bucket->now-bucket.lastSeen>=bucket.window);
            lastCleanup=now;
        }
        Bucket bucket=buckets.get(key);
        if(bucket==null){
            if(buckets.size()>=MAX_BUCKETS)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"请求过于频繁，请稍后再试");
            bucket=new Bucket(window,now);buckets.put(key,bucket);
        }
        while(!bucket.events.isEmpty() && now-bucket.events.peekFirst()>=window)bucket.events.removeFirst();
        if(bucket.events.size()>=limit)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,message);
        bucket.events.addLast(now);bucket.lastSeen=now;
    }
}
