/**
 * 极简假后端：只为了验证「真实 HTTP 401」这条路径。
 *
 * 为什么需要它：
 *   mock 模式是前端内存里的假接口，401 是直接 throw 出来的，**不经过 axios 拦截器**，
 *   所以「迟到 401 不踢新会话」这条在 mock 下只能证明逻辑对，不能证明网络路径对。
 *   这里起一个真的 HTTP 服务，用 api 模式打包的页面去打它，才算真的走了 axios。
 *
 * 只实现登录 + 两个只读接口 + 一个故意慢的 401，够用即可。
 * 用法：node tools/stub-api.mjs [port]
 *      或 import { startStub } from './tools/stub-api.mjs'
 */
import http from 'node:http'

const USER = {
  id: 'U001',
  nickname: '张生阳',
  phone: '13800138000',
  role: 'USER',
  avatarText: '张',
  points: 837,
}

export function startStub(port = 8899) {
  let seq = 0
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    const path = url.pathname.replace(/^\/api/, '')

    /* ---------- CORS：api 模式是 file:// 页面跨域打过来，必须放行 ---------- */
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Idempotency-Key')
    res.setHeader('Access-Control-Max-Age', '600')
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }
    /** 统一的成功壳，和契约一致 */
    const ok = (data) => json(200, { code: 0, message: 'ok', data })

    // 故意慢的 401：mode=http → 真 HTTP 401；mode=biz → HTTP 200 + 业务码 40100
    if (path === '/_debug/slow401') {
      const ms = Number(url.searchParams.get('ms') ?? 1200)
      const mode = url.searchParams.get('mode') === 'biz' ? 'biz' : 'http'
      await new Promise((r) => setTimeout(r, ms))
      if (mode === 'biz') return json(200, { code: 40100, message: '登录已过期，请重新登录', data: null })
      return json(401, { code: 40100, message: '登录已过期，请重新登录', data: null })
    }

    // 登录：**每次签发不同的 token**（契约 §1.3 的硬要求，前端靠它识别旧会话）
    if (path === '/auth/login' && req.method === 'POST') {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      if (body.password !== '123456') return json(400, { code: 40001, message: '账号或密码不正确', data: null })
      return ok({ token: `stub-token-${++seq}-${Date.now()}`, user: { ...USER, phone: body.account ?? USER.phone } })
    }

    if (path === '/auth/me') return ok(USER)
    if (path === '/points/account')
      return ok({ balance: 837, totalEarned: 1737, totalSpent: 900, tripCount: 20, totalReductionKg: 25.39 })
    if (path === '/points/flows') return ok({ items: [], total: 0, page: 1, size: 10 })

    json(404, { code: 40400, message: `stub 未实现：${req.method} ${path}`, data: null })
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

// 直接跑：node tools/stub-api.mjs 8899
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const port = Number(process.argv[2] ?? 8899)
  await startStub(port)
  console.log(`stub api listening on http://127.0.0.1:${port}/api`)
}
