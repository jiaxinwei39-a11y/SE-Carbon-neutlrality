<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const store = useUserStore()

const groups = [
  {
    title: '运营',
    items: [
      { to: '/admin/dashboard', label: '数据概览', icon: '📊' },
      { to: '/admin/reconciliation', label: '积分对账', icon: '⚖️' },
    ],
  },
  {
    title: '配置',
    items: [
      { to: '/admin/rules', label: '核算规则', icon: '📐' },
      { to: '/admin/products', label: '商品管理', icon: '🎁' },
      { to: '/admin/orders', label: '订单管理', icon: '📦' },
      { to: '/admin/users', label: '用户管理', icon: '👥' },
    ],
  },
]

const isActive = (to: string) => route.path === to
const adminName = computed(() => store.user?.nickname ?? '管理员')

async function onLogout() {
  await store.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="admin">
    <aside class="sidebar">
      <div class="brand">
        <span class="mark" aria-hidden="true">🌿</span>
        碳积分 · 管理端
      </div>

      <nav aria-label="管理端导航">
        <template v-for="g in groups" :key="g.title">
          <div class="group">{{ g.title }}</div>
          <router-link v-for="it in g.items" :key="it.to" :to="it.to" :class="{ on: isActive(it.to) }">
            <span aria-hidden="true">{{ it.icon }}</span>{{ it.label }}
          </router-link>
        </template>
      </nav>

      <div class="foot">
        <span>{{ adminName }}</span>
      </div>
    </aside>

    <div class="admin-main">
      <router-view />
      <div style="margin-top: 28px; display: flex; gap: 16px; font-size: 12.5px">
        <router-link to="/app" style="color: #64748b">← 返回用户端</router-link>
        <button
          type="button"
          style="border: 0; background: transparent; color: #64748b; cursor: pointer; padding: 0"
          @click="onLogout"
        >
          退出登录
        </button>
      </div>
    </div>
  </div>
</template>
