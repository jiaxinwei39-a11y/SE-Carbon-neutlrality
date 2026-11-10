<script setup lang="ts">
/**
 * 按钮
 * 关键点：loading 时按钮宽度不变（内容用 visibility 藏起来），
 * 否则点了之后布局会跳一下，这是体验细节也是验收点。
 */
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', size: 'md', block: false, loading: false, disabled: false, type: 'button' },
)

const emit = defineEmits<{ click: [MouseEvent] }>()

function onClick(e: MouseEvent) {
  emit('click', e)
}
</script>

<template>
  <button
    :type="type"
    class="btn"
    :class="[`btn-${variant}`, size !== 'md' ? `btn-${size}` : '', block ? 'btn-block' : '', loading ? 'loading' : '']"
    :disabled="disabled || loading"
    :aria-busy="loading"
    @click="onClick"
  >
    <span v-if="loading" class="spin" aria-hidden="true"></span>
    <slot />
  </button>
</template>
