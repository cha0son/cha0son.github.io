/**
 * 推荐引擎 —— food-recommender 的 JavaScript 移植版
 *
 * 本文件与 Java 版 src/SparkServer.java 的 Recommender 类逻辑一一对应，
 * 移植目的是让演示可以放在静态托管上（GitHub Pages），不依赖后端服务。
 *
 * 与 Java 版的差异只有两处：
 *   1. 数据结构用普通对象替代 Java 的 Map/record
 *   2. 持久化用 localStorage 替代 TSV 文件
 * 打分公式、权重、衰减模型、候选池自适应逻辑完全一致。
 *
 * 【想读懂算法的人看这三个函数】
 *   preference()  —— 偏好分 P：你有多喜欢这道菜
 *   novelty()     —— 时间分 R：多久没吃了（本项目的核心创新点）
 *   score()       —— 把五项加权求和，得到最终得分
 */

/* ==================== 默认参数 ====================
 * 修改这里可以改变算法行为，界面上也能实时调。 */
const DEFAULT_PARAMS = {
  alpha: 0.65,          // 偏好分权重
  beta: 0.30,           // 时间分权重（设为 0 可做消融实验：关掉时间衰减）
  gamma: 0.10,          // 场景分权重
  lambda: 3.0,          // 想念半衰期（天）。越小越容易腻
  noiseAmp: 0.03,       // 探索噪声幅度，防止推荐固化
  excludeRecentDays: 3, // 最近几天吃过的直接排除
  minPool: 8,           // 候选池保底数量，不足则自动放宽排除窗口
  includeRecent: false  // 调试用：把刚吃过的也列出来
};

const WEATHERS = ['晴', '阴', '雨', '热', '冷'];
const MEAL_TYPES = ['早餐', '午餐', '晚餐', '夜宵'];

/* ==================== 工具函数 ==================== */
const clamp01 = v => Math.max(0, Math.min(1, v));
const round4 = v => Math.round(v * 10000) / 10000;

/** 两个日期相差的天数（本地时间，按自然日计算） */
function daysBetween(fromISO, toDate) {
  if (!fromISO) return 999;
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.round((b - a) / 86400000);
}

function todayISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ==================== 时间衰减 ====================
 * 这是整个项目的核心。R = 1 - exp(-Δt / λ)
 *
 * 为什么用指数而不是线性递增？
 *   指数函数有天然上界 1。如果用线性递增，一道一年没吃的菜会永远霸榜，
 *   推荐结果就退化了。指数回升会收敛，长期看所有久未食用的菜趋于同分，
 *   排序重新交给偏好分决定 —— 这才是合理的行为。
 *
 * λ 的物理含义：λ 越小，"想念"回升越快，也就是越容易腻。
 *   例：λ=3 时，隔 1 天回到 0.28，3 天 0.63，7 天 0.90，14 天 0.99。
 */

/** 不同菜系的想念速度不同：清淡的可以天天吃，重口的容易腻 */
function lambdaFor(dish, baseLambda) {
  switch (dish.cuisine) {
    case '健康餐': case '汤羹': case '家常':
      return baseLambda * 1.6;   // 清淡，不容易腻
    case '粤菜': case '日料':
      return baseLambda * 1.2;
    case '火锅': case '川菜': case '湘菜':
      return baseLambda * 0.7;   // 重口，容易腻
    default:
      return baseLambda;
  }
}

/* ==================== 各项打分 ==================== */

/** 偏好分 P：基础评分 + 常吃加成 + 反馈修正，归一化到 0~1 */
function preference(stat) {
  const base = stat.stars === 0 ? 0.60 : stat.stars / 5.0;  // 没打过分给中性值（冷启动）
  const freq = Math.min(1.0, stat.eatCount / 10.0) * 0.10;  // 常吃加分，上限 +0.10
  const total = stat.good + stat.bad;
  const fb = total === 0 ? 0.5 : stat.good / total;
  const fbDelta = total === 0 ? 0 : (fb - 0.5) * 0.40;      // 反馈修正，±0.20
  return clamp01(base + freq + fbDelta);
}

/** 时间分 R：多久没吃了 */
function novelty(dish, stat, today, lambda) {
  const days = daysBetween(stat.lastEaten, today);
  if (days >= 999) return { value: 1.0, days: 999 };        // 从没吃过 = 满分新鲜
  return { value: 1.0 - Math.exp(-days / lambdaFor(dish, lambda)), days };
}

/** 场景分 C：天气与菜品的匹配度 */
function sceneAdjust(dish, weather) {
  let scene = 0;
  const t = dish.tags;
  if (weather === '雨' || weather === '冷') {
    if (t.includes('汤') || t.includes('暖胃') || t.includes('炖菜')) scene += 0.30;
    if (t.includes('清爽') || t.includes('低卡')) scene -= 0.10;
  } else if (weather === '热') {
    if (t.includes('清爽') || t.includes('凉菜')) scene += 0.30;
    if (t.includes('炖菜') || dish.spicy >= 3) scene -= 0.10;
  }
  return scene;
}

/** 惩罚分：多样性约束 + 健康约束（最后会乘以 beta） */
function penaltyOf(dish, stat, days, ctx) {
  let penalty = 0;
  if (stat.lastEaten && days < 7) {
    penalty += 0.15 * (7 - days) / 7.0;                     // 一周内吃过，轻度降权
  }
  if (dish.spicy >= 3 && ctx.recentSpicy >= 2) penalty += 0.25;   // 连着吃辣，劝退
  if (dish.tags.includes('油腻') && ctx.recentHeavy >= 2) penalty += 0.20;
  return penalty;
}

/** 生成推荐理由（前端展示"为什么推荐它"） */
function explain(stat, days, nov, scene, penalty) {
  const parts = [];
  if (stat.eatCount === 0) parts.push('还没吃过这道菜');
  else if (days >= 999) parts.push('很久没吃');
  else if (days === 0) parts.push('今天刚吃过');
  else parts.push(days + ' 天没吃了');

  if (stat.stars > 0) parts.push('你的评分 ' + stat.stars + ' 星');
  if (nov > 0.8) parts.push('新鲜度很高');
  if (scene > 0.05) parts.push('很适合当前天气');
  if (penalty > 0.05) parts.push('最近吃得多，适当降权');
  const total = stat.good + stat.bad;
  if (stat.bad > 0 && total > 0 && stat.good / total < 0.5) parts.push('你以前标记过吃腻了');
  return parts.join('，');
}

/* ==================== 单道菜打分 ==================== */

/**
 * excludeDays 是本轮生效的排除天数，可能已被推荐主流程自动放宽。
 * 返回 null 表示这道菜被硬性排除（不符合餐段 / 刚吃过）。
 */
function score(dish, stat, params, ctx, excludeDays) {
  const { mealType, weather, today } = ctx;

  // 餐段过滤：早餐档不推硬菜
  if (mealType && dish.mealType !== mealType) return null;

  const days = daysBetween(stat.lastEaten, today);

  // 刚吃过的硬性排除（可用 includeRecent 关掉，方便调试）
  if (!params.includeRecent && stat.lastEaten && days < excludeDays) return null;

  const P = preference(stat);
  const R = novelty(dish, stat, today, params.lambda);
  const C = sceneAdjust(dish, weather);
  let penalty = penaltyOf(dish, stat, R.days, ctx);

  // 关键：惩罚项必须跟着 beta 一起缩放。
  // 否则把 beta 调成 0 做消融实验时，惩罚还在偷偷生效，对照组就不干净了。
  penalty *= params.beta;

  const noise = (Math.random() * 2 - 1) * params.noiseAmp;

  // ★ 最终打分公式
  const total = params.alpha * P
              + params.beta * R.value
              + params.gamma * C
              - penalty
              + noise;

  return {
    dish: dish.name,
    preference: round4(P),
    novelty: round4(R.value),
    scene: round4(C),
    penalty: round4(penalty),
    noise: round4(noise),
    total: round4(total),
    daysSince: R.days >= 999 ? -1 : R.days,
    explain: explain(stat, R.days, R.value, C, penalty),
    _sort: total
  };
}

/* ==================== 推荐主流程 ==================== */

/**
 * 候选池自适应 —— 解决"吃遍了怎么办"。
 *
 * 问题：硬性排除最近 N 天吃过的菜，如果菜少或吃得快，候选集会空掉，
 *       用户看到的就是"没有可推荐的菜"。
 * 解法：候选数不足 minPool 时，逐天放宽排除窗口（3 → 2 → 1 → 0），
 *       保证永远有菜可选。对应工业界的做法：降级而不是报错。
 */
function recommend(dishes, stats, params, ctx, topN) {
  const minPool = Math.max(params.minPool, Math.min(3, topN));
  let effectiveDays = params.excludeRecentDays;
  let list = scoreAll(dishes, stats, params, ctx, effectiveDays);

  while (list.length < minPool && effectiveDays > 0) {
    effectiveDays--;
    list = scoreAll(dishes, stats, params, ctx, effectiveDays);
  }

  list.sort((a, b) => b._sort - a._sort);
  const top = list.slice(0, topN);
  top.forEach(x => delete x._sort);

  return {
    list: top,
    all: list,
    candidateCount: list.length,
    effectiveDays,
    configuredDays: params.excludeRecentDays,
    relaxed: effectiveDays < params.excludeRecentDays,
    poolNote: buildPoolNote(effectiveDays, params.excludeRecentDays, list.length)
  };
}

function scoreAll(dishes, stats, params, ctx, excludeDays) {
  const out = [];
  for (const d of dishes) {
    const s = score(d, stats[d.name] || emptyStat(), params, ctx, excludeDays);
    if (s) out.push(s);
  }
  return out;
}

function buildPoolNote(effective, configured, count) {
  if (effective >= configured) return '候选池充足（' + count + ' 道），按设置的排除 ' + configured + ' 天';
  if (effective === 0) return '你最近吃的太多了，排除规则已完全放开 —— 现在只按喜好排序';
  return '候选不够，' + configured + ' 天已自动放宽到 ' + effective + ' 天（候选 ' + count + ' 道）';
}

function emptyStat() {
  return { stars: 0, eatCount: 0, lastEaten: null, good: 0, bad: 0 };
}

/** 统计近 N 天内吃辣 / 油腻的次数，供惩罚项使用 */
function buildContext(history, mealType, weather, today) {
  let recentSpicy = 0, recentHeavy = 0;
  const since = new Date(today.getTime() - 3 * 86400000);
  for (const h of history) {
    const d = new Date(h.date + 'T00:00:00');
    if (d < since) continue;
    const dish = DISHES.find(x => x.name === h.dish);
    if (!dish) continue;
    if (dish.spicy >= 3) recentSpicy++;
    if (dish.tags.includes('油腻')) recentHeavy++;
  }
  return { recentSpicy, recentHeavy, mealType, weather, today };
}
