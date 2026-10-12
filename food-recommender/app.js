/**
 * 界面逻辑与数据持久化
 *
 * 与 Java 版的关系：
 *   Java 版用 TSV 文件存数据，这里用 localStorage（浏览器沙箱限制，且不需要后端）
 *   Java 版用 HTTP 接口驱动前端，这里直接调用 engine.js 的函数
 * 其余交互（打分、记录、调参、换一换）完全一致。
 */

/* ==================== 状态 ==================== */
const STORE_KEY = 'foodrec.v1';

let state = {
  stats: {},      // { 菜名: {stars, eatCount, lastEaten, good, bad} }
  history: [],    // [{date, dish, meal}]
  params: Object.assign({}, DEFAULT_PARAMS)
};

let lastResult = null;   // 上一次推荐结果，用于渲染打分明细

/* ---------- 持久化 ---------- */
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.stats) state.stats = d.stats;
    if (d.history) state.history = d.history;
    if (d.params) state.params = Object.assign({}, DEFAULT_PARAMS, d.params);
  } catch (e) {}
}

function statOf(name) {
  if (!state.stats[name]) state.stats[name] = emptyStat();
  return state.stats[name];
}

/* ==================== DOM 工具 ==================== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), 1700);
}

/* ==================== 标签页切换 ==================== */
$$('.tab-btn').forEach(b => b.addEventListener('click', () => {
  $$('.tab-btn').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  const tab = b.dataset.tab;
  ['rec', 'lib', 'hist', 'algo'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('hidden', t !== tab);
  });
  if (tab === 'lib') renderLib();
  if (tab === 'hist') renderHist();
  if (tab === 'algo') renderParams();
}));

/* ==================== 推荐页 ==================== */
function todayDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function currentCtx() {
  const d = new Date();
  const h = d.getHours();
  const auto = h < 10 ? '早餐' : h < 15 ? '午餐' : h < 21 ? '晚餐' : '夜宵';
  return buildContext(
    state.history,
    $('#meal').value || auto,
    $('#weather').value || '晴',
    todayDate()
  );
}

function doRecommend() {
  const ctx = currentCtx();
  const res = recommend(DISHES, state.stats, state.params, ctx, 6);
  const full = recommend(DISHES, state.stats, state.params, ctx, 15);
  res.all = full.all;
  lastResult = res;

  renderPoolWarn(res);
  renderHero(res, ctx);
  renderRank(res.all.slice(0, 15));
  $('#recMeta').textContent =
    ctx.today.getFullYear() + '-' + String(ctx.today.getMonth() + 1).padStart(2, '0') + '-' + String(ctx.today.getDate()).padStart(2, '0') +
    ' · 候选 ' + res.candidateCount + ' 道 · 排除最近 ' + res.effectiveDays + ' 天';
}

function renderPoolWarn(res) {
  const box = $('#poolWarn');
  if (!res.relaxed) { box.innerHTML = ''; return; }
  box.innerHTML =
    '<div class="notice">⚠️ <b>你最近吃得太多了</b> —— ' + esc(res.poolNote) +
    '<br><span class="dim">这是候选池自适应机制：硬性排除会让池子空掉，' +
    '所以系统会逐天放宽窗口，保证永远有菜可选。想要更大的池子，' +
    '可以去「菜品库」多打评分，或者把排除天数调小。</span></div>';
}

function renderHero(res, ctx) {
  const box = $('#heroBox');
  const list = res.list;
  if (!list.length) {
    box.innerHTML = '<div class="card"><div class="empty">当前条件下没有可推荐的菜</div></div>';
    return;
  }
  const top = list[0];
  const d = DISHES.find(x => x.name === top.dish) || {};
  box.innerHTML =
    '<div class="hero">' +
      '<div class="tag">今天' + esc(ctx.mealType) + ' · ' + esc(ctx.weather) +
        ' · 匹配度 ' + (top.total * 100).toFixed(1) + '%</div>' +
      '<h2>' + esc(top.dish) + '</h2>' +
      '<div class="meta">' + esc(d.cuisine || '') + ' · ' + (d.minutes || '?') + ' 分钟 · 约 ' +
        (d.calories || '?') + ' 千卡' + (d.spicy ? ' · ' + '🌶'.repeat(d.spicy) : '') +
        (d.tags ? ' · ' + d.tags.split(',').map(t => '#' + t).join(' ') : '') + '</div>' +
      '<div class="why">💡 ' + esc(top.explain) + '</div>' +
      '<div class="actions">' +
        '<button class="btn" data-act="eat" data-dish="' + esc(top.dish) + '">✅ 就吃这个</button>' +
        '<button class="btn ghost" data-act="reroll">🎲 换一换</button>' +
        '<button class="btn ghost" data-act="good" data-dish="' + esc(top.dish) + '">👍 还想吃</button>' +
        '<button class="btn ghost" data-act="bad" data-dish="' + esc(top.dish) + '">👎 吃腻了</button>' +
      '</div>' +
    '</div>';
}

function bar(label, val, color) {
  const w = Math.max(0, Math.min(1, val)) * 100;
  return '<div class="bk"><span>' + label + '</span>' +
    '<div class="bar"><i style="width:' + w + '%;background:' + color + '"></i></div>' +
    '<span>' + (val * 100).toFixed(0) + '%</span></div>';
}

function renderRank(list) {
  const box = $('#rankList');
  if (!list || !list.length) { box.innerHTML = '<div class="empty">没有候选</div>'; return; }
  box.innerHTML = list.map((r, i) => {
    const d = DISHES.find(x => x.name === r.dish) || {};
    let bars = bar('偏好', r.preference, '#6bb6ff') + bar('时间分', r.novelty, '#5fd68a');
    if (Math.abs(r.scene) > 0.001) {
      bars += '<div class="bk"><span>场景</span><div class="bar"><i style="width:' +
        (Math.min(1, Math.abs(r.scene)) * 100) + '%;background:' + (r.scene >= 0 ? '#ffb066' : '#ff6b6b') +
        '"></i></div><span>' + (r.scene >= 0 ? '+' : '') + r.scene.toFixed(2) + '</span></div>';
    }
    if (r.penalty > 0.001) {
      bars += '<div class="bk"><span>惩罚</span><div class="bar"><i style="width:' +
        (Math.min(1, r.penalty) * 100) + '%;background:#ff6b6b"></i></div><span>-' +
        r.penalty.toFixed(2) + '</span></div>';
    }
    return '<div class="item">' +
      '<div class="rank' + (i === 0 ? ' top' : '') + '">' + (i + 1) + '</div>' +
      '<div class="nm">' + esc(r.dish) + '</div>' +
      '<div class="cu">' + esc(d.cuisine || '') + '</div>' +
      '<div class="bars">' + bars + '</div>' +
      '<div class="sc">' + r.total.toFixed(3) + '</div>' +
      '<div class="act"><button class="btn ghost sm" data-act="eat" data-dish="' + esc(r.dish) + '">就它</button></div>' +
    '</div>';
  }).join('');
}

/* 事件委托：所有按钮统一处理 */
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const dish = btn.dataset.dish;

  if (act === 'reroll') { doRecommend(); return; }
  if (act === 'eat') { recordEat(dish); return; }
  if (act === 'good' || act === 'bad') { recordFeedback(dish, act === 'good'); return; }
  if (act === 'rate') { rateDish(dish, +btn.dataset.stars); return; }
});

function recordEat(dish) {
  const s = statOf(dish);
  s.eatCount++;
  s.lastEaten = todayISO();
  state.history.push({ date: todayISO(), dish: dish, meal: $('#meal').value });
  save();
  toast('已记录：今天吃了「' + dish + '」');
  doRecommend();
}

function recordFeedback(dish, good) {
  const s = statOf(dish);
  if (good) s.good++; else s.bad++;
  save();
  toast(good ? '已记下：还想吃 👍' : '已记下：吃腻了 👎');
  doRecommend();
}

function rateDish(dish, stars) {
  statOf(dish).stars = stars;
  save();
  toast('「' + dish + '」评为 ' + stars + ' 星');
  renderLib();
}

/* ==================== 菜品库 ==================== */
function renderLib() {
  const kw = ($('#search').value || '').trim().toLowerCase();
  const cu = $('#cuisine').value;
  const f = $('#filter').value;

  const list = DISHES.filter(d => {
    const s = state.stats[d.name] || emptyStat();
    if (cu && d.cuisine !== cu) return false;
    if (f === 'unrated' && s.stars > 0) return false;
    if (f === 'rated' && s.stars === 0) return false;
    if (f === 'eaten' && s.eatCount === 0) return false;
    if (kw) {
      const hay = (d.name + d.cuisine + d.tags + d.mealType).toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  $('#libCount').textContent = list.length + ' / ' + DISHES.length + ' 道';

  $('#libGrid').innerHTML = list.map(d => {
    const s = state.stats[d.name] || emptyStat();
    const stars = [1, 2, 3, 4, 5].map(n =>
      '<i class="' + (n <= s.stars ? 'on' : '') + '" data-act="rate" data-dish="' +
      esc(d.name) + '" data-stars="' + n + '">★</i>').join('');
    const badges = d.tags.split(',').filter(Boolean).map(t => '<span class="badge">' + esc(t) + '</span>').join('');
    return '<div class="d">' +
      '<div class="t">' + esc(d.name) + '</div>' +
      '<div class="m">' + esc(d.cuisine) + ' · ' + d.minutes + '分钟 · ' + d.calories + '千卡' +
        (d.spicy ? ' · ' + '🌶'.repeat(d.spicy) : '') + '</div>' +
      '<div class="m">' + badges + '</div>' +
      '<div class="stars">' + stars + '</div>' +
      '<div class="m last">' + (s.eatCount > 0
        ? '吃过 ' + s.eatCount + ' 次' + (s.lastEaten ? ' · 上次 ' + s.lastEaten : '')
        : '还没吃过') + '</div>' +
    '</div>';
  }).join('') || '<div class="empty">没有匹配的菜品</div>';
}

/* ==================== 历史 ==================== */
function renderHist() {
  const rated = DISHES.filter(d => (state.stats[d.name] || {}).stars > 0).length;
  const eaten = DISHES.filter(d => (state.stats[d.name] || {}).eatCount > 0).length;
  $('#histMeta').textContent =
    '共 ' + state.history.length + ' 条 · 已评分 ' + rated + '/' + DISHES.length + ' 道 · 吃过 ' + eaten + ' 道';

  const rows = state.history.slice().reverse();
  $('#histEmpty').classList.toggle('hidden', rows.length > 0);
  $('#histBody').innerHTML = rows.map(h => {
    const s = state.stats[h.dish] || {};
    const stars = s.stars > 0 ? '★'.repeat(s.stars) + '☆'.repeat(5 - s.stars) : '<span class="dim">未评分</span>';
    return '<tr><td class="dim">' + esc(h.date) + '</td><td>' + esc(h.dish) + '</td>' +
      '<td class="dim">' + esc(h.meal || '-') + '</td><td>' + stars + '</td></tr>';
  }).join('');
}

/* ==================== 参数页 ==================== */
const SLIDERS = [
  ['alpha', 'vAlpha'], ['beta', 'vBeta'], ['gamma', 'vGamma'],
  ['lambda', 'vLambda'], ['noiseAmp', 'vNoise'],
  ['excludeRecentDays', 'vExcl'], ['minPool', 'vPool']
];

function syncLabels() {
  SLIDERS.forEach(([k, id]) => {
    const el = $('#' + k), lab = $('#' + id);
    if (el && lab) lab.textContent = el.value;
  });
}

function renderParams() {
  SLIDERS.forEach(([k, id]) => {
    const el = $('#' + k);
    if (el) el.value = state.params[k];
  });
  const chk = $('#includeRecent');
  if (chk) chk.checked = !!state.params.includeRecent;
  syncLabels();
}

function collectParams() {
  const p = {};
  SLIDERS.forEach(([k]) => { const el = $('#' + k); if (el) p[k] = +el.value; });
  const chk = $('#includeRecent');
  if (chk) p.includeRecent = chk.checked;
  return Object.assign({}, state.params, p);
}

/* ==================== 初始化 ==================== */
(function init() {
  load();

  // 菜系列表
  const cus = Array.from(new Set(DISHES.map(d => d.cuisine)));
  $('#cuisine').innerHTML = '<option value="">全部</option>' +
    cus.map(c => '<option>' + esc(c) + '</option>').join('');

  // 按当前时间预选餐段
  const h = new Date().getHours();
  $('#meal').value = h < 10 ? '早餐' : h < 15 ? '午餐' : h < 21 ? '晚餐' : '夜宵';

  // 参数滑块实时同步标签
  SLIDERS.forEach(([k]) => {
    const el = $('#' + k);
    if (el) el.addEventListener('input', syncLabels);
  });

  // 各控件绑定
  $('#btnRec').addEventListener('click', doRecommend);
  $('#meal').addEventListener('change', doRecommend);
  $('#weather').addEventListener('change', doRecommend);
  $('#search').addEventListener('input', renderLib);
  $('#cuisine').addEventListener('change', renderLib);
  $('#filter').addEventListener('change', renderLib);

  $('#btnSave').addEventListener('click', () => {
    state.params = collectParams();
    save();
    toast('参数已保存，去推荐页看变化');
  });

  $('#btnDefault').addEventListener('click', () => {
    state.params = Object.assign({}, DEFAULT_PARAMS);
    save();
    renderParams();
    toast('已恢复默认参数');
  });

  $('#btnReset').addEventListener('click', () => {
    if (!confirm('确定清空所有评分和历史记录吗？')) return;
    state.stats = {};
    state.history = [];
    save();
    renderHist();
    toast('已清空');
  });

  $('#year').textContent = new Date().getFullYear();
  doRecommend();
})();
