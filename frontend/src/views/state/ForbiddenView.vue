<script setup lang="ts">
import { useRouter } from 'vue-router'

/** 403：登录了但没有权限（比如普通用户直接输 /admin/dashboard） */
const router = useRouter()
</script>

<template>
  <div class="state-page" style="min-height: 100vh; display: flex; flex-direction: column; justify-content: center">
    <div class="code">403</div>
    <p class="msg">当前账号没有访问该页面的权限</p>
    <div style="display: flex; gap: 10px; justify-content: center">
      <button class="btn btn-primary" type="button" @click="router.replace('/app')">回到用户端</button>
      <button class="btn btn-secondary" type="button" @click="router.back()">返回上一页</button>
    </div>
    <p class="hint" style="margin-top: 22px">演示提示：用 admin / 123456 登录可以进入管理端</p>
  </div>
</template>
