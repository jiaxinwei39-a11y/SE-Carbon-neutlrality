<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StatCard from '@/components/StatCard.vue'
import AppCard from '@/components/AppCard.vue'
import AppSkeleton from '@/components/AppSkeleton.vue'
import { getDashboard, type DashboardData } from '@/api/admin'
import { errorMessage } from '@/api/http'
import { modeLabel } from '@/utils/constants'

const data = ref<DashboardData | null>(null)
const loading = ref(true)
const err = ref('')

const maxDaily = computed(() => Math.max(1, ...(data.value?.dailyTrend.map((d) => d.count) ?? [1])))

async function load() {
  loading.value = true
  err.value = ''
  try {
    data.value = await getDashboard()
  } catch (e) {
    err.value = errorMessage(e, '概览数据加载失败')
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
        <p class="crumb">管理端 / <b>数据概览</b></p>
        <h1>数据概览</h1>
        <p>演示数据来自本地 mock，接后端后替换为统计接口</p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="load">刷新</button>
    </div>

    <div v-if="loading" class="card"><AppSkeleton :rows="5" /></div>
    <div v-else-if="err" class="card" style="text-align: center">
      <p style="color: #be123c">{{ err }}</p>
      <button class="btn btn-secondary btn-sm" style="margin-top: 12px" @click="load">重试</button>
    </div>

    <template v-else-if="data">
      <div class="stat-grid">
        <StatCard k="注册用户" :v="data.userCount" unit="人" delta="含 1 个管理员账号" />
        <StatCard k="累计行程" :v="data.tripCount" unit="条" delta="本周 +12" up />
        <StatCard k="累计减排" :v="data.totalReductionKg.toFixed(2)" unit="kgCO₂e" delta="按服务端原精度汇总" />
        <StatCard k="已发放积分" :v="data.totalPointsIssued" unit="分" delta="含冲正记录" />
      </div>

      <div class="grid-2">
        <AppCard title="近 7 天行程量">
          <div class="chart">
            <div v-for="d in data.dailyTrend" :key="d.date" class="col">
              <i :style="{ height: `${Math.max(6, (d.count / maxDaily) * 100)}%` }"><span>{{ d.count }}</span></i>
              <b>{{ d.date }}</b>
            </div>
          </div>
        </AppCard>

        <AppCard title="出行方式占比">
          <div class="bars">
            <div v-for="m in data.modeDistribution" :key="m.mode" class="bar">
              <span>{{ modeLabel(m.mode) }}</span>
              <div class="track">
                <i :style="{ width: `${(m.count / Math.max(1, data.tripCount)) * 100}%` }"></i>
              </div>
              <b>{{ m.count }}</b>
            </div>
          </div>
          <p class="hint" style="margin-top: 16px">
            方式分布会直接影响减排量汇总，算法调整后要重新核对历史数据。
          </p>
        </AppCard>
      </div>

      <div class="notice">
        演示提示：对账页有三个状态（无差异 / 有差异 / 读取失败），可在「积分对账」页通过右上角按钮切换查看，
        用来验证"失败不能显示成无差异"这条规则。
      </div>
    </template>
  </div>
</template>
