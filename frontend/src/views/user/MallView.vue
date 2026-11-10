<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppCard from '@/components/AppCard.vue'
import AppEmpty from '@/components/AppEmpty.vue'
import AppPagination from '@/components/AppPagination.vue'
import AppInput from '@/components/AppInput.vue'
import { listProducts } from '@/api/mall'
import { getPointsAccount } from '@/api/points'
import { errorMessage } from '@/api/http'
import { fmtPoints } from '@/utils/format'
import { PAGE_SIZE } from '@/utils/constants'
import type { PointsAccount, Product } from '@/types'

const router = useRouter()

const products = ref<Product[]>([])
const total = ref(0)
const page = ref(1)
const keyword = ref('')
const loading = ref(true)
const err = ref('')
const account = ref<PointsAccount | null>(null)

async function load() {
  loading.value = true
  err.value = ''
  try {
    const res = await listProducts({ page: page.value, size: 8, keyword: keyword.value || undefined })
    products.value = res.items
    total.value = res.total
  } catch (e) {
    err.value = errorMessage(e, '商品加载失败')
  } finally {
    loading.value = false
  }
}

async function loadAccount() {
  try {
    account.value = await getPointsAccount()
  } catch {
    /* 余额只是辅助信息，失败不影响逛商城 */
  }
}

function search() {
  page.value = 1
  void load()
}

watch(page, load)
onMounted(() => {
  void load()
  void loadAccount()
})

function open(p: Product) {
  if (p.stock <= 0) return
  router.push({ name: 'product', params: { productId: p.productId } })
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>积分商城</h1>
        <p>用出行攒下的积分兑换礼品，兑换成功后可在「我的订单」查看发放进度</p>
      </div>
      <router-link to="/app/orders" class="btn btn-secondary btn-sm" style="text-decoration: none">我的订单</router-link>
    </div>

    <div v-if="account" class="balance-strip">
      <span>当前可用</span>
      <strong class="num">{{ fmtPoints(account.balance) }} 分</strong>
      <span style="margin-left: auto; font-size: 12px">积分不足时，商品会提示还差多少分</span>
    </div>

    <div class="filters">
      <div style="width: 240px">
        <AppInput v-model="keyword" placeholder="搜索礼品名称" @enter="search" />
      </div>
      <button class="btn btn-primary btn-sm" type="button" @click="search">搜索</button>
      <span class="hint" style="margin-left: auto">共 {{ total }} 件礼品</span>
    </div>

    <!-- 加载：用卡片骨架铺满网格，避免页面高度塌陷 -->
    <div v-if="loading" class="grid-goods">
      <div v-for="i in 8" :key="i" class="skel skel-card"></div>
    </div>

    <AppCard v-else-if="err">
      <div class="empty">
        <p class="title">{{ err }}</p>
        <button class="btn btn-secondary btn-sm" style="margin-top: 12px" @click="load">重新加载</button>
      </div>
    </AppCard>

    <AppEmpty
      v-else-if="products.length === 0"
      :variant="keyword ? 'filtered' : 'first'"
      :title="keyword ? '没有找到相关礼品' : '商城暂时没有可兑换的礼品'"
      :desc="keyword ? '换个关键词试试' : '等运营上新后再来看看'"
    >
      <button v-if="keyword" class="btn btn-secondary btn-sm" @click="keyword = ''; search()">清除搜索</button>
    </AppEmpty>

    <template v-else>
      <div class="grid-goods">
        <article
          v-for="p in products"
          :key="p.productId"
          class="goods"
          :class="{ disabled: p.stock <= 0 }"
          :aria-disabled="p.stock <= 0"
          tabindex="0"
          @click="open(p)"
          @keydown.enter="open(p)"
        >
          <div class="cover" aria-hidden="true">{{ p.icon }}</div>
          <div class="info">
            <div class="name">{{ p.name }}</div>
            <div class="foot">
              <span class="price num">{{ fmtPoints(p.points) }}<small>分</small></span>
              <span class="stock">{{ p.stock > 0 ? `库存 ${p.stock}` : '已售罄' }}</span>
            </div>
          </div>
        </article>
      </div>
      <div style="margin-top: 8px; background: #fff; border-radius: 14px; border: 1px solid #e8eef5">
        <AppPagination v-model:page="page" :size="PAGE_SIZE" :total="total" />
      </div>
    </template>
  </div>
</template>
