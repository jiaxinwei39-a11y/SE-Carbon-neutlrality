<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppTag from '@/components/AppTag.vue'
import AppDrawer from '@/components/AppDrawer.vue'
import { listAdminOrders } from '@/api/admin'
import { getOrder } from '@/api/orders'
import { errorMessage } from '@/api/http'
import { fmtDateTime, fmtPoints } from '@/utils/format'
import { ORDER_STATUS_META } from '@/utils/constants'
import type { Order } from '@/types'

const list = ref<Order[]>([])
const loading = ref(true)
const err = ref('')
const filter = ref<'ALL' | 'CREATED' | 'FULFILLED' | 'CANCELLED'>('ALL')

const tabs: { key: typeof filter.value; label: string }[] = [
  { key: 'ALL', label: '全部' },
  { key: 'CREATED', label: '待履约' },
  { key: 'FULFILLED', label: '已完成' },
  { key: 'CANCELLED', label: '已取消' }
]

const open = ref(false)
const detail = ref<Order | null>(null)
const detailLoading = ref(false)
const detailErr = ref('')

async function load() {
  loading.value = true
  err.value = ''
  try {
    const page = await listAdminOrders({ page: 1, size: 50 })
    list.value = filter.value === 'ALL' ? page.items : page.items.filter((o) => o.status === filter.value)
  } catch (e) {
    err.value = errorMessage(e, '订单加载失败')
  } finally {
    loading.value = false
  }
}

async function openDetail(o: Order) {
  open.value = true
  detailErr.value = ''
  detailLoading.value = true
  detail.value = o
  try {
    detail.value = await getOrder(o.orderId)
  } catch (e) {
    detailErr.value = errorMessage(e, '订单详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

function switchTab(key: typeof filter.value) {
  filter.value = key
  load()
}

onMounted(load)
</script>

<template>
  <div>
    <div class="admin-top">
      <div>
        <p class="crumb">管理端 / <b>订单管理</b></p>
        <h1>订单管理</h1>
        <p>履约（发货/核销）需要后端状态机支撑，演示版只展示与查询</p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="load">刷新</button>
    </div>

    <div class="segs" role="tablist" aria-label="订单状态筛选">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="btn"
        :class="{ on: filter === t.key }"
        role="tab"
        :aria-selected="filter === t.key"
        @click="switchTab(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="loading" class="card"><div v-for="i in 5" :key="i" class="skel skel-row"></div></div>
    <div v-else-if="err" class="card" style="text-align: center">
      <p style="color: #be123c">{{ err }}</p>
      <button class="btn btn-secondary btn-sm" style="margin-top: 12px" @click="load">重试</button>
    </div>
    <div v-else-if="list.length === 0" class="card">
      <div class="empty">
        <div class="ico" aria-hidden="true">📦</div>
        <div class="title">该状态下暂无订单</div>
        <p class="hint">换个筛选看看，或等用户下单后再来</p>
      </div>
    </div>

    <AppCard v-else tight>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>商品</th>
              <th class="r">数量</th>
              <th class="r">消耗积分</th>
              <th>状态</th>
              <th>下单时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in list" :key="o.orderId" class="clickable" @click="openDetail(o)">
              <td class="mono">{{ o.orderId }}</td>
              <td class="t-strong">{{ o.productIcon }} {{ o.productName }}</td>
              <td class="r num">{{ o.quantity }}</td>
              <td class="r num">{{ fmtPoints(o.totalPoints) }}</td>
              <td><AppTag :tone="ORDER_STATUS_META[o.status].tone">{{ ORDER_STATUS_META[o.status].text }}</AppTag></td>
              <td class="mono">{{ fmtDateTime(o.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppCard>

    <AppDrawer v-model="open" title="订单详情">
      <div v-if="detailLoading" class="skel skel-card"></div>
      <p v-else-if="detailErr" class="err-msg">{{ detailErr }}</p>
      <template v-else-if="detail">
        <div class="factor-grid" style="grid-template-columns: 1fr">
          <div class="factor-row"><span>订单号</span><b class="mono">{{ detail.orderId }}</b></div>
          <div class="factor-row"><span>商品</span><b>{{ detail.productName }}</b></div>
          <div class="factor-row"><span>数量</span><b class="num">{{ detail.quantity }}</b></div>
          <div class="factor-row"><span>单价快照</span><b class="num">{{ fmtPoints(detail.unitPoints) }} 分</b></div>
          <div class="factor-row"><span>合计积分</span><b class="num">{{ fmtPoints(detail.totalPoints) }} 分</b></div>
          <div class="factor-row"><span>状态</span><b>{{ ORDER_STATUS_META[detail.status].text }}</b></div>
          <div class="factor-row"><span>下单时间</span><b class="mono">{{ fmtDateTime(detail.createdAt) }}</b></div>
          <div v-if="detail.cancelReason" class="factor-row"><span>取消原因</span><b>{{ detail.cancelReason }}</b></div>
        </div>
        <p class="hint" style="margin-top: 16px">
          单价与名称存的是下单那一刻的快照，商户后续改价不影响已生成订单。
        </p>
      </template>
    </AppDrawer>
  </div>
</template>
