<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'

/** 抽屉：从右侧滑入，用于"详情/编辑"这类不打断当前页的场景 */
const props = withDefaults(
  defineProps<{ modelValue: boolean; title?: string; closeable?: boolean }>(),
  { title: '', closeable: true },
)

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

function close() {
  if (!props.closeable) return
  emit('update:modelValue', false)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch(
  () => props.modelValue,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div class="mask" :class="{ on: modelValue }" @click="close"></div>
    <!-- 关闭时用 inert 把整块移出可交互/可聚焦范围：
         只改 class 的话，隐藏的按钮仍然能被 Tab 聚焦、被脚本点到 -->
    <aside
      class="drawer"
      :class="{ on: modelValue }"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      :aria-hidden="!modelValue || undefined"
      :inert="!modelValue || undefined"
    >
      <header class="drawer-head">
        <h3>{{ title }}</h3>
        <button type="button" class="close" aria-label="关闭" @click="close">×</button>
      </header>
      <div class="drawer-body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="drawer-foot">
        <slot name="footer" />
      </footer>
    </aside>
  </Teleport>
</template>
