<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppCard from '@/components/AppCard.vue'
import AppTag from '@/components/AppTag.vue'
import AppSelect from '@/components/AppSelect.vue'
import AppButton from '@/components/AppButton.vue'
import AppModal from '@/components/AppModal.vue'
import { listAdminProducts, updateProduct } from '@/api/admin'
import { errorMessage } from '@/api/http'
import { fmtPoints } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import type { Product } from '@/types'

const list = ref<Product[]>([])
const loading = ref(true)
const err = ref('')
const status = ref<'ALL' | 'ON' | 'OFF'>('ALL')

const statusOptions = [
  { value: 'ALL', label: '全部状态' },
  { value: 'ON', label: '上架中' },
  { value: 'OFF', label: '已下架' }
]

const { toast } = useToast()

async function load() {
  loading.value = true
  err.value = ''
  try {
    const page = await listAdminProducts({ page: 1, size: 50 })
    list.value = status.value === 'ALL' ? page.items : page.items.filter((p) => p.status === status.value)
  } catch (e) {
    err.value = errorMessage(e, '商品加载失败')
  } finally {
    loading.value = false
  }
}

/* ---------------- 编辑（积分单价 / 库存） ---------------- */
const editOpen = ref(false)
const saving = ref(false)
const formErr = ref('')
const editing = ref<Product | null>(null)
const form = ref({ points: 0, stock: 0 })

function openEdit(p: Product) {
  editing.value = p
  form.value = { points: p.points, stock: p.stock }
  formErr.value = ''
  editOpen.value = true
}

async function submitEdit() {
  if (!editing.value) return
  const points = Number(form.value.points)
  const stock = Number(form.value.stock)
  // 前端先挡一遍，减少一次无意义的往返；真正的校验在后端
  if (!Number.isInteger(points) || points < 1) {
    formErr.value = '积分单价必须是大于 0 的整数'
    return
  }
  if (!Number.isInteger(stock) || stock < 0) {
    formErr.value = '库存必须是不小于 0 的整数'
    return
  }
  saving.value = true
  formErr.value = ''
  try {
    const updated = await updateProduct(editing.value.productId, { points, stock })
    editOpen.value = false
    toast(`已保存：${updated.name}`)
    await load()
  } catch (e) {
    formErr.value = errorMessage(e, '保存失败，请重试')
  } finally {
    saving.value = false
  }
}

/* ---------------- 上下架 ---------------- */
const togglingId = ref('')

async function toggleStatus(p: Product) {
  togglingId.value = p.productId
  try {
    const next = p.status === 'ON' ? 'OFF' : 'ON'
    const updated = await updateProduct(p.productId, { status: next })
    toast(next === 'ON' ? `已上架：${updated.name}` : `已下架：${updated.name}（用户端立刻看不到）`)
    await load()
  } catch (e) {
    toast(errorMessage(e, '操作失败，请重试'))
  } finally {
    togglingId.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="admin-top">
      <div>
        <p class="crumb">管理端 / <b>商品管理</b></p>
        <h1>商品管理</h1>
        <p>可改积分单价与库存、可上下架；名称与图文维护仍在 P1</p>
      </div>
      <div style="width: 160px">
        <AppSelect v-model="status" :options="statusOptions" @update:model-value="load" />
      </div>
    </div>

    <div class="notice">
      改价只影响之后的兑换：已生成订单里存的是下单时的单价快照，不会被追溯修改。
    </div>

    <div v-if="loading" class="card"><div v-for="i in 5" :key="i" class="skel skel-row"></div></div>
    <div v-else-if="err" class="card" style="text-align: center">
      <p style="color: #be123c">{{ err }}</p>
      <button class="btn btn-secondary btn-sm" style="margin-top: 12px" @click="load">重试</button>
    </div>

    <AppCard v-else tight>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>商品编号</th>
              <th>商品名称</th>
              <th class="r">所需积分</th>
              <th class="r">库存</th>
              <th>状态</th>
              <th>说明</th>
              <th style="width: 150px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in list" :key="p.productId">
              <td class="mono">{{ p.productId }}</td>
              <td class="t-strong">{{ p.icon }} {{ p.name }}</td>
              <td class="r num">{{ fmtPoints(p.points) }}</td>
              <td class="r num">{{ p.stock }}</td>
              <td>
                <AppTag :tone="p.status === 'ON' ? 'green' : 'gray'">{{ p.status === 'ON' ? '上架中' : '已下架' }}</AppTag>
              </td>
              <td class="hint">{{ p.stock === 0 ? '库存不足，用户端置灰' : p.desc || '—' }}</td>
              <td>
                <div style="display: flex; gap: 8px">
                  <button class="btn btn-ghost btn-sm" type="button" @click="openEdit(p)">编辑</button>
                  <button
                    class="btn btn-ghost btn-sm"
                    type="button"
                    :disabled="togglingId === p.productId"
                    @click="toggleStatus(p)"
                  >
                    {{ p.status === 'ON' ? '下架' : '上架' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppCard>

    <AppModal v-model="editOpen" title="编辑商品" subtitle="只改价格与库存，改动会被记录" :closeable="!saving">
      <div v-if="editing" class="stack">
        <div class="notice" style="margin: 0">{{ editing.icon }} {{ editing.name }}（{{ editing.productId }}）</div>
        <div class="field">
          <label for="points">所需积分<span class="req">*</span></label>
          <input id="points" v-model.number="form.points" class="input num" type="number" min="1" step="1" />
          <p class="hint">正整数。改价不影响已生成订单（订单里存的是快照单价）</p>
        </div>
        <div class="field">
          <label for="stock">库存<span class="req">*</span></label>
          <input id="stock" v-model.number="form.stock" class="input num" type="number" min="0" step="1" />
          <p class="hint">0 表示暂时兑完，用户端会置灰但仍可见</p>
        </div>
        <p v-if="formErr" class="err-msg">{{ formErr }}</p>
      </div>
      <template #footer>
        <AppButton variant="secondary" :disabled="saving" @click="editOpen = false">取消</AppButton>
        <AppButton variant="primary" :loading="saving" @click="submitEdit">保存</AppButton>
      </template>
    </AppModal>
  </div>
</template>
