import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
const RoomView = () => import('./views/RoomView.vue')
const StudioView = () => import('./views/StudioView.vue')

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/following', component: HomeView, props: { following: true } },
    { path: '/room/:id', component: RoomView },
    { path: '/studio/:id?', component: StudioView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
