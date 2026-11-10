/* 绿行积分 · Web 原型共用脚本（纯静态，无后端） */
const MOCK = {
  user: { name: '张生阳', handle: '@shengyang', role: '普通用户', points: 1280,
          earned: 3450, spent: 2170, trips: 37, reduction: 48.6, today: 2 },
  trips: [
    { id: 'T202611100001', mode: 'BUS',  modeName: '公交', icon: '🚌', km: 10.0, red: 1.5,  pts: 15, date: '11-10 08:12', rule: 'R-2026-11-BUS' },
    { id: 'T202611090002', mode: 'MET',  modeName: '地铁', icon: '🚇', km: 6.4,  red: 0.9,  pts: 9,  date: '11-09 18:40', rule: 'R-2026-11-MET' },
    { id: 'T202611080003', mode: 'BIK',  modeName: '骑行', icon: '🚲', km: 3.2,  red: 0.64, pts: 6,  date: '11-08 19:05', rule: 'R-2026-11-BIK' },
    { id: 'T202611070004', mode: 'WAL',  modeName: '步行', icon: '🚶', km: 1.8,  red: 0.36, pts: 3,  date: '11-07 12:30', rule: 'R-2026-11-WAL' },
    { id: 'T202611060005', mode: 'BUS',  modeName: '公交', icon: '🚌', km: 12.5, red: 1.88, pts: 18, date: '11-06 07:55', rule: 'R-2026-11-BUS' }
  ],
  ledger: [
    { icon: '🎁', type: '兑换咖啡券', time: '11-10 12:02', delta: -300, balance: 1280, kind: 'out' },
    { icon: '🚌', type: '公交出行 · 10.0 km', time: '11-10 08:12', delta: 15, balance: 1580, kind: 'in' },
    { icon: '🚇', type: '地铁出行 · 6.4 km', time: '11-09 18:40', delta: 9, balance: 1565, kind: 'in' },
    { icon: '↩️', type: '订单取消冲正', time: '11-09 09:20', delta: 200, balance: 1556, kind: 'back' },
    { icon: '🎁', type: '兑换地铁 5 次卡', time: '11-08 20:15', delta: -500, balance: 1356, kind: 'out' }
  ],
  goods: [
    { id: 'G01', name: '环保帆布袋', icon: '👜', cost: 120, stock: 8,  state: 'ok' },
    { id: 'G02', name: '树苗认养证书', icon: '🌱', cost: 200, stock: 99, state: 'ok' },
    { id: 'G03', name: '咖啡兑换券', icon: '☕', cost: 300, stock: 42, state: 'ok' },
    { id: 'G04', name: '地铁 5 次卡', icon: '🎫', cost: 500, stock: 15, state: 'ok' },
    { id: 'G05', name: '保温杯', icon: '🍵', cost: 650, stock: 21, state: 'ok' },
    { id: 'G06', name: '共享单车月卡', icon: '🚲', cost: 800, stock: 0,  state: 'sold' },
    { id: 'G07', name: '城市公园年票', icon: '🎟️', cost: 1200, stock: 5, state: 'ok' },
    { id: 'G08', name: '碳积分公益捐赠', icon: '🌳', cost: 1500, stock: 999, state: 'ok' }
  ],
  orders: [
    { id: 'O202611100001', goods: '咖啡兑换券', icon: '☕', qty: 1, pts: 300, status: 'CREATED',   statusName: '待处理', time: '11-10 12:02', user: '张生阳' },
    { id: 'O202611100002', goods: '共享单车月卡', icon: '🚲', qty: 1, pts: 800, status: 'CREATED',  statusName: '待处理', time: '11-10 11:48', user: '魏嘉鑫' },
    { id: 'O202611090003', goods: '地铁 5 次卡', icon: '🎫', qty: 1, pts: 500, status: 'FULFILLED', statusName: '已履约', time: '11-09 16:20', user: '郭浚文' },
    { id: 'O202611090004', goods: '树苗认养证书', icon: '🌱', qty: 1, pts: 200, status: 'CANCELLED', statusName: '已取消', time: '11-09 10:05', user: '李金平' }
  ],
  rules: [
    { v: 'R-2026-11-BUS', mode: '公交 🚌', base: 0.200, factor: 0.050, ratio: 10, from: '2026-11-01', to: '', state: '生效中' },
    { v: 'R-2026-11-MET', mode: '地铁 🚇', base: 0.200, factor: 0.040, ratio: 10, from: '2026-11-01', to: '', state: '生效中' },
    { v: 'R-2026-11-BIK', mode: '骑行 🚲', base: 0.200, factor: 0.000, ratio: 10, from: '2026-11-01', to: '', state: '生效中' },
    { v: 'R-2026-11-WAL', mode: '步行 🚶', base: 0.200, factor: 0.000, ratio: 10, from: '2026-11-01', to: '', state: '生效中' },
    { v: 'R-2026-10-BUS', mode: '公交 🚌', base: 0.200, factor: 0.050, ratio: 10, from: '2026-10-01', to: '2026-11-01', state: '已归档' }
  ]
};

const fmt = n => Number(n).toLocaleString('zh-CN');
const kg = n => Number(n).toFixed(2);
const stateTag = s => `<span class="tag tag-${s === 'FULFILLED' || s === '生效中' ? 'green' : s === 'CREATED' || s === '待处理' ? 'amber' : s === 'CANCELLED' ? 'rose' : 'gray'}">${s === 'FULFILLED' ? '已履约' : s === 'CREATED' ? '待处理' : s === 'CANCELLED' ? '已取消' : s}</span>`;

function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2400);
}

function openModal(id) { document.getElementById('mask')?.classList.add('on'); document.getElementById(id)?.classList.add('on'); }
function closeModal(id) { document.getElementById('mask')?.classList.remove('on'); document.getElementById(id)?.classList.remove('on'); }

function bindSeg(sel, cb) {
  document.querySelectorAll(sel + ' button').forEach(b => b.addEventListener('click', () => {
    b.parentNode.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); cb(b.dataset.value);
  }));
}
