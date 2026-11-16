import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import MeetingHomeView from './views/MeetingHomeView.vue'
import { loadMeetingJoin, loadMeetingRoom } from './meetingRoutes'

export default createRouter({
  history: import.meta.env.VITE_HASH_ROUTER === 'true' ? createWebHashHistory(import.meta.env.BASE_URL) : createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: MeetingHomeView },
    { path: '/join/:number', component: loadMeetingJoin },
    { path: '/meeting/:number', component: loadMeetingRoom },
    { path: '/ended/:number', component: () => import('./views/MeetingEndedView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
