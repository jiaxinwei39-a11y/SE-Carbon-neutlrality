<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppButton from '@/components/AppButton.vue'
import AppInput from '@/components/AppInput.vue'
import { createTrip, type CreateTripPayload } from '@/api/trips'
import { errorMessage } from '@/api/http'
import { useToast } from '@/composables/useToast'
import { MODES, MODE_META, MAX_DISTANCE_KM } from '@/utils/constants'
import { fmtKg6, toLocalInput } from '@/utils/format'
import type { TripDetail, TripMode } from '@/types'

/**
 * 上报表单（首页内嵌 + 独立页共用同一个组件，保证两处行为完全一致）
 *
 * 这里的三个"不能省"：
 *  1. 幂等：clientTripId 在"开始一次提交"时生成，失败重试复用，成功后才换新的
 *  2. 前端预估只是给人看，页面上必须写"以服务端核算为准"
 *  3. 校验：里程 >0 且 ≤200、最多 3 位小数；开始 < 结束 ≤ 现在
 */
const emit = defineEmits<{ submitted: [TripDetail] }>()

const router = useRouter()
const { toast } = useToast()

const mode = ref<TripMode>('BUS')
const distance = ref('')
const startPlace = ref('')
const endPlace = ref('')
const now = new Date()
const startTime = ref(toLocalInput(new Date(now.getTime() - 40 * 60 * 1000)))
const endTime = ref(toLocalInput(new Date(now.getTime() - 5 * 60 * 1000)))

const submitting = ref(false)
const errors = reactive<Record<string, string>>({})
/** 一次业务意图一个 id：重试复用，成功后重建 */
const clientTripId = ref(`CT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
const lastKey = ref('')

const factor = computed(() =>
  mode.value === 'BUS' ? 0.05 : mode.value === 'SUBWAY' ? 0.04 : 0,
)
const distanceNum = computed(() => Number(distance.value))
const reduction = computed(() => (distanceNum.value > 0 ? distanceNum.value * (0.2 - factor.value) : 0))
const points = computed(() => Math.max(0, Math.floor(reduction.value * 10)))

onMounted(() => {
  // 每次进入页面视为一次新的业务意图
  clientTripId.value = `CT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
})

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k])
  const d = distanceNum.value
  if (!distance.value) errors.distance = '请填写里程'
  else if (Number.isNaN(d) || d <= 0) errors.distance = '里程必须大于 0'
  else if (d > MAX_DISTANCE_KM) errors.distance = `单次上报不能超过 ${MAX_DISTANCE_KM} 公里`
  else if ((distance.value.split('.')[1] ?? '').length > 3) errors.distance = '最多保留 3 位小数'

  if (!startPlace.value.trim()) errors.startPlace = '请填写起点'
  if (!endPlace.value.trim()) errors.endPlace = '请填写终点'

  const s = new Date(startTime.value)
  const e = new Date(endTime.value)
  if (Number.isNaN(s.getTime())) errors.startTime = '请选择开始时间'
  if (Number.isNaN(e.getTime())) errors.endTime = '请选择结束时间'
  if (!errors.startTime && !errors.endTime) {
    if (s >= e) errors.endTime = '结束时间必须晚于开始时间'
    else if (e.getTime() > Date.now()) errors.endTime = '结束时间不能晚于当前时间'
  }
  return Object.keys(errors).length === 0
}

async function submit() {
  if (submitting.value) return
  if (!validate()) {
    toast('请检查表单中标红的内容')
    return
  }
  submitting.value = true
  const payload: CreateTripPayload = {
    clientTripId: clientTripId.value,
    mode: mode.value,
    distanceKm: Number(distanceNum.value.toFixed(3)),
    startTime: new Date(startTime.value).toISOString(),
    endTime: new Date(endTime.value).toISOString(),
    startPlace: startPlace.value.trim(),
    endPlace: endPlace.value.trim(),
  }
  try {
    const trip = await createTrip(payload, lastKey.value || undefined)
    toast(`上报成功，获得 ${trip.awardedPoints} 积分`)
    // 成功后重建 id，避免下一次上报被当成同一次
    clientTripId.value = `CT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    lastKey.value = ''
    emit('submitted', trip)
    router.push({ name: 'trip-detail', params: { tripId: trip.tripId } })
  } catch (e) {
    // 失败保留 clientTripId 与 idempotency key：用户点"重试"不会重复记账
    toast(errorMessage(e, '上报失败，请重试'))
  } finally {
    submitting.value = false
  }
}

function fillDemo() {
  mode.value = 'BUS'
  distance.value = '8.6'
  startPlace.value = '软件园东门'
  endPlace.value = '地铁二号线站'
}
</script>

<template>
  <div>
    <div class="field">
      <label>出行方式<span class="req">*</span></label>
      <div class="modes" role="radiogroup" aria-label="出行方式">
        <button
          v-for="m in MODES"
          :key="m"
          type="button"
          class="mode"
          :class="{ on: mode === m }"
          role="radio"
          :aria-checked="mode === m"
          @click="mode = m"
        >
          <span class="ico" aria-hidden="true">{{ MODE_META[m].icon }}</span>{{ MODE_META[m].label }}
        </button>
      </div>
    </div>

    <div class="row2">
      <div class="field">
        <label for="distance">里程（公里）<span class="req">*</span></label>
        <AppInput
          id="distance"
          v-model="distance"
          inputmode="decimal"
          placeholder="例如 8.6"
          :error="!!errors.distance"
        />
        <p v-if="errors.distance" class="err-msg">{{ errors.distance }}</p>
        <p v-else class="hint">最多 3 位小数，单次不超过 200 公里</p>
      </div>

      <div class="field">
        <label>出行时间<span class="req">*</span></label>
        <div class="row2">
          <AppInput v-model="startTime" type="datetime-local" :error="!!errors.startTime" />
          <AppInput v-model="endTime" type="datetime-local" :error="!!errors.endTime" />
        </div>
        <p v-if="errors.endTime" class="err-msg">{{ errors.endTime }}</p>
      </div>
    </div>

    <div class="row2">
      <div class="field">
        <label for="sp">起点<span class="req">*</span></label>
        <AppInput id="sp" v-model="startPlace" placeholder="例如 软件园东门" :error="!!errors.startPlace" />
        <p v-if="errors.startPlace" class="err-msg">{{ errors.startPlace }}</p>
      </div>
      <div class="field">
        <label for="ep">终点<span class="req">*</span></label>
        <AppInput id="ep" v-model="endPlace" placeholder="例如 地铁二号线站" :error="!!errors.endPlace" />
        <p v-if="errors.endPlace" class="err-msg">{{ errors.endPlace }}</p>
      </div>
    </div>

    <div class="result" aria-live="polite">
      <div>
        <span>预计减排</span>
        <div><strong class="num">{{ fmtKg6(reduction) }}</strong> kgCO₂e</div>
      </div>
      <div class="divider"></div>
      <div>
        <span>预计获得</span>
        <div><strong class="num">{{ points }}</strong> 积分</div>
      </div>
      <span style="margin-left: auto; font-size: 12px">以上为前端预估，最终积分以服务端核算为准</span>
    </div>

    <div style="display: flex; gap: 10px; margin-top: 18px; align-items: center">
      <AppButton :loading="submitting" @click="submit">提交上报</AppButton>
      <AppButton variant="secondary" :disabled="submitting" @click="fillDemo">填入示例</AppButton>
      <span class="hint" style="margin: 0 0 0 auto">积分规则：减排量 × 10，向下取整</span>
    </div>
  </div>
</template>
