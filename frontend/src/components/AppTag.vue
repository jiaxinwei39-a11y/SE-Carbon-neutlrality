<script setup lang="ts">
/** 标签：颜色只是辅助，文字本身必须能表达含义（无障碍要求） */
withDefaults(defineProps<{ tone?: 'green' | 'amber' | 'gray' | 'rose' }>(), { tone: 'gray' })
</script>

<template>
  <span class="tag" :class="`tag-${tone}`"><slot /></span>
</template>
