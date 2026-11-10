<script setup lang="ts">
withDefaults(defineProps<{ title?: string; hint?: string; tight?: boolean }>(), {
  title: '',
  hint: '',
  tight: false,
})
</script>

<template>
  <section class="card" :class="{ tight }">
    <header v-if="title || $slots.actions" class="card-head">
      <h2>{{ title }}</h2>
      <span v-if="hint" class="hint">{{ hint }}</span>
      <slot name="actions" />
    </header>
    <slot />
  </section>
</template>
