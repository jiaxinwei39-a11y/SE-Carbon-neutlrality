<script setup lang="ts">
import AppCard from '@/components/AppCard.vue'
import TripForm from '@/components/TripForm.vue'

/** 独立的上报页（P03）：规格 D-02 要求这个表单能独立成页，也能从首页直达 */
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>上报行程</h1>
        <p>填写本次绿色出行信息，提交后由服务端核算减排量与积分</p>
      </div>
      <router-link to="/app/trips" class="btn btn-secondary btn-sm" style="text-decoration: none">我的行程</router-link>
    </div>

    <AppCard>
      <TripForm />
    </AppCard>
  </div>
</template>
