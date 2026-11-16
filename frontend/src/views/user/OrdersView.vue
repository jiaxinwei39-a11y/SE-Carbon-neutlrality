<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppCard from '@/components/AppCard.vue'
import AppEmpty from '@/components/AppEmpty.vue'
import AppPagination from '@/components/AppPagination.vue'
import AppTag from '@/components/AppTag.vue'
import AppButton from '@/components/AppButton.vue'
import AppDrawer from '@/components/AppDrawer.vue'
import { getOrder, listOrders } from '@/api/orders'
import { errorMessage } from '@/api/http'
import { fmtDateTime, fmtPoints } from '@/utils/format'
import { ORDER_STATUS_META, PAGE_SIZE } from '@/utils/constants'
import type { Order, OrderStatus } from '@/types'

const route = useRoute()

const orders = ref<Order[]>([])
const total = ref(0)
const page = ref(1)
const status = ref<'ALL' | OrderStatus>('ALL')
const loading = ref(true)
const err = ref('')

const current = ref<Order | null>(null)
const drawerOpen = ref(false)

async function load() {
  loading.value = true
  err.value = ''
  try {
    const res = await listOrders({ page: page.value, size: PAGE_SIZE, status: status.value })
    orders.value = res.items
    total.value = res.total
  } catch (e) {
    err.value = errorMessage(e, '订单加载失败')
  } finally {
    loading.value = false
  }
}

function changeStatus(s: 'ALL' | OrderStatus) {
  status.value = s
  page.value = 1
  void load()
}

async function openDetail(o: Order) {
  // 先展示列表里的数据，再用详情接口刷新（体验更快，数据也最新）
  current.value = o
  drawerOpen.value = true
  try {
    current.value = await getOrder(o.orderId)
  } catch {
    /* 详情失败就显示列表数据，不打断用户 */
  }
}

watch(page, load)
onMounted(async () => {
  await load()
  // 从兑换页跳过来时带 orderId，直接打开详情
  const orderId = route.query.orderId
  if (typeof orderId === 'string' && orderId) {
    const found = orders.value.find((o) => o.orderId === orderId)
    if (found) void openDetail(found)
  }
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>我的订单</h1>
        <p>订单单价与数量按下单时快照保存，礼品改价不影响历史记录</p>
      </div>
      <router-link to="/app/mall" class="btn btn-secondary btn-sm" style="text-decoration: none">去商城</router-link>
    </div>

    <AppCard tight>
      <div style="padding: 16px 16px 0">
        <div class="segs" role="tablist" aria-label="按订单状态筛选">
          <button type="button" :class="{ on: status === 'ALL' }" @click="changeStatus('ALL')">全部</button>
          <button type="button" :class="{ on: status === 'CREATED' }" @click="changeStatus('CREATED')">待发放</button>
          <button type="button" :class="{ on: status === 'FULFILLED' }" @click="changeStatus('FULFILLED')">已完成</button>
          <button type="button" :class="{ on: status === 'CANCELLED' }" @click="changeStatus('CANCELLED')">已取消</button>
        </div>
      </div>

      <div v-if="loading" style="padding: 8px 16px 20px">
        <div v-for="i in 4" :key="i" class="skel skel-row"></div>
      </div>

      <div v-else-if="err" class="empty">
        <p class="title">{{ err }}</p>
        <button class="btn btn-secondary btn-sm" style="margin-top: 12px" @click="load">重新加载</button>
      </div>

      <AppEmpty
        v-else-if="orders.length === 0"
        :variant="status === 'ALL' ? 'first' : 'filtered'"
        :title="status === 'ALL' ? '还没有兑换过礼品' : '该状态下没有订单'"
        :desc="status === 'ALL' ? '用出行积分去商城换点实用的东西吧' : '换个状态看看'"
      >
        <router-link v-if="status === 'ALL'" to="/app/mall" class="btn btn-primary btn-sm" style="text-decoration: none">去商城</router-link>
        <button v-else class="btn btn-secondary btn-sm" @click="changeStatus('ALL')">查看全部</button>
      </AppEmpty>

      <template v-else>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>下单时间</th>
                <th>礼品</th>
                <th class="r">数量</th>
                <th class="r">消耗积分</th>
                <th>状态</th>
                <th class="r">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in orders" :key="o.orderId">
                <td class="mono">{{ fmtDateTime(o.createdAt) }}</td>
                <td>
                  <div class="t-strong">{{ o.productIcon }} {{ o.productName }}</div>
                  <div class="mono">{{ o.orderId }}</div>
                </td>
                <td class="r num">{{ o.quantity }}</td>
                <td class="r num t-strong">{{ fmtPoints(o.totalPoints) }}</td>
                <td>
                  <AppTag :tone="ORDER_STATUS_META[o.status].tone">{{ ORDER_STATUS_META[o.status].text }}</AppTag>
                </td>
                <td class="r">
                  <button class="btn btn-ghost btn-sm" type="button" @click="openDetail(o)">详情</button>
                  <!-- 用户端不提供取消/履约入口：#23 之后取消改由管理端发起 -->
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <AppPagination v-model:page="page" :size="PAGE_SIZE" :total="total" />
      </template>
    </AppCard>

    <!-- 详情抽屉：只读 -->
    <AppDrawer v-model="drawerOpen" title="订单详情">
      <template v-if="current">
        <div class="factor-grid" style="grid-template-columns: 1fr">
          <div class="factor-row"><span>订单号</span><b class="mono">{{ current.orderId }}</b></div>
          <div class="factor-row"><span>礼品</span><b>{{ current.productIcon }} {{ current.productName }}</b></div>
          <div class="factor-row"><span>数量</span><b class="num">{{ current.quantity }}</b></div>
          <div class="factor-row"><span>下单单价（快照）</span><b class="num">{{ fmtPoints(current.unitPoints) }} 分</b></div>
          <div class="factor-row"><span>消耗积分</span><b class="num">{{ fmtPoints(current.totalPoints) }} 分</b></div>
          <div class="factor-row"><span>下单时间</span><b class="num">{{ fmtDateTime(current.createdAt) }}</b></div>
          <div class="factor-row">
            <span>状态</span>
            <b><AppTag :tone="ORDER_STATUS_META[current.status].tone">{{ ORDER_STATUS_META[current.status].text }}</AppTag></b>
          </div>
          <div v-if="current.cancelReason" class="factor-row">
            <span>取消原因</span><b>{{ current.cancelReason }}</b>
          </div>
        </div>
        <p class="hint" style="margin-top: 16px">
          如需取消订单，请联系运营在管理端处理；取消会按原额返还积分、按原数量返还库存。
        </p>
      </template>
      <template #footer>
        <AppButton variant="secondary" @click="drawerOpen = false">关闭</AppButton>
      </template>
    </AppDrawer>
  </div>
</template>
