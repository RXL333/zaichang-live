export const loadMeetingJoin = () => import('./views/MeetingJoinView.vue')
export const loadMeetingRoom = () => import('./views/MeetingRoomView.vue')

let pending
export function preloadMeeting() {
  if (!pending) pending=Promise.all([loadMeetingJoin(),loadMeetingRoom()]).catch(()=>{pending=null})
  return pending
}
