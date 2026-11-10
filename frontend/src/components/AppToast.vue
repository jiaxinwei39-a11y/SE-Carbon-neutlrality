<script setup lang="ts">
import { useToast } from '@/composables/useToast'

// 单例：全应用共用一个 toast，同屏只显示一条
const { text, visible } = useToast()
</script>

<template>
  <div class="toast" :class="{ on: visible }" role="status" aria-live="polite">{{ text }}</div>
</template>
