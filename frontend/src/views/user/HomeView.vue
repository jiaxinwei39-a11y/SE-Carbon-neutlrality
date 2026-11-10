<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppSkeleton from '@/components/AppSkeleton.vue'
import AppEmpty from '@/components/AppEmpty.vue'
import TripForm from '@/components/TripForm.vue'
import { getPointsAccount } from '@/api/points'
import { listTrips } from '@/api/trips'
import { errorMessage } from '@/api/http'
import { useToast } from '@/composables/useToast'
import { fmtKg6, fmtPoints, fmtTime, fmtDate } from '@/utils/format'
import { modeIcon, modeLabel } from '@/utils/constants'
import type { PointsAccount, Trip } from '@/types'

const { toast } = useToast()

const account = ref<PointsAccount | null>(null)
const recent = ref<Trip[]>([])
const loading = ref(true)
const loadError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [acc, page] = await Promise.all([getPointsAccount(), listTrips({ page: 1, size: 4 })])
    account.value = acc
    recent.value = page.items
  } catch (e) {
    loadError.value = errorMessage(e, '数据加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function retry() {
  toast('正在重新加载')
  void load()
}
</script>

<template>
  <div class="page">
    <!-- 余额区：加载时用骨架，不要在数据没回来时先显示 0 -->
    <div v-if="loading" class="hero">
      <div class="main" style="width: 260px">
        <div class="label">当前可用积分</div>
        <div class="big"><AppSkeleton :rows="1" /></div>
      </div>
    </div>
    <div v-else-if="loadError" class="card" style="text-align: center">
      <p style="color: #be123c; font-size: 14px">{{ loadError }}</p>
      <button class="btn btn-secondary" style="margin-top: 12px" @click="retry">重新加载</button>
    </div>
    <div v-else-if="account" class="hero">
      <div class="main">
        <div class="label">当前可用积分</div>
        <div class="big num">{{ fmtPoints(account.balance) }}<small>分</small></div>
        <div class="sub">累计获得 {{ fmtPoints(account.totalEarned) }} · 累计消费 {{ fmtPoints(account.totalSpent) }}</div>
      </div>
      <div class="stats">
        <div>
          <div class="k">出行次数</div>
          <div class="v num">{{ account.tripCount }}<small>次</small></div>
        </div>
        <div>
          <div class="k">累计减排</div>
          <div class="v num">{{ account.totalReductionKg.toFixed(2) }}<small>kg</small></div>
        </div>
      </div>
    </div>

    <div class="grid-main" style="margin-top: 20px">
      <AppCard title="上报一次绿色出行" hint="提交后自动核算减排量与积分">
        <TripForm />
      </AppCard>

      <div class="stack">
        <AppCard title="最近行程">
          <template #actions>
            <router-link to="/app/trips" class="more">全部</router-link>
          </template>

          <AppSkeleton v-if="loading" :rows="3" />
          <AppEmpty v-else-if="recent.length === 0" variant="first" title="还没有行程记录" desc="在上方上报一次出行，马上就能看到核算结果">
            <router-link to="/app/trips/new" class="btn btn-secondary btn-sm" style="text-decoration: none">独立页面上报</router-link>
          </AppEmpty>

          <div v-else class="list">
            <router-link
              v-for="t in recent"
              :key="t.tripId"
              :to="{ name: 'trip-detail', params: { tripId: t.tripId } }"
              class="li clickable"
              style="text-decoration: none"
            >
              <div class="thumb" aria-hidden="true">{{ modeIcon(t.mode) }}</div>
              <div class="body">
                <div class="t">{{ t.startPlace }} → {{ t.endPlace }}</div>
                <div class="m">
                  {{ modeLabel(t.mode) }} · {{ t.distanceKm }} km · {{ fmtKg6(t.reductionKg) }} kg ·
                  {{ fmtDate(t.startTime) }} {{ fmtTime(t.startTime) }}
                </div>
              </div>
              <div class="amt num">{{ t.status === 'FAILED' ? '--' : `+${t.awardedPoints}` }}</div>
            </router-link>
          </div>
        </AppCard>

        <AppCard title="积分怎么算">
          <div class="factor-grid" style="grid-template-columns: 1fr">
            <div class="factor-row"><span>基准排放因子</span><b class="num">0.200000000</b></div>
            <div class="factor-row"><span>公交 / 地铁</span><b class="num">0.05 / 0.04</b></div>
            <div class="factor-row"><span>骑行 / 步行</span><b class="num">0</b></div>
            <div class="factor-row"><span>积分比例</span><b class="num">10 分 / kg</b></div>
          </div>
          <p class="hint" style="margin-top: 12px">减排量 = 里程 ×（基准因子 − 方式因子），积分取整规则由服务端执行。</p>
        </AppCard>
      </div>
    </div>
  </div>
</template>
