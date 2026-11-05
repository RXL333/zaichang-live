<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Video, Compass, Heart, Radio, ArrowUpRight, Menu, X, LogOut } from 'lucide-vue-next'
import { useUser } from './stores/user'
import AccountDialog from './components/AccountDialog.vue'
import LogoMark from './components/LogoMark.vue'

const user = useUser(), router = useRouter(), route = useRoute(), query = ref(''), mobileMenu = ref(false)
onMounted(() => user.load())
function search() { router.push({ path: '/', query: query.value.trim() ? { q: query.value.trim() } : {} }); mobileMenu.value = false }
function studio() { if (user.require()) router.push('/studio') }
async function logout() { await user.logout(); router.push('/') }
</script>
<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink to="/" class="brand" aria-label="在场直播首页"><LogoMark /><span>在场<span class="brand-live"> LIVE</span></span></RouterLink>
      <nav class="top-nav" aria-label="主导航"><RouterLink to="/" :class="{ selected: route.path === '/' }">发现</RouterLink><RouterLink to="/following">我的关注</RouterLink></nav>
      <form class="search-box" role="search" @submit.prevent="search"><Search :size="18" /><input v-model="query" aria-label="搜索直播间" placeholder="搜索你感兴趣的" /><button aria-label="搜索" type="submit"><span>搜索</span></button></form>
      <div class="header-actions"><button class="button button-dark go-live" @click="studio"><Video :size="17" /> 我要开播</button><button v-if="!user.current" class="button button-outline login-button" @click="user.authOpen = true">登录 / 注册</button><div v-else class="user-menu"><button class="user-trigger"><span class="avatar tiny">{{ user.current.nickname?.slice(0, 1) }}</span><span>{{ user.current.nickname }}</span></button><div class="user-dropdown"><button @click="studio"><Radio :size="16" /> 主播工作台</button><button @click="logout"><LogOut :size="16" /> 退出登录</button></div></div></div>
      <button class="icon-button mobile-menu-button" :aria-label="mobileMenu ? '关闭菜单' : '打开菜单'" @click="mobileMenu = !mobileMenu"><X v-if="mobileMenu" :size="22" /><Menu v-else :size="22" /></button>
    </header>
    <div v-if="mobileMenu" class="mobile-menu"><RouterLink to="/" @click="mobileMenu = false">发现直播</RouterLink><RouterLink to="/following" @click="mobileMenu = false">我的关注</RouterLink><button @click="studio(); mobileMenu = false">我要开播</button><button v-if="!user.current" @click="user.authOpen = true; mobileMenu = false">登录 / 注册</button><button v-else @click="logout(); mobileMenu = false">退出登录</button></div>
    <div class="main-layout">
      <aside class="sidebar" aria-label="侧边导航"><div class="sidebar-group"><span class="sidebar-label">EXPLORE / 探索</span><RouterLink to="/" class="side-link" :class="{ active: route.path === '/' }"><Compass :size="19" /> 发现直播 <ArrowUpRight :size="14" class="side-arrow" /></RouterLink><RouterLink to="/following" class="side-link"><Heart :size="19" /> 我的关注</RouterLink><button class="side-link" @click="studio"><Radio :size="19" /> 主播中心</button></div><div class="sidebar-note"><span class="sidebar-note-star">✳</span><strong>分享观点，<br />连接彼此。</strong><span>LIVE STREAMING<br />CONNECT &amp; SHARE.</span></div><div class="sidebar-footer">© ZAICHANG LIVE<br /><span>LIVE IN THE MOMENT.</span></div></aside>
      <main class="page-content"><RouterView :key="route.fullPath" /></main>
    </div>
    <AccountDialog />
  </div>
</template>
