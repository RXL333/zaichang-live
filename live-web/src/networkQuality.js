import { Track, VideoQuality } from 'livekit-client'

export function connectionQualityLabel(quality) {
  return ({ excellent:'好', good:'一般', poor:'差', lost:'差' })[quality] || '未知'
}

export function adjustVideoQuality(room, poor) {
  let adjusted=false
  for (const participant of room?.remoteParticipants?.values() || []) {
    for (const publication of participant.trackPublications.values()) {
      if (publication.kind!==Track.Kind.Video || !publication.track || typeof publication.setVideoQuality!=='function') continue
      try { publication.setVideoQuality(poor ? VideoQuality.LOW : VideoQuality.HIGH); adjusted=true } catch { /* Keep other tracks usable. */ }
    }
  }
  return adjusted
}
