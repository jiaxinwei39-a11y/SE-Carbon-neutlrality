<script setup lang="ts">
import AppToast from '@/components/AppToast.vue'
</script>

<template>
  <!-- 页面外壳由各 layout 提供，这里只留一个出口 + 全局 toast -->
  <router-view />
  <AppToast />
</template>
