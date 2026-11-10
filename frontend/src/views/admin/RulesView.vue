<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppTag from '@/components/AppTag.vue'
import { listRules } from '@/api/admin'
import { errorMessage } from '@/api/http'
import { fmtKg9 } from '@/utils/format'
import { modeLabel } from '@/utils/constants'
import type { CarbonRule } from '@/types'

const rules = ref<CarbonRule[]>([])
const loading = ref(true)
const err = ref('')

const active = computed(() => rules.value.filter((r) => r.status === 'ACTIVE'))
const archived = computed(() => rules.value.filter((r) => r.status === 'ARCHIVED'))

async function load() {
  loading.value = true
  err.value = ''
  try {
    rules.value = await listRules()
  } catch (e) {
    err.value = errorMessage(e, '规则加载失败')
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
        <p class="crumb">管理端 / <b>核算规则</b></p>
        <h1>核算规则</h1>
        <p>规则按版本管理，历史行程必须能对上当时使用的版本</p>
      </div>
    </div>

    <div class="notice">
      演示版为只读。真实系统里修改规则需要走审核流程，且不允许改历史版本的数值 —— 否则账就算不平。
    </div>

    <div v-if="loading" class="card"><div v-for="i in 5" :key="i" class="skel skel-row"></div></div>
    <div v-else-if="err" class="card" style="text-align: center">
      <p style="color: #be123c">{{ err }}</p>
      <button class="btn btn-secondary btn-sm" style="margin-top: 12px" @click="load">重试</button>
    </div>

    <template v-else>
      <AppCard title="当前生效版本" hint="新行程按这里的因子计算" tight>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>规则编号</th>
                <th>版本</th>
                <th>出行方式</th>
                <th class="r">基准因子</th>
                <th class="r">方式因子</th>
                <th class="r">积分比例</th>
                <th>生效日期</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in active" :key="r.ruleId">
                <td class="mono">{{ r.ruleId }}</td>
                <td>{{ r.version }}</td>
                <td>{{ modeLabel(r.mode) }}</td>
                <td class="r num">{{ fmtKg9(r.baseFactor) }}</td>
                <td class="r num">{{ fmtKg9(r.modeFactor) }}</td>
                <td class="r num">{{ r.pointsRatio }} 分/kg</td>
                <td class="mono">{{ r.effectiveFrom }}</td>
                <td><AppTag tone="green">生效中</AppTag></td>
              </tr>
            </tbody>
          </table>
        </div>
      </AppCard>

      <AppCard title="历史版本" hint="只读，用于追溯" tight style="margin-top: 16px">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>规则编号</th>
                <th>版本</th>
                <th>出行方式</th>
                <th class="r">基准因子</th>
                <th class="r">方式因子</th>
                <th>生效日期</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in archived" :key="r.ruleId">
                <td class="mono">{{ r.ruleId }}</td>
                <td>{{ r.version }}</td>
                <td>{{ modeLabel(r.mode) }}</td>
                <td class="r num">{{ fmtKg9(r.baseFactor) }}</td>
                <td class="r num">{{ fmtKg9(r.modeFactor) }}</td>
                <td class="mono">{{ r.effectiveFrom }}</td>
                <td><AppTag tone="gray">已归档</AppTag></td>
              </tr>
            </tbody>
          </table>
        </div>
      </AppCard>
    </template>
  </div>
</template>
