<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, RefreshCw, Radio, Sparkles, SearchX } from 'lucide-vue-next'
import { api } from '../api'
import { useUser } from '../stores/user'
import EmptyArt from '../components/EmptyArt.vue'
import RoomCard from '../components/RoomCard.vue'

const props = defineProps({ following: Boolean })
const route = useRoute(), router = useRouter(), user = useUser()
const categories = ['全部', '聊天', '游戏', '音乐', '学习', '生活', '其他']
const category = ref('全部'), rooms = ref([]), state = ref('loading'), error = ref('')
const liveRooms = computed(() => rooms.value.filter(r => r.status === 'LIVE' || r.status === 'RECONNECTING'))
const otherRooms = computed(() => rooms.value.filter(r => r.status !== 'LIVE' && r.status !== 'RECONNECTING'))
const query = computed(() => String(route.query.q || ''))
async function load() {
  state.value = 'loading'; error.value = ''
  try {
    const params = new URLSearchParams()
    if (category.value !== '全部') params.set('category', category.value)
    if (query.value) params.set('q', query.value)
    if (props.following) params.set('following', 'true')
    rooms.value = await api(`/api/rooms?${params}`); state.value = 'ready'
  } catch (e) { error.value = e.message; state.value = 'error' }
}
function studio() { if (user.require()) router.push('/studio') }
onMounted(load)
watch([category, query, () => user.current?.id], load)
</script>
<template>
  <div class="home-page">
    <section v-if="!following" class="hero">
      <div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> LIVE STREAMING <span class="eyebrow-line"></span> 实时直播</div><h1>精彩内容，<br /><em>值得在场。</em></h1><p>发现正在直播的内容，<br />与创作者实时交流。</p><div class="hero-actions"><button class="button button-primary" @click="studio">开始直播 <ArrowRight :size="18" /></button><a class="hero-link" href="#discover">发现直播 <span>↘</span></a></div><div class="hero-foot"><span>✳</span> 分享观点，连接彼此。</div></div>
      <div class="hero-visual"><div class="hero-stamp">GO<br /><strong>LIVE</strong><span>✳</span></div><EmptyArt /><div class="floating-note"><span>✦</span><div><strong>每一次分享，都值得在场</strong><small>LIVE · CONNECT · SHARE</small></div></div><div class="hero-squiggle">✦</div></div>
      <div class="hero-index">01 / GOOD TO SEE YOU</div>
    </section>
    <section id="discover" class="discover-section">
      <div class="section-heading"><div><div class="section-kicker">{{ following ? 'FOLLOWING' : 'LIVE CHANNELS' }} <span>✳</span></div><h2>{{ following ? '我的关注' : '发现直播' }}<span class="heading-period">.</span></h2><p>{{ following ? '关注主播，及时了解最新直播。' : '浏览直播内容，找到感兴趣的频道。' }}</p></div><div class="section-side"><span>EXPLORE LIVE</span><span class="section-side-icon">↗</span></div></div>
      <div class="category-row" aria-label="直播分类"><button v-for="item in categories" :key="item" :class="{ active: category === item }" @click="category = item">{{ item }}</button><span class="category-spacer"></span><span class="result-label">{{ state === 'ready' ? `${rooms.length} 个直播间` : '正在寻找好内容' }}</span></div>
      <div v-if="state === 'loading'" class="loading-state"><span class="loader"></span> 正在加载直播间…</div>
      <div v-else-if="state === 'error'" class="empty-state compact"><div class="empty-icon"><RefreshCw :size="25" /></div><h3>暂时没连上</h3><p>{{ error }}</p><button class="button button-dark" @click="load">再试一次</button><button v-if="following && !user.current" class="text-link" @click="user.authOpen = true">登录后查看关注</button></div>
      <template v-else>
        <div v-if="liveRooms.length" class="room-grid"><RoomCard v-for="room in liveRooms" :key="room.id" :room="room" /></div>
        <div v-else class="empty-state"><div class="empty-icon"><SearchX v-if="query || category !== '全部'" :size="26" /><Radio v-else :size="26" /></div><div><span class="empty-kicker">NO LIVE CHANNELS</span><h3>{{ query || category !== '全部' ? '没有找到相关直播' : following ? '还没有关注的直播' : '现在还没有人在直播' }}</h3><p>{{ query || category !== '全部' ? '请尝试其他关键词或分类。' : following ? '在发现页面关注感兴趣的主播。' : '目前没有正在直播的频道，你也可以创建直播间。' }}</p><button v-if="!following && !query && category === '全部'" class="button button-dark" @click="studio">创建直播间 <ArrowRight :size="16" /></button><RouterLink v-else-if="following" class="button button-dark" to="/">去发现直播 <ArrowRight :size="16" /></RouterLink><button v-else class="text-link" @click="category = '全部'; router.push('/')">清除筛选</button></div><span class="empty-decoration">✳</span></div>
        <template v-if="otherRooms.length"><div class="subsection-heading"><div><Sparkles :size="17" /> 值得关注的直播间</div><span>关注后了解开播动态</span></div><div class="room-grid"><RoomCard v-for="room in otherRooms" :key="room.id" :room="room" /></div></template>
      </template>
    </section>
    <footer class="page-footer"><span>✳&nbsp; 在场 LIVE</span><span>分享正在发生的事。</span><span>LIVE IN THE MOMENT ↗</span></footer>
  </div>
</template>
