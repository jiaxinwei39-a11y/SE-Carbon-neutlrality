<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useToast } from '@/composables/useToast'

/**
 * 用户端外壳
 * 原型里每个页面都复制了一份顶栏，这里收敛成一个 layout —— 这是迁到框架后
 * 最直接的收益：改导航只改一处。
 */
const router = useRouter()
const route = useRoute()
const store = useUserStore()
const { toast } = useToast()

const menuOpen = ref(false)
const avatarText = computed(() => store.user?.avatarText ?? store.nickname.slice(0, 1))

const navs = [
  { name: 'home', label: '上报行程', to: '/app' },
  { name: 'trips', label: '我的行程', to: '/app/trips' },
  { name: 'points', label: '积分账户', to: '/app/points' },
  { name: 'mall', label: '积分商城', to: '/app/mall' },
  { name: 'orders', label: '我的订单', to: '/app/orders' },
]

/** 首页用精确匹配，其余用前缀匹配，避免"上报行程"在子页面也高亮 */
function isActive(to: string): boolean {
  const path = route.path
  return to === '/app' ? path === '/app' : path.startsWith(to)
}

async function onLogout() {
  menuOpen.value = false
  await store.logout()
  toast('已退出登录')
  router.replace({ name: 'login' })
}
</script>

<template>
  <div>
    <header class="topbar">
      <div class="topbar-in">
        <router-link to="/app" class="brand" aria-label="返回首页">
          <span class="mark" aria-hidden="true">🌿</span>
          绿色出行 · 碳积分
        </router-link>

        <nav class="nav" aria-label="主导航">
          <router-link v-for="n in navs" :key="n.name" :to="n.to" :class="{ on: isActive(n.to) }">{{ n.label }}</router-link>
        </nav>

        <div class="right">
          <router-link v-if="store.isAdmin" to="/admin/dashboard" class="pill" style="text-decoration: none">
            管理端
          </router-link>

          <div class="dropdown">
            <button
              type="button"
              class="avatar"
              :aria-expanded="menuOpen"
              aria-haspopup="menu"
              :aria-label="`${store.nickname}，打开账户菜单`"
              @click="menuOpen = !menuOpen"
            >
              {{ avatarText }}
            </button>
            <div v-if="menuOpen" class="dropdown-menu" role="menu" @click="menuOpen = false">
              <div style="padding: 8px 12px 10px; font-size: 12px; color: #64748b">{{ store.nickname }}</div>
              <router-link to="/app/profile" custom v-slot="{ navigate }">
                <button role="menuitem" @click="navigate">个人资料</button>
              </router-link>
              <router-link to="/app/orders" custom v-slot="{ navigate }">
                <button role="menuitem" @click="navigate">我的订单</button>
              </router-link>
              <button role="menuitem" @click="onLogout">退出登录</button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main>
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </main>
  </div>
</template>
