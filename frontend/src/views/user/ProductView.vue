<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppCard from '@/components/AppCard.vue'
import AppButton from '@/components/AppButton.vue'
import AppModal from '@/components/AppModal.vue'
import AppSkeleton from '@/components/AppSkeleton.vue'
import { getProduct, redeem } from '@/api/mall'
import { getPointsAccount } from '@/api/points'
import { errorMessage, isApiError } from '@/api/http'
import { useToast } from '@/composables/useToast'
import { fmtPoints } from '@/utils/format'
import type { PointsAccount, Product } from '@/types'

const route = useRoute()
const router = useRouter()
const { toast } = useToast()

const product = ref<Product | null>(null)
const account = ref<PointsAccount | null>(null)
const loading = ref(true)
const err = ref('')
const notFound = ref(false)

const quantity = ref(1)
const modalOpen = ref(false)
const submitting = ref(false)
const modalErr = ref('')
/** 一次兑换意图一个 requestId，重试复用（J036） */
const requestId = ref('')

const balance = computed(() => account.value?.balance ?? 0)
const totalPoints = computed(() => (product.value ? product.value.points * quantity.value : 0))
const affordable = computed(() => balance.value >= totalPoints.value)
const soldOut = computed(() => (product.value?.stock ?? 0) <= 0)
const maxQty = computed(() => {
  if (!product.value) return 1
  const byPoints = Math.floor(balance.value / product.value.points)
  return Math.max(1, Math.min(product.value.stock, byPoints || 1))
})
const shortfall = computed(() => Math.max(0, totalPoints.value - balance.value))

async function load() {
  loading.value = true
  err.value = ''
  notFound.value = false
  try {
    const [p, acc] = await Promise.all([getProduct(String(route.params.productId)), getPointsAccount()])
    product.value = p
    account.value = acc
  } catch (e) {
    if (isApiError(e) && e.httpStatus === 404) notFound.value = true
    err.value = errorMessage(e, '商品详情加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

function step(delta: number) {
  const next = quantity.value + delta
  if (next < 1 || next > maxQty.value) return
  quantity.value = next
}

function openModal() {
  if (soldOut.value || !affordable.value) return
  modalErr.value = ''
  // 打开弹窗时生成一次，提交失败重试时复用
  requestId.value = `RD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  modalOpen.value = true
}

async function confirmRedeem() {
  if (!product.value || submitting.value) return
  submitting.value = true
  modalErr.value = ''
  try {
    const order = await redeem({ productId: product.value.productId, quantity: quantity.value }, requestId.value)
    modalOpen.value = false
    toast(`兑换成功，订单 ${order.orderId}`)
    router.push({ name: 'orders', query: { orderId: order.orderId } })
  } catch (e) {
    // 409 说明库存/状态变了，必须刷新真实数据，而不是让用户反复点
    if (isApiError(e) && e.httpStatus === 409) {
      modalErr.value = `${errorMessage(e)}（已为你刷新最新库存）`
      await load()
    } else {
      modalErr.value = errorMessage(e, '兑换失败，请重试')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <p class="crumb">
      <router-link to="/app/mall" style="color: #64748b">积分商城</router-link> / <b>商品详情</b>
    </p>

    <AppCard v-if="loading"><AppSkeleton :rows="6" /></AppCard>

    <AppCard v-else-if="notFound">
      <div class="empty">
        <span class="ico">🎁</span>
        <p class="title">商品不存在或已下架</p>
        <div class="actions">
          <router-link to="/app/mall" class="btn btn-primary btn-sm" style="text-decoration: none">回到商城</router-link>
        </div>
      </div>
    </AppCard>

    <AppCard v-else-if="err">
      <div class="empty">
        <p class="title">{{ err }}</p>
        <button class="btn btn-secondary btn-sm" @click="load">重试</button>
      </div>
    </AppCard>

    <div v-else-if="product" class="grid-main">
      <AppCard>
        <div style="display: flex; gap: 22px">
          <div
            style="width: 180px; height: 180px; border-radius: 16px; background: linear-gradient(150deg, #f0fdf4, #ecfdf5); display: flex; align-items: center; justify-content: center; font-size: 72px"
            aria-hidden="true"
          >
            {{ product.icon }}
          </div>
          <div style="flex: 1">
            <h1 style="font-size: 22px">{{ product.name }}</h1>
            <p class="hint" style="margin-top: 8px">{{ product.desc || '暂无商品描述' }}</p>
            <div style="display: flex; align-items: baseline; gap: 10px; margin: 18px 0">
              <span class="num" style="font-size: 28px; font-weight: 700; color: #059669">{{ fmtPoints(product.points) }}</span>
              <span style="font-size: 13px; color: #64748b">积分 / 件</span>
              <span class="tag" :class="soldOut ? 'tag-gray' : 'tag-green'" style="margin-left: 8px">
                {{ soldOut ? '已售罄' : `库存 ${product.stock}` }}
              </span>
            </div>
            <p class="hint">当前可用 {{ fmtPoints(balance) }} 分</p>
          </div>
        </div>
      </AppCard>

      <AppCard title="兑换">
        <div class="field">
          <label>兑换数量</label>
          <div class="stepper">
            <button type="button" :disabled="quantity <= 1 || soldOut" aria-label="减少数量" @click="step(-1)">−</button>
            <input :value="quantity" readonly aria-label="兑换数量" />
            <button type="button" :disabled="quantity >= maxQty || soldOut" aria-label="增加数量" @click="step(1)">＋</button>
          </div>
          <p class="hint">最多可换 {{ maxQty }} 件（受库存与积分限制）</p>
        </div>

        <div class="factor-grid" style="grid-template-columns: 1fr; margin-top: 8px">
          <div class="factor-row"><span>单价</span><b class="num">{{ fmtPoints(product.points) }} 分</b></div>
          <div class="factor-row"><span>合计</span><b class="num">{{ fmtPoints(totalPoints) }} 分</b></div>
          <div class="factor-row"><span>兑换后余额</span><b class="num">{{ fmtPoints(balance - totalPoints) }} 分</b></div>
        </div>

        <p v-if="soldOut" class="err-msg" style="margin-top: 14px">该礼品已售罄，暂时无法兑换</p>
        <p v-else-if="!affordable" class="err-msg" style="margin-top: 14px">
          积分不足，还差 {{ fmtPoints(shortfall) }} 分。继续绿色出行可以攒积分
        </p>

        <div style="margin-top: 18px">
          <AppButton block :disabled="soldOut || !affordable" @click="openModal">立即兑换</AppButton>
          <router-link
            v-if="!affordable && !soldOut"
            to="/app/trips/new"
            class="btn btn-secondary btn-sm btn-block"
            style="margin-top: 10px; text-decoration: none"
            >去攒积分</router-link
          >
        </div>
      </AppCard>
    </div>

    <AppModal
      v-model="modalOpen"
      title="确认兑换"
      subtitle="兑换后积分立即扣除，可在「我的订单」中查看发放进度"
      :closeable="!submitting"
    >
      <div class="confirm-row"><span>礼品</span><b>{{ product?.name }}</b></div>
      <div class="confirm-row"><span>数量</span><b class="num">{{ quantity }}</b></div>
      <div class="confirm-row"><span>消耗积分</span><b class="num">{{ fmtPoints(totalPoints) }} 分</b></div>
      <div class="confirm-row" style="border-bottom: 0">
        <span>兑换后余额</span><b class="num">{{ fmtPoints(balance - totalPoints) }} 分</b>
      </div>
      <p v-if="modalErr" class="err-msg">{{ modalErr }}</p>

      <template #footer>
        <AppButton variant="secondary" :disabled="submitting" @click="modalOpen = false">取消</AppButton>
        <AppButton :loading="submitting" @click="confirmRedeem">确认兑换</AppButton>
      </template>
    </AppModal>
  </div>
</template>
