<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppCard from '@/components/AppCard.vue'
import AppTag from '@/components/AppTag.vue'
import AppSkeleton from '@/components/AppSkeleton.vue'
import { getTrip } from '@/api/trips'
import { errorMessage, isApiError } from '@/api/http'
import { TRIP_STATUS_META, modeIcon, modeLabel } from '@/utils/constants'
import { fmtDateTime, fmtKg6, fmtKg9 } from '@/utils/format'
import type { TripDetail } from '@/types'

/**
 * 核算详情：这是整个 demo 最能体现"专业性"的一页
 * —— 必须展示"当时用的因子"，否则规则改了之后历史数据就解释不清（D-03）
 */
const route = useRoute()
const router = useRouter()

const trip = ref<TripDetail | null>(null)
const loading = ref(true)
const err = ref('')
const notFound = ref(false)

async function load() {
  loading.value = true
  err.value = ''
  notFound.value = false
  try {
    trip.value = await getTrip(String(route.params.tripId))
  } catch (e) {
    // 404 和服务故障要分开处理：一个回列表，一个给重试
    if (isApiError(e) && e.httpStatus === 404) notFound.value = true
    err.value = errorMessage(e, '核算详情加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <p class="crumb" style="margin-bottom: 6px">
          <router-link to="/app/trips" style="color: #64748b">我的行程</router-link> / <b>核算详情</b>
        </p>
        <h1>行程核算详情</h1>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="router.back()">返回</button>
    </div>

    <AppCard v-if="loading">
      <AppSkeleton :rows="6" />
    </AppCard>

    <AppCard v-else-if="notFound">
      <div class="empty">
        <span class="ico" aria-hidden="true">🧾</span>
        <p class="title">该行程记录不存在或已被删除</p>
        <p>可能链接已失效，回到列表重新选择一条记录</p>
        <div class="actions">
          <router-link to="/app/trips" class="btn btn-primary btn-sm" style="text-decoration: none">回到行程列表</router-link>
        </div>
      </div>
    </AppCard>

    <AppCard v-else-if="err">
      <div class="empty">
        <span class="ico" aria-hidden="true">⚠️</span>
        <p class="title">{{ err }}</p>
        <p>数据没有加载成功，请重试后查看</p>
        <div class="actions">
          <button class="btn btn-secondary btn-sm" @click="load">重试</button>
        </div>
      </div>
    </AppCard>

    <div v-else-if="trip" class="grid-main">
      <AppCard>
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 18px">
          <div class="thumb" style="width: 52px; height: 52px; font-size: 24px; background: #ecfdf5; border-radius: 12px; display: flex; align-items: center; justify-content: center">
            {{ modeIcon(trip.mode) }}
          </div>
          <div style="flex: 1">
            <div style="font-size: 16px; font-weight: 600">{{ trip.startPlace }} → {{ trip.endPlace }}</div>
            <div class="hint" style="margin-top: 4px">{{ modeLabel(trip.mode) }} · {{ trip.distanceKm }} km · {{ fmtDateTime(trip.startTime) }}</div>
          </div>
          <AppTag :tone="TRIP_STATUS_META[trip.status].tone">{{ TRIP_STATUS_META[trip.status].text }}</AppTag>
        </div>

        <div class="calc">
          <div>
            <div class="k">减排量（原精度）</div>
            <div class="v num">{{ fmtKg9(trip.reductionKg) }}</div>
            <div class="hint">kgCO₂e</div>
          </div>
          <div>
            <div class="k">获得积分</div>
            <div class="v num">{{ trip.status === 'FAILED' ? '--' : trip.awardedPoints }}</div>
            <div class="hint">按减排量 × {{ trip.pointsRatio }} 向下取整</div>
          </div>
          <div>
            <div class="k">核算版本</div>
            <div class="v" style="font-size: 16px">{{ trip.ruleVersion }}</div>
            <div class="hint">{{ fmtDateTime(trip.calculatedAt) }}</div>
          </div>
        </div>

        <h3 style="font-size: 14px; margin: 24px 0 4px">计算过程</h3>
        <div class="factor-grid" style="grid-template-columns: 1fr">
          <div class="factor-row"><span>里程</span><b class="num">{{ trip.distanceKm }} km</b></div>
          <div class="factor-row"><span>基准排放因子</span><b class="num">{{ fmtKg9(trip.baseFactor) }} kg/km</b></div>
          <div class="factor-row"><span>{{ modeLabel(trip.mode) }}排放因子</span><b class="num">{{ fmtKg9(trip.modeFactor) }} kg/km</b></div>
          <div class="factor-row">
            <span>减排量 = 里程 ×（基准 − 方式）</span>
            <b class="num">{{ trip.distanceKm }} × ({{ fmtKg9(trip.baseFactor) }} − {{ fmtKg9(trip.modeFactor) }}) = {{ fmtKg9(trip.reductionKg) }}</b>
          </div>
          <div class="factor-row"><span>积分比例</span><b class="num">{{ trip.pointsRatio }} 分 / kg</b></div>
          <div class="factor-row">
            <span>积分 = floor(减排量 × 比例)</span>
            <b class="num">{{ trip.status === 'FAILED' ? '核算失败，未入账' : `floor(${fmtKg9(trip.reductionKg)} × ${trip.pointsRatio}) = ${trip.awardedPoints}` }}</b>
          </div>
        </div>
        <p class="hint" style="margin-top: 14px">
          列表中减排量展示为 {{ fmtKg6(trip.reductionKg) }}（6 位小数，展示值已舍入），此处为服务端返回的原精度。
        </p>
      </AppCard>

      <div class="stack">
        <AppCard title="记录信息">
          <div class="factor-grid" style="grid-template-columns: 1fr">
            <div class="factor-row"><span>行程单号</span><b class="mono">{{ trip.tripId }}</b></div>
            <div class="factor-row"><span>开始时间</span><b class="num">{{ fmtDateTime(trip.startTime) }}</b></div>
            <div class="factor-row"><span>结束时间</span><b class="num">{{ fmtDateTime(trip.endTime) }}</b></div>
            <div class="factor-row"><span>提交时间</span><b class="num">{{ fmtDateTime(trip.createdAt) }}</b></div>
          </div>
        </AppCard>

        <AppCard title="这笔积分去哪了">
          <p class="hint" style="margin-top: 0">
            本次入账 {{ trip.awardedPoints }} 分，可在「积分账户」查看流水，或去「积分商城」兑换礼品。
          </p>
          <div style="display: flex; gap: 10px; margin-top: 14px">
            <router-link to="/app/points" class="btn btn-secondary btn-sm" style="text-decoration: none">查看流水</router-link>
            <router-link to="/app/mall" class="btn btn-primary btn-sm" style="text-decoration: none">去商城</router-link>
          </div>
        </AppCard>
      </div>
    </div>
  </div>
</template>
