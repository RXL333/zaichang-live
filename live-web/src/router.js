import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import MeetingHomeView from './views/MeetingHomeView.vue'
const MeetingJoinView = () => import('./views/MeetingJoinView.vue')
const MeetingRoomView = () => import('./views/MeetingRoomView.vue')

export default createRouter({
  history: import.meta.env.VITE_HASH_ROUTER === 'true' ? createWebHashHistory(import.meta.env.BASE_URL) : createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: MeetingHomeView },
    { path: '/join/:number', component: MeetingJoinView },
    { path: '/meeting/:number', component: MeetingRoomView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
