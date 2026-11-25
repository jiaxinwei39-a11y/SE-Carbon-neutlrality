<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppButton from '@/components/AppButton.vue'
import AppInput from '@/components/AppInput.vue'
import { useToast } from '@/composables/useToast'
import { useUserStore } from '@/stores/user'
import { errorMessage } from '@/api/http'

/**
 * 注册页：POST /auth/register，成功后后端直接返回 { token, user }，
 * 所以注册完即为登录态，直接进用户端（与真后端行为一致）。
 *
 * 前端先拦一遍格式，最终以后端为准：
 *   手机号 ^1\d{10}$ → 40013；密码 6~32 位 → 40012；手机号已占用 → 40906
 */
const router = useRouter()
const store = useUserStore()
const { toast } = useToast()

const phone = ref('')
const nickname = ref('')
const password = ref('')
const confirm = ref('')
const err = ref('')
const submitting = ref(false)

const phoneOk = computed(() => /^1\d{10}$/.test(phone.value.trim()))

async function submit(): Promise<void> {
  if (submitting.value) return
  err.value = ''

  if (!phoneOk.value) {
    err.value = '请输入 11 位手机号'
    return
  }
  if (password.value.length < 6 || password.value.length > 32) {
    err.value = '密码长度需为 6-32 位'
    return
  }
  if (password.value !== confirm.value) {
    err.value = '两次输入的密码不一致'
    return
  }

  submitting.value = true
  try {
    const user = await store.register(phone.value.trim(), password.value, nickname.value.trim() || undefined)
    toast(`注册成功，欢迎你，${user.nickname}`)
    router.replace({ name: 'home' })
  } catch (e) {
    // 40906 / 40012 / 40013 的提示语后端已经写好，直接展示
    err.value = errorMessage(e, '注册失败，请稍后重试')
  } finally {
    submitting.value = false
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
      <h1>加入绿色出行<br />把减排变成积分</h1>
      <p>注册后即可上报行程、查看核算明细、在商城兑换礼品。新账号从 0 积分开始。</p>
    </section>

    <section class="auth-right">
      <div class="auth-card">
        <h2>注册</h2>
        <p class="lead">手机号 + 密码即可，昵称可以不填</p>

        <form @submit.prevent="submit">
          <div class="field">
            <label for="phone">手机号</label>
            <AppInput
              id="phone"
              v-model="phone"
              placeholder="11 位手机号"
              inputmode="numeric"
              :maxlength="11"
            />
          </div>
          <div class="field">
            <label for="nickname">昵称（选填）</label>
            <AppInput id="nickname" v-model="nickname" placeholder="不填则用手机号生成" :maxlength="20" />
          </div>
          <div class="field">
            <label for="pwd">密码</label>
            <AppInput id="pwd" v-model="password" type="password" placeholder="6-32 位" />
          </div>
          <div class="field">
            <label for="pwd2">确认密码</label>
            <AppInput id="pwd2" v-model="confirm" type="password" placeholder="再输入一次" @enter="submit" />
          </div>

          <p v-if="err" class="err-msg">{{ err }}</p>
          <p v-else class="hint" style="margin-bottom: 14px">注册成功会直接进入首页</p>

          <AppButton type="submit" block :loading="submitting">
            {{ submitting ? '注册中…' : '提交注册' }}
          </AppButton>
        </form>

        <div class="auth-row" style="margin-top: 18px">
          <span class="hint">已有账号？</span>
          <router-link to="/login">返回登录</router-link>
        </div>
      </div>
    </section>
  </div>
</template>
