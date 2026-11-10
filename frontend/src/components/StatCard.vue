<script setup lang="ts">
/** 统计卡：k 标题 / v 数值 / unit 单位 / delta 变化说明 */
withDefaults(defineProps<{ k: string; v: string | number; unit?: string; delta?: string; up?: boolean }>(), {
  unit: '',
  delta: '',
  up: false,
})
</script>

<template>
  <div class="stat">
    <div class="k">{{ k }}</div>
    <div class="v">
      {{ v }}<small v-if="unit">{{ unit }}</small>
    </div>
    <div class="d" :class="{ up }">{{ delta }}</div>
  </div>
</template>
