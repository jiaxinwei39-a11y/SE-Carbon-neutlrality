<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '@/components/AppButton.vue'
import AppInput from '@/components/AppInput.vue'
import { useUserStore } from '@/stores/user'
import { useToast } from '@/composables/useToast'
import { errorMessage } from '@/api/http'

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const { toast } = useToast()

const account = ref('13800138000')
const password = ref('123456')
const err = ref('')

async function submit() {
  if (store.loading) return
  err.value = ''
  if (!account.value.trim() || !password.value) {
    err.value = '请输入账号和密码'
    return
  }
  try {
    const user = await store.login(account.value.trim(), password.value)
    toast(`欢迎回来，${user.nickname}`)
    // 登录后回跳原地址（J089：401 回登录后可回到原目标）
    const redirect = route.query.redirect
    const target = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : user.role === 'ADMIN' ? '/admin/dashboard' : '/app'
    router.replace(target)
  } catch (e) {
    err.value = errorMessage(e, '登录失败，请重试')
  }
}
</script>

<template>
  <div class="auth">
    <section class="auth-left">
      <div class="brand" style="color: #fff; font-size: 16px">
        <span class="mark" aria-hidden="true">🌿</span>
        绿色出行 · 碳积分
      </div>
      <h1>每一次绿色出行<br />都值得被记录</h1>
      <p>上报公交、地铁、骑行与步行行程，系统按减排因子核算碳减排量与积分，积分可在商城兑换礼品。</p>
      <div class="auth-feats">
        <div><strong class="num">0.2</strong>基准排放因子</div>
        <div><strong class="num">10</strong>积分 / kg</div>
        <div><strong class="num">4</strong>种绿色方式</div>
      </div>
    </section>

    <section class="auth-right">
      <div class="auth-card">
        <h2>登录</h2>
        <p class="lead">使用手机号或管理员账号登录体验完整流程</p>

        <form @submit.prevent="submit">
          <div class="field">
            <label for="account">账号</label>
            <AppInput id="account" v-model="account" placeholder="手机号 / admin" :error="!!err" />
          </div>
          <div class="field">
            <label for="password">密码</label>
            <AppInput id="password" v-model="password" type="password" placeholder="请输入密码" :error="!!err" @enter="submit" />
          </div>

          <div class="auth-row">
            <span class="hint">演示环境，账号密码已预填</span>
            <router-link to="/register">注册新账号</router-link>
          </div>

          <p v-if="err" class="err-msg" style="margin-bottom: 12px">{{ err }}</p>

          <AppButton type="submit" block :loading="store.loading">登录</AppButton>
        </form>

        <div class="demo">
          演示账号：<b>13800138000</b> / 密码 <b>123456</b>（普通用户）<br />
          管理端：<b>admin</b> / 密码 <b>123456</b><br />
          <span style="opacity: 0.8">当前为前端演示版，数据来自本地 mock，未连接真实后端</span>
        </div>
      </div>
    </section>
  </div>
</template>
