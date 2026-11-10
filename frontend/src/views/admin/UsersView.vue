<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppTag from '@/components/AppTag.vue'
import { listUsers } from '@/api/admin'
import { errorMessage } from '@/api/http'
import { fmtPoints } from '@/utils/format'
import type { User } from '@/types'

const list = ref<User[]>([])
const loading = ref(true)
const err = ref('')

async function load() {
  loading.value = true
  err.value = ''
  try {
    const page = await listUsers({ page: 1, size: 50 })
    list.value = page.items
  } catch (e) {
    err.value = errorMessage(e, '用户加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="admin-top">
      <div>
        <p class="crumb">管理端 / <b>用户管理</b></p>
        <h1>用户管理</h1>
        <p>启用/停用属于 P1，演示版只读展示</p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="load">刷新</button>
    </div>

    <div v-if="loading" class="card"><div v-for="i in 4" :key="i" class="skel skel-row"></div></div>
    <div v-else-if="err" class="card" style="text-align: center">
      <p style="color: #be123c">{{ err }}</p>
      <button class="btn btn-secondary btn-sm" style="margin-top: 12px" @click="load">重试</button>
    </div>

    <template v-else>
      <div class="stat-grid" style="margin-bottom: 16px">
        <div class="card">
          <div class="hint">用户总数</div>
          <div class="num" style="font-size: 26px; font-weight: 700">{{ list.length }}</div>
        </div>
        <div class="card">
          <div class="hint">普通用户</div>
          <div class="num" style="font-size: 26px; font-weight: 700">{{ list.filter((u) => u.role === 'USER').length }}</div>
        </div>
        <div class="card">
          <div class="hint">管理员</div>
          <div class="num" style="font-size: 26px; font-weight: 700">{{ list.filter((u) => u.role === 'ADMIN').length }}</div>
        </div>
        <div class="card">
          <div class="hint">积分余额合计</div>
          <div class="num" style="font-size: 26px; font-weight: 700">
            {{ fmtPoints(list.reduce((s, u) => s + u.points, 0)) }}
          </div>
        </div>
      </div>

      <AppCard tight>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>用户编号</th>
                <th>昵称</th>
                <th>手机号</th>
                <th class="r">积分余额</th>
                <th>角色</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in list" :key="u.id">
                <td class="mono">{{ u.id }}</td>
                <td class="t-strong">{{ u.avatarText }} {{ u.nickname }}</td>
                <td class="num">{{ u.phone }}</td>
                <td class="r num">{{ fmtPoints(u.points) }}</td>
                <td>
                  <AppTag :tone="u.role === 'ADMIN' ? 'amber' : 'gray'">{{ u.role === 'ADMIN' ? '管理员' : '普通用户' }}</AppTag>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </AppCard>
    </template>
  </div>
</template>
