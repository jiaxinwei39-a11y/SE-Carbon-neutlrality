<script setup lang="ts">
import { ref } from 'vue'
import AppButton from '@/components/AppButton.vue'
import AppInput from '@/components/AppInput.vue'
import { useToast } from '@/composables/useToast'

/**
 * 注册页：规格里属于 P1，演示版没有注册接口。
 * 这里保留表单结构，但提交时明确提示"未接入"，绝不假装注册成功。
 */
const { toast } = useToast()
const phone = ref('')
const password = ref('')
const confirm = ref('')
const err = ref('')

function submit() {
  err.value = ''
  if (!/^1\d{10}$/.test(phone.value.trim())) {
    err.value = '请输入 11 位手机号'
    return
  }
  if (password.value.length < 6) {
    err.value = '密码至少 6 位'
    return
  }
  if (password.value !== confirm.value) {
    err.value = '两次输入的密码不一致'
    return
  }
  toast('演示版尚未接入注册接口，请使用登录页的演示账号')
}
</script>

<template>
  <div class="auth">
    <section class="auth-left">
      <div class="brand" style="color: #fff; font-size: 16px">
        <span class="mark" aria-hidden="true">🌿</span>
        绿色出行 · 碳积分
      </div>
      <h1>加入绿色出行<br />把减排变成积分</h1>
      <p>注册后即可上报行程、查看核算明细、在商城兑换礼品。演示版使用本地 mock 数据。</p>
    </section>

    <section class="auth-right">
      <div class="auth-card">
        <h2>注册</h2>
        <p class="lead">演示版仅保留表单结构，真实注册由后端提供</p>

        <form @submit.prevent="submit">
          <div class="field">
            <label for="phone">手机号</label>
            <AppInput id="phone" v-model="phone" placeholder="11 位手机号" :error="!!err" />
          </div>
          <div class="field">
            <label for="pwd">密码</label>
            <AppInput id="pwd" v-model="password" type="password" placeholder="至少 6 位" />
          </div>
          <div class="field">
            <label for="pwd2">确认密码</label>
            <AppInput id="pwd2" v-model="confirm" type="password" placeholder="再输入一次" @enter="submit" />
          </div>

          <p v-if="err" class="err-msg">{{ err }}</p>
          <p v-else class="hint" style="margin-bottom: 14px">提示：本页暂未对接注册接口，提交只会给出提示</p>

          <AppButton type="submit" block>提交注册</AppButton>
        </form>

        <div class="auth-row" style="margin-top: 18px">
          <span class="hint">已有账号？</span>
          <router-link to="/login">返回登录</router-link>
        </div>
      </div>
    </section>
  </div>
</template>
