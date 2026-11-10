/**
 * 极简全局 toast
 * 为什么不用第三方库：这股 demo 只需要"一句话提示"，自己 30 行就够，
 * 也省得为了一个提示引一整个组件库。
 */
import { ref } from 'vue'

const text = ref('')
const visible = ref(false)
let timer: number | undefined

export function useToast() {
  function toast(message: string, duration = 2400): void {
    text.value = message
    visible.value = true
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      visible.value = false
    }, duration)
  }
  return { text, visible, toast }
}
