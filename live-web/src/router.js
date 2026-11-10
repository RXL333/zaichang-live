import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
const RoomView = () => import('./views/RoomView.vue')
const StudioView = () => import('./views/StudioView.vue')

export default createRouter({
  history: import.meta.env.VITE_HASH_ROUTER === 'true' ? createWebHashHistory(import.meta.env.BASE_URL) : createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: HomeView },
    { path: '/following', component: HomeView, props: { following: true } },
    { path: '/room/:id', component: RoomView },
    { path: '/studio/:id?', component: StudioView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
