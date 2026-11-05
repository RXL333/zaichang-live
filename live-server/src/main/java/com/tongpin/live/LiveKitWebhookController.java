package com.tongpin.live;

import io.livekit.server.WebhookReceiver;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class LiveKitWebhookController {
    private final WebhookReceiver receiver; private final MediaService media;
    public LiveKitWebhookController(MediaService media,@Value("${livekit.api-key}")String key,@Value("${livekit.api-secret}")String secret){this.media=media;this.receiver=new WebhookReceiver(key,secret);}
    @PostMapping("/api/livekit/webhook")
    public void receive(@RequestBody String body,@RequestHeader(value="Authorization",required=false) String authorization){
        try {var event=receiver.receive(body,authorization);if(event.hasRoom())media.reconcile(event.getRoom().getName());}
        catch(Exception error){throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"无效的媒体服务通知");}
    }
}
