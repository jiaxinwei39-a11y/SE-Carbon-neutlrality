<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    page: number
    size: number
    total: number
  }>(),
  {},
)

const emit = defineEmits<{ 'update:page': [number] }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.size)))

/** 最多显示 5 个页码，中间用省略号，避免 100 页时把工具栏撑爆 */
const pages = computed<number[]>(() => {
  const total = totalPages.value
  const cur = props.page
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const start = Math.max(1, Math.min(cur - 2, total - 4))
  return Array.from({ length: 5 }, (_, i) => start + i)
})

function go(p: number) {
  if (p < 1 || p > totalPages.value || p === props.page) return
  emit('update:page', p)
}
</script>

<template>
  <div class="pager">
    <span>共 {{ total }} 条 · 第 {{ page }}/{{ totalPages }} 页</span>
    <div class="pages">
      <button type="button" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
      <button
        v-for="p in pages"
        :key="p"
        type="button"
        :class="{ on: p === page }"
        :aria-current="p === page ? 'page' : undefined"
        @click="go(p)"
      >
        {{ p }}
      </button>
      <button type="button" :disabled="page >= totalPages" @click="go(page + 1)">下一页</button>
    </div>
  </div>
</template>
