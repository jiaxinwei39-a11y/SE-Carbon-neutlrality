<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppEmpty from '@/components/AppEmpty.vue'
import AppPagination from '@/components/AppPagination.vue'
import AppTag from '@/components/AppTag.vue'
import AppInput from '@/components/AppInput.vue'
import { listTrips } from '@/api/trips'
import { errorMessage } from '@/api/http'
import { fmtDateTime, fmtKg6 } from '@/utils/format'
import { MODES, MODE_META, TRIP_STATUS_META, modeIcon, modeLabel, PAGE_SIZE } from '@/utils/constants'
import type { Trip, TripMode } from '@/types'

const trips = ref<Trip[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(true)
const err = ref('')

const mode = ref<TripMode | 'ALL'>('ALL')
const keyword = ref('')
const from = ref('')
const to = ref('')

/** 只要用户改过筛选条件，空结果就要用"筛选无结果"的说法（J087） */
const filtered = ref(false)

async function load() {
  loading.value = true
  err.value = ''
  try {
    const res = await listTrips({
      page: page.value,
      size: PAGE_SIZE,
      mode: mode.value,
      keyword: keyword.value || undefined,
      from: from.value || undefined,
      to: to.value || undefined,
    })
    trips.value = res.items
    total.value = res.total
  } catch (e) {
    err.value = errorMessage(e, '行程列表加载失败')
    trips.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function applyFilter() {
  filtered.value = !!(keyword.value || from.value || to.value || mode.value !== 'ALL')
  page.value = 1
  void load()
}

function resetFilter() {
  mode.value = 'ALL'
  keyword.value = ''
  from.value = ''
  to.value = ''
  filtered.value = false
  page.value = 1
  void load()
}

watch(page, load)
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>我的行程</h1>
        <p>共 {{ total }} 条记录，减排量展示保留 6 位小数（展示值已舍入）</p>
      </div>
      <router-link to="/app/trips/new" class="btn btn-primary btn-sm" style="text-decoration: none">+ 上报行程</router-link>
    </div>

    <AppCard tight>
      <div style="padding: 16px 16px 0">
        <div class="filters">
          <div class="segs" role="tablist" aria-label="按出行方式筛选">
            <button type="button" :class="{ on: mode === 'ALL' }" @click="mode = 'ALL'; applyFilter()">全部</button>
            <button
              v-for="m in MODES"
              :key="m"
              type="button"
              :class="{ on: mode === m }"
              @click="mode = m; applyFilter()"
            >
              {{ MODE_META[m].label }}
            </button>
          </div>

          <div style="width: 200px">
            <AppInput v-model="keyword" placeholder="搜索地点 / 单号" @enter="applyFilter" />
          </div>
          <div style="width: 150px">
            <AppInput v-model="from" type="date" placeholder="开始日期" />
          </div>
          <div style="width: 150px">
            <AppInput v-model="to" type="date" placeholder="结束日期" />
          </div>
          <button class="btn btn-primary btn-sm" type="button" @click="applyFilter">查询</button>
          <button class="btn btn-secondary btn-sm" type="button" @click="resetFilter">重置</button>
        </div>
      </div>

      <!-- 加载中：骨架行，不显示"暂无数据" -->
      <div v-if="loading" style="padding: 8px 16px 20px">
        <div v-for="i in 6" :key="i" class="skel skel-row"></div>
      </div>

      <div v-else-if="err" style="padding: 40px 16px; text-align: center">
        <p style="color: #be123c; font-size: 13.5px">{{ err }}</p>
        <button class="btn btn-secondary btn-sm" style="margin-top: 12px" @click="load">重新加载</button>
      </div>

      <AppEmpty
        v-else-if="trips.length === 0"
        :variant="filtered ? 'filtered' : 'first'"
        :title="filtered ? '没有符合条件的行程' : '还没有行程记录'"
        :desc="filtered ? '试试换个出行方式或放宽日期范围' : '上报第一次绿色出行，就能在这里看到核算明细'"
      >
        <button v-if="filtered" class="btn btn-secondary btn-sm" @click="resetFilter">清除筛选</button>
        <router-link v-else to="/app/trips/new" class="btn btn-primary btn-sm" style="text-decoration: none">去上报</router-link>
      </AppEmpty>

      <template v-else>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>出行时间</th>
                <th>方式</th>
                <th>行程</th>
                <th class="r">里程(km)</th>
                <th class="r">减排量(kgCO₂e)</th>
                <th class="r">积分</th>
                <th>状态</th>
                <th class="r">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in trips" :key="t.tripId">
                <td class="mono">{{ fmtDateTime(t.startTime) }}</td>
                <td>{{ modeIcon(t.mode) }} {{ modeLabel(t.mode) }}</td>
                <td>
                  <div class="t-strong">{{ t.startPlace }} → {{ t.endPlace }}</div>
                  <div class="mono">{{ t.tripId }}</div>
                </td>
                <td class="r num">{{ t.distanceKm }}</td>
                <td class="r num">{{ fmtKg6(t.reductionKg) }}</td>
                <td class="r num t-strong">{{ t.status === 'FAILED' ? '--' : `+${t.awardedPoints}` }}</td>
                <td>
                  <AppTag :tone="TRIP_STATUS_META[t.status].tone">{{ TRIP_STATUS_META[t.status].text }}</AppTag>
                </td>
                <td class="r">
                  <router-link :to="{ name: 'trip-detail', params: { tripId: t.tripId } }" class="btn btn-ghost btn-sm" style="text-decoration: none">
                    明细
                  </router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <AppPagination v-model:page="page" :size="PAGE_SIZE" :total="total" />
      </template>
    </AppCard>
  </div>
</template>
