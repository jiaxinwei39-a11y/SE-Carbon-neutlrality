<script setup lang="ts">
import AppCard from '@/components/AppCard.vue'
import { useUserStore } from '@/stores/user'

/** 个人资料（P1）：演示版只读展示，编辑能力留给后端接入后 */
const store = useUserStore()
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>个人资料</h1>
        <p>账号信息由后端维护，演示版为只读</p>
      </div>
    </div>

    <AppCard>
      <div style="display: flex; align-items: center; gap: 18px; margin-bottom: 20px">
        <div
          style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(140deg, #34d399, #047857); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700"
        >
          {{ store.user?.avatarText ?? '?' }}
        </div>
        <div>
          <div style="font-size: 18px; font-weight: 600">{{ store.nickname }}</div>
          <div class="hint">{{ store.isAdmin ? '管理员账号' : '普通用户' }}</div>
        </div>
      </div>

      <div class="factor-grid" style="grid-template-columns: 1fr">
        <div class="factor-row"><span>用户 ID</span><b class="mono">{{ store.user?.id ?? '--' }}</b></div>
        <div class="factor-row"><span>手机号</span><b class="num">{{ store.user?.phone ?? '--' }}</b></div>
        <div class="factor-row"><span>角色</span><b>{{ store.isAdmin ? 'ADMIN' : 'USER' }}</b></div>
      </div>

      <p class="hint" style="margin-top: 16px">修改昵称、手机号等能力属于 P1 范围，需要后端提供 PUT /api/users/me。</p>
    </AppCard>
  </div>
</template>
