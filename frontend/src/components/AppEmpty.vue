<script setup lang="ts">
/**
 * 空态：一定要区分"从来没有数据"和"筛选后没结果"（J087），
 * 两种情况给的动作不一样，混成一个"暂无数据"是验收时最常被扣分的地方。
 */
withDefaults(
  defineProps<{
    variant?: 'first' | 'filtered'
    title?: string
    desc?: string
    icon?: string
  }>(),
  { variant: 'first', title: '', desc: '', icon: '' },
)
</script>

<template>
  <div class="empty">
    <span class="ico" aria-hidden="true">{{ icon || (variant === 'filtered' ? '🔍' : '🌱') }}</span>
    <p class="title">{{ title || (variant === 'filtered' ? '没有符合条件的结果' : '还没有数据') }}</p>
    <p>{{ desc || (variant === 'filtered' ? '换个筛选条件试试，或清除后重新查看' : '完成一次出行记录就能看到啦') }}</p>
    <div v-if="$slots.default" class="actions">
      <slot />
    </div>
  </div>
</template>
