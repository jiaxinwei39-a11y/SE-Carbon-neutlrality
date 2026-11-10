<script setup lang="ts">
/** 骨架屏：加载中要占位，不能直接显示"暂无数据"（否则用户以为真的没有） */
withDefaults(defineProps<{ rows?: number; card?: boolean }>(), { rows: 5, card: false })
</script>

<template>
  <div aria-busy="true" aria-live="polite">
    <div v-if="card" class="skel skel-card"></div>
    <template v-else>
      <div v-for="i in rows" :key="i" class="skel skel-row" :style="{ width: i === rows ? '62%' : '100%' }"></div>
    </template>
  </div>
</template>
