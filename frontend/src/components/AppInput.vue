<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string | number
    type?: string
    placeholder?: string
    disabled?: boolean
    error?: boolean
    id?: string
    maxlength?: number
    inputmode?: 'text' | 'decimal' | 'numeric' | 'tel'
    textarea?: boolean
    rows?: number
  }>(),
  { type: 'text', placeholder: '', disabled: false, error: false, textarea: false, rows: 3 },
)

const emit = defineEmits<{ 'update:modelValue': [string]; blur: [FocusEvent]; enter: [] }>()

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <textarea
    v-if="textarea"
    :id="id"
    class="textarea"
    :class="{ err: error }"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :rows="rows"
    :aria-invalid="error"
    @input="onInput"
    @blur="emit('blur', $event)"
  ></textarea>
  <input
    v-else
    :id="id"
    class="input"
    :class="{ err: error }"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :maxlength="maxlength"
    :inputmode="inputmode"
    :aria-invalid="error"
    @input="onInput"
    @blur="emit('blur', $event)"
    @keyup.enter="emit('enter')"
  />
</template>
