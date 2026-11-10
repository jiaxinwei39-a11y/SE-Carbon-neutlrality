<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppEmpty from '@/components/AppEmpty.vue'
import AppPagination from '@/components/AppPagination.vue'
import AppSkeleton from '@/components/AppSkeleton.vue'
import { getPointsAccount, listPointsFlows } from '@/api/points'
import { errorMessage } from '@/api/http'
import { fmtDateTime, fmtPoints, fmtSigned } from '@/utils/format'
import { FLOW_TYPE_META, PAGE_SIZE } from '@/utils/constants'
import type { PointsAccount, PointsFlow, PointsFlowType } from '@/types'

const account = ref<PointsAccount | null>(null)
const flows = ref<PointsFlow[]>([])
const total = ref(0)
const page = ref(1)
const tab = ref<'ALL' | PointsFlowType>('ALL')
const loading = ref(true)
const listLoading = ref(true)
const err = ref('')

async function loadAccount() {
  try {
    account.value = await getPointsAccount()
  } catch (e) {
    err.value = errorMessage(e, '积分账户加载失败')
  }
}

async function loadFlows() {
  listLoading.value = true
  try {
    const res = await listPointsFlows({ page: page.value, size: PAGE_SIZE, type: tab.value })
    flows.value = res.items
    total.value = res.total
  } catch (e) {
    err.value = errorMessage(e, '积分流水加载失败')
    flows.value = []
    total.value = 0
  } finally {
    listLoading.value = false
  }
}

async function init() {
  loading.value = true
  await Promise.all([loadAccount(), loadFlows()])
  loading.value = false
}

function changeTab(t: 'ALL' | PointsFlowType) {
  tab.value = t
  page.value = 1
  void loadFlows()
}

watch(page, loadFlows)
onMounted(init)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>积分账户</h1>
        <p>每一笔积分都要能追溯到来源，这是对账页的基础</p>
      </div>
      <router-link to="/app/mall" class="btn btn-secondary btn-sm" style="text-decoration: none">去兑换</router-link>
    </div>

    <div v-if="loading" class="hero">
      <div class="main" style="width: 240px"><AppSkeleton :rows="2" /></div>
    </div>
    <div v-else-if="account" class="hero">
      <div class="main">
        <div class="label">可用积分</div>
        <div class="big num">{{ fmtPoints(account.balance) }}<small>分</small></div>
        <div class="sub">累计获得 {{ fmtPoints(account.totalEarned) }} · 累计消费 {{ fmtPoints(account.totalSpent) }}</div>
      </div>
      <div class="stats">
        <div>
          <div class="k">累计减排</div>
          <div class="v num">{{ account.totalReductionKg.toFixed(2) }}<small>kg</small></div>
        </div>
        <div>
          <div class="k">出行次数</div>
          <div class="v num">{{ account.tripCount }}<small>次</small></div>
        </div>
      </div>
    </div>

    <AppCard tight style="margin-top: 20px">
      <div style="padding: 16px 16px 8px">
        <div class="segs" role="tablist" aria-label="流水类型筛选">
          <button type="button" :class="{ on: tab === 'ALL' }" @click="changeTab('ALL')">全部</button>
          <button type="button" :class="{ on: tab === 'EARN' }" @click="changeTab('EARN')">获得</button>
          <button type="button" :class="{ on: tab === 'SPEND' }" @click="changeTab('SPEND')">消费</button>
          <button type="button" :class="{ on: tab === 'REVERSE' }" @click="changeTab('REVERSE')">冲正</button>
        </div>
      </div>

      <div v-if="listLoading" style="padding: 8px 16px 20px">
        <div v-for="i in 5" :key="i" class="skel skel-row"></div>
      </div>

      <div v-else-if="err" class="empty">
        <p class="title">{{ err }}</p>
        <button class="btn btn-secondary btn-sm" style="margin-top: 12px" @click="init">重新加载</button>
      </div>

      <AppEmpty
        v-else-if="flows.length === 0"
        :variant="tab === 'ALL' ? 'first' : 'filtered'"
        :title="tab === 'ALL' ? '还没有积分流水' : '该类型下没有流水'"
        :desc="tab === 'ALL' ? '上报一次绿色出行就会产生第一条记录' : '换个类型看看，或查看全部流水'"
      >
        <button v-if="tab !== 'ALL'" class="btn btn-secondary btn-sm" @click="changeTab('ALL')">查看全部</button>
        <router-link v-else to="/app/trips/new" class="btn btn-primary btn-sm" style="text-decoration: none">去上报</router-link>
      </AppEmpty>

      <template v-else>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>类型</th>
                <th>说明</th>
                <th class="r">变动</th>
                <th class="r">余额</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in flows" :key="f.id">
                <td class="mono">{{ fmtDateTime(f.createdAt) }}</td>
                <td>{{ FLOW_TYPE_META[f.type].text }}</td>
                <td class="t-strong">{{ f.title }}</td>
                <td class="r num" :class="f.amount >= 0 ? 'text-green' : ''" style="font-weight: 600">
                  {{ fmtSigned(f.amount) }}
                </td>
                <td class="r num">{{ fmtPoints(f.balanceAfter) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <AppPagination v-model:page="page" :size="PAGE_SIZE" :total="total" />
      </template>
    </AppCard>
  </div>
</template>
