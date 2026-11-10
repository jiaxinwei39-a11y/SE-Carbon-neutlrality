<script setup lang="ts">
/**
 * 表格容器：只负责表头/骨架/空态这些"每张表都要写一遍"的东西，
 * 单元格内容交给具名插槽 cell-<key>，比塞字符串模板更灵活。
 */
export interface TableColumn {
  key: string
  title: string
  align?: 'left' | 'right'
  width?: string
}

withDefaults(
  defineProps<{
    columns: TableColumn[]
    rows: Record<string, unknown>[]
    rowKey?: string
    loading?: boolean
    emptyText?: string
  }>(),
  { rowKey: 'id', loading: false, emptyText: '暂无数据' },
)
</script>

<template>
  <div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th v-for="c in columns" :key="c.key" :style="c.width ? { width: c.width } : undefined" :class="{ r: c.align === 'right' }">
            {{ c.title }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td :colspan="columns.length">
            <div class="skel skel-row" style="width: 100%"></div>
            <div class="skel skel-row" style="width: 100%"></div>
          </td>
        </tr>
        <tr v-else-if="rows.length === 0">
          <td :colspan="columns.length">
            <div class="empty" style="padding: 32px 0">{{ emptyText }}</div>
          </td>
        </tr>
        <tr v-else v-for="(row, index) in rows" :key="String(row[rowKey] ?? index)">
          <td v-for="c in columns" :key="c.key" :class="{ r: c.align === 'right' }">
            <slot :name="`cell-${c.key}`" :row="row" :index="index">
              {{ row[c.key] ?? '--' }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
