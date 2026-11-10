<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppTag from '@/components/AppTag.vue'
import AppSelect from '@/components/AppSelect.vue'
import { listAdminProducts } from '@/api/admin'
import { errorMessage } from '@/api/http'
import { fmtPoints } from '@/utils/format'
import type { Product } from '@/types'

const list = ref<Product[]>([])
const loading = ref(true)
const err = ref('')
const status = ref<'ALL' | 'ON' | 'OFF'>('ALL')

const statusOptions = [
  { value: 'ALL', label: '全部状态' },
  { value: 'ON', label: '上架中' },
  { value: 'OFF', label: '已下架' }
]

async function load() {
  loading.value = true
  err.value = ''
  try {
    const page = await listAdminProducts({ page: 1, size: 50 })
    list.value = status.value === 'ALL' ? page.items : page.items.filter((p) => p.status === status.value)
  } catch (e) {
    err.value = errorMessage(e, '商品加载失败')
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
        <p class="crumb">管理端 / <b>商品管理</b></p>
        <h1>商品管理</h1>
        <p>演示版只读：新增/编辑/上下架属于 P1，需要后端提供写接口</p>
      </div>
      <div style="width: 160px">
        <AppSelect v-model="status" :options="statusOptions" @update:model-value="load" />
      </div>
    </div>

    <div class="notice">
      商品变更需要留痕（谁改的、改了什么、为什么），否则用户看到的价格和库存对不上账。
    </div>

    <div v-if="loading" class="card"><div v-for="i in 5" :key="i" class="skel skel-row"></div></div>
    <div v-else-if="err" class="card" style="text-align: center">
      <p style="color: #be123c">{{ err }}</p>
      <button class="btn btn-secondary btn-sm" style="margin-top: 12px" @click="load">重试</button>
    </div>

    <AppCard v-else tight>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>商品编号</th>
              <th>商品名称</th>
              <th class="r">所需积分</th>
              <th class="r">库存</th>
              <th>状态</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in list" :key="p.productId">
              <td class="mono">{{ p.productId }}</td>
              <td class="t-strong">{{ p.icon }} {{ p.name }}</td>
              <td class="r num">{{ fmtPoints(p.points) }}</td>
              <td class="r num">{{ p.stock }}</td>
              <td>
                <AppTag :tone="p.status === 'ON' ? 'green' : 'gray'">{{ p.status === 'ON' ? '上架中' : '已下架' }}</AppTag>
              </td>
              <td class="hint">{{ p.stock === 0 ? '库存不足，用户端置灰' : p.desc || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppCard>
  </div>
</template>
