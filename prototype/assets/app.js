/* 绿行积分 · 原型公共脚本（静态模拟数据，无后端） */

const MOCK = {
  user: { nickname: '生阳', username: 'shengyang', role: 'USER', points: 1280 },

  trips: [
    { id: 'T20261110001', mode: 'BUS', modeName: '公交', icon: '🚌', distance: 10.0, reduction: 1.5, points: 15, date: '11-10 08:12', status: 'POINTED' },
    { id: 'T20261109002', mode: 'SUBWAY', modeName: '地铁', icon: '🚇', distance: 6.4, reduction: 0.9, points: 9, date: '11-09 18:40', status: 'POINTED' },
    { id: 'T20261109001', mode: 'BIKE', modeName: '骑行', icon: '🚲', distance: 3.2, reduction: 0.64, points: 6, date: '11-09 07:55', status: 'POINTED' },
    { id: 'T20261108001', mode: 'WALK', modeName: '步行', icon: '🚶', distance: 1.8, reduction: 0.36, points: 3, date: '11-08 20:05', status: 'POINTED' },
    { id: 'T20261107001', mode: 'BUS', modeName: '公交', icon: '🚌', distance: 0.333, reduction: 0.04995, points: 0, date: '11-07 09:30', status: 'POINTED' }
  ],

  ledger: [
    { type: 'REDEMPTION_DEBIT', title: '兑换 咖啡券', time: '11-10 12:02', change: -300, balance: 1280 },
    { type: 'TRIP_GRANT', title: '公交出行 · 10.0 km', time: '11-10 08:12', change: 15, balance: 1580 },
    { type: 'TRIP_GRANT', title: '地铁出行 · 6.4 km', time: '11-09 18:40', change: 9, balance: 1565 },
    { type: 'REDEMPTION_REVERSAL', title: '订单取消 · 冲正', time: '11-09 10:20', change: 120, balance: 1556 },
    { type: 'REDEMPTION_DEBIT', title: '兑换 帆布袋', time: '11-08 15:33', change: -120, balance: 1436 },
    { type: 'TRIP_GRANT', title: '骑行出行 · 3.2 km', time: '11-08 07:55', change: 6, balance: 1556 }
  ],

  products: [
    { id: 'P01', name: '咖啡兑换券', points: 300, stock: 42, icon: '☕', desc: '合作门店中杯美式一杯，兑换后 30 天内有效。' },
    { id: 'P02', name: '环保帆布袋', points: 120, stock: 8, icon: '👜', desc: '再生棉材质，容量 12L，随机配色。' },
    { id: 'P03', name: '地铁 5 次卡', points: 500, stock: 15, icon: '🚇', desc: '市内地铁 5 次乘车权益，不与学生优惠叠加。' },
    { id: 'P04', name: '共享单车月卡', points: 800, stock: 0, icon: '🚲', desc: '30 天不限次骑行，每次前 2 小时免费。' },
    { id: 'P05', name: '保温杯', points: 650, stock: 21, icon: '🍵', desc: '316 不锈钢内胆，500ml。' },
    { id: 'P06', name: '树苗认养证书', points: 200, stock: 99, icon: '🌱', desc: '以你的名字在合作林场认养一棵树苗。' }
  ],

  orders: [
    { id: 'O20261110001', product: '咖啡兑换券', icon: '☕', points: 300, qty: 1, status: 'CREATED', statusName: '待处理', time: '11-10 12:02' },
    { id: 'O20261108002', product: '环保帆布袋', icon: '👜', points: 120, qty: 1, status: 'FULFILLED', statusName: '已履约', time: '11-08 15:33' },
    { id: 'O20261106001', product: '保温杯', icon: '🍵', points: 650, qty: 1, status: 'CANCELLED', statusName: '已取消', time: '11-06 09:10' }
  ],

  rules: [
    { id: 'R-2026-11', mode: 'BUS', modeName: '公交', base: 0.2, factor: 0.05, ratio: 10, from: '2026-11-01', to: '—', status: '生效中' },
    { id: 'R-2026-11', mode: 'SUBWAY', modeName: '地铁', base: 0.2, factor: 0.04, ratio: 10, from: '2026-11-01', to: '—', status: '生效中' },
    { id: 'R-2026-11', mode: 'BIKE', modeName: '骑行', base: 0.2, factor: 0.0, ratio: 10, from: '2026-11-01', to: '—', status: '生效中' },
    { id: 'R-2026-11', mode: 'WALK', modeName: '步行', base: 0.2, factor: 0.0, ratio: 10, from: '2026-11-01', to: '—', status: '生效中' },
    { id: 'R-2026-10', mode: 'BUS', modeName: '公交', base: 0.2, factor: 0.05, ratio: 10, from: '2026-10-01', to: '2026-11-01', status: '已归档' }
  ],

  adminOrders: [
    { id: 'O20261110001', user: '张生阳', product: '咖啡兑换券', points: 300, status: 'CREATED', statusName: '待处理', time: '11-10 12:02' },
    { id: 'O20261110002', user: '魏嘉鑫', product: '共享单车月卡', points: 800, status: 'CREATED', statusName: '待处理', time: '11-10 11:48' },
    { id: 'O20261109003', user: '郭浚文', product: '地铁 5 次卡', points: 500, status: 'FULFILLED', statusName: '已履约', time: '11-09 16:20' },
    { id: 'O20261109004', user: '李金平', product: '树苗认养证书', points: 200, status: 'CANCELLED', statusName: '已取消', time: '11-09 10:05' }
  ]
};

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  trip: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18h6a4 4 0 0 0 0-8h-5a4 4 0 0 1 0-8"/>',
  points: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.6h-4a1.8 1.8 0 0 0 0 3.6h4"/>',
  mall: '<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  me: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-3.6 3.6-5.4 7.5-5.4s6.7 1.8 7.5 5.4"/>'
};

/* 渲染底部标签栏 */
function renderTabs(active) {
  const nav = document.querySelector('.tabbar');
  if (!nav) return;
  const items = [
    ['home', '首页', 'home.html'],
    ['trip', '行程', 'trips.html'],
    ['points', '积分', 'points.html'],
    ['mall', '商城', 'mall.html'],
    ['me', '我的', 'me.html']
  ];
  nav.innerHTML = items.map(([key, label, href]) => `
    <a class="tab ${key === active ? 'active' : ''}" href="${href}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>
      <span>${label}</span>
    </a>`).join('');
}

/* 轻提示 */
let toastTimer;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    (document.querySelector('.screen') || document.body).appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* 数字格式化 */
const fmt = (n) => Number(n).toLocaleString('zh-CN');
const kg = (n) => Number(n).toFixed(2);

/* 按出行方式筛选通用逻辑 */
function bindSeg(segSelector, onChange) {
  const seg = document.querySelector(segSelector);
  if (!seg) return;
  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    [...seg.children].forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    onChange(btn.dataset.value);
  });
}

/* 生成状态徽标 */
function badge(statusName, status) {
  const map = { CREATED: 'amber', FULFILLED: 'green', CANCELLED: 'gray', POINTED: 'green' };
  return `<span class="badge badge-${map[status] || 'gray'}">${statusName}</span>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.tabbar');
  if (nav) renderTabs(nav.dataset.active || 'home');
});
