package com.tongpin.live;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class MeetingRateLimiterTest {
    @Test void joinAttemptsAreLimitedPerAccountAndExpire(){
        var time=new AtomicLong();var limits=new MeetingRateLimiter(time::get);
        for(int i=0;i<MeetingRateLimiter.JOIN_LIMIT;i++)limits.join("a");
        assertEquals(429,assertThrows(ResponseStatusException.class,()->limits.join("a")).getStatusCode().value());
        assertDoesNotThrow(()->limits.join("b"));
        time.addAndGet(MeetingRateLimiter.JOIN_WINDOW);
        assertDoesNotThrow(()->limits.join("a"));
    }
    @Test void chatLimitsAreScopedToUserAndMeeting(){
        var time=new AtomicLong();var limits=new MeetingRateLimiter(time::get);
        for(int i=0;i<MeetingRateLimiter.CHAT_LIMIT;i++)limits.chat("one","a");
        assertEquals(429,assertThrows(ResponseStatusException.class,()->limits.chat("one","a")).getStatusCode().value());
        assertDoesNotThrow(()->limits.chat("one","b"));
        assertDoesNotThrow(()->limits.chat("two","a"));
        time.addAndGet(MeetingRateLimiter.CHAT_WINDOW);
        assertDoesNotThrow(()->limits.chat("one","a"));
    }
    @Test void concurrentAttemptsCannotExceedTheLimit() throws Exception {
        var limits=new MeetingRateLimiter(()->0);var accepted=new AtomicInteger();
        ExecutorService executor=Executors.newFixedThreadPool(8);
        try{
            var futures=new java.util.ArrayList<Future<?>>();
            for(int i=0;i<100;i++)futures.add(executor.submit(()->{try{limits.join("same-user");accepted.incrementAndGet();}catch(ResponseStatusException ignored){}}));
            for(var future:futures)future.get(5,TimeUnit.SECONDS);
            assertEquals(MeetingRateLimiter.JOIN_LIMIT,accepted.get());
        }finally{executor.shutdownNow();}
    }
}
