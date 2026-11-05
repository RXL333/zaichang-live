package com.tongpin.live;

import java.util.stream.IntStream;
import org.springframework.stereotype.Component;

@Component
public class SessionLocks {
    private final Object[] micLocks=IntStream.range(0,128).mapToObj(i -> new Object()).toArray();
    Object mic(String sessionId) { return micLocks[Math.floorMod(sessionId.hashCode(),micLocks.length)]; }
}
