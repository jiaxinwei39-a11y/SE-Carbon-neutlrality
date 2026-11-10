<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppTag from '@/components/AppTag.vue'
import { getReconciliation, type ReconcileResult } from '@/api/admin'
import { errorMessage } from '@/api/http'
import { fmtDateTime } from '@/utils/format'

type DemoMode = 'normal' | 'diff' | 'error'

const mode = ref<DemoMode>('normal')
const data = ref<ReconcileResult | null>(null)
/** 关键：结果有三个状态，loaded=false 时不能渲染"无差异" */
const loading = ref(true)
const err = ref('')

async function load() {
  loading.value = true
  err.value = ''
  data.value = null
  try {
    data.value = await getReconciliation(mode.value === 'diff' ? '1' : mode.value === 'error' ? 'error' : undefined)
  } catch (e) {
    // 失败必须走这条分支：页面显示"无法判断"，而不是"没有差异"
    err.value = errorMessage(e, '核对结果读取失败')
  } finally {
    loading.value = false
  }
}

function switchMode(m: DemoMode) {
  mode.value = m
  load()
}

onMounted(load)
</script>

<template>
  <div>
    <div class="admin-top">
      <div>
        <p class="crumb">管理端 / <b>积分对账</b></p>
        <h1>积分对账</h1>
        <p>只读核对：逐条比对"期望值"与"实际值"，不做自动修复，也不提供导出</p>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="load">
        {{ loading ? '核对中…' : '重新核对' }}
      </button>
    </div>

    <div class="notice">
      演示用状态切换：正常（无差异） / 有差异 / 读取失败。注意"读取失败"态显示的是<b>无法判断</b>，不是"没有差异"——
      这是对账页最容易做错的三个状态。
    </div>

    <div class="segs" role="group" aria-label="演示状态切换">
      <button type="button" class="btn" :class="{ on: mode === 'normal' }" @click="switchMode('normal')">正常</button>
      <button type="button" class="btn" :class="{ on: mode === 'diff' }" @click="switchMode('diff')">有差异</button>
      <button type="button" class="btn" :class="{ on: mode === 'error' }" @click="switchMode('error')">读取失败</button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="card">
      <div v-for="i in 4" :key="i" class="skel skel-row"></div>
    </div>

    <!-- 读取失败：不能显示成"无差异" -->
    <div v-else-if="err" class="card" style="text-align: center; padding: 40px 24px">
      <div style="font-size: 34px; margin-bottom: 10px" aria-hidden="true">⚠️</div>
      <h2 style="margin-bottom: 6px">核对结果读取失败</h2>
      <p style="color: #334155; margin-bottom: 6px">当前<b>无法判断</b>是否存在积分差异，请稍后重试。</p>
      <p class="hint" style="margin-bottom: 18px">错误信息：{{ err }}</p>
      <button class="btn btn-primary btn-sm" type="button" @click="load">重试</button>
    </div>

    <!-- 无差异 -->
    <AppCard v-else-if="data && data.items.length === 0">
      <div class="result" style="padding: 12px 0">
        <div class="big" style="font-size: 28px">✅ 未发现差异</div>
        <p class="hint">
          核对时间 <span class="mono">{{ data.checkedAt ? fmtDateTime(data.checkedAt) : '—' }}</span>，
          本次核对了行程减排量与订单积分流水，期望值与实际值一致。
        </p>
      </div>
    </AppCard>

    <!-- 有差异 -->
    <template v-else-if="data">
      <AppCard
        :title="`发现 ${data.items.length} 处差异`"
        hint="需要人工核查，页面不提供自动修复"
        tight
      >
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>对象类型</th>
                <th>对象编号</th>
                <th>核对项</th>
                <th class="r">期望值</th>
                <th class="r">实际值</th>
                <th class="r">差异</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in data.items" :key="it.id">
                <td>{{ it.objectType === 'TRIP' ? '行程' : '订单' }}</td>
                <td class="mono">{{ it.objectId }}</td>
                <td>{{ it.checkName }}</td>
                <td class="r num">{{ it.expected }}</td>
                <td class="r num">{{ it.actual }}</td>
                <td class="r num" style="font-weight: 600">{{ it.actual - it.expected }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </AppCard>
      <p class="hint" style="margin-top: 12px">
        核对时间：<span class="mono">{{ fmtDateTime(data.checkedAt) }}</span>　
        <AppTag tone="amber">待人工处理</AppTag>
      </p>
    </template>
  </div>
</template>
