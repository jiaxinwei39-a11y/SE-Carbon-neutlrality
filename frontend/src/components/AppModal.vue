<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'

/**
 * 模态框（用 Teleport 挂到 body，避免被父级 overflow 裁掉）
 * 关闭方式：点遮罩 / 按 Esc / 点取消；提交中禁止关闭（由父组件控制 closeable）
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    subtitle?: string
    wide?: boolean
    closeable?: boolean
  }>(),
  { title: '', subtitle: '', wide: false, closeable: true },
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
    <div
      class="modal"
      :class="{ on: modelValue, wide }"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <h3 v-if="title">{{ title }}</h3>
      <p v-if="subtitle" class="m-sub">{{ subtitle }}</p>
      <slot />
      <div v-if="$slots.footer" class="modal-foot">
        <slot name="footer" />
      </div>
    </div>
  </Teleport>
</template>
