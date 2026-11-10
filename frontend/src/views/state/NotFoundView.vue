<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="state-page" style="min-height: 100vh; display: flex; flex-direction: column; justify-content: center">
    <div class="code">404</div>
    <p class="msg">页面不存在，可能是链接输错了</p>
    <div style="display: flex; gap: 10px; justify-content: center">
      <button class="btn btn-primary" type="button" @click="router.replace('/app')">回到首页</button>
      <button class="btn btn-secondary" type="button" @click="router.back()">返回上一页</button>
    </div>
  </div>
</template>
