/* 离线冒烟测试：验证题库数据 + 打分逻辑是否产出合理结果。
   用法: node _build/smoke.js
*/
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "problems.json"), "utf8"));

const problems = data.p.map(([cid, idx, name, rating, solved]) =>
  ({ cid, idx, name, rating, solved }));

let maxSolved = 1, minCid = Infinity, maxCid = 0;
for (const p of problems) {
  if (p.solved > maxSolved) maxSolved = p.solved;
  if (p.cid > maxCid) maxCid = p.cid;
  if (p.cid < minCid) minCid = p.cid;
}

console.log(`[数据] schema=v${data.v} · 题目 ${problems.length} · contestId ${minCid}..${maxCid}`);
console.log(`[数据] 单题最高通过数 ${maxSolved}`);
console.log(`[数据] 顶层字段 ${Object.keys(data).join(", ")}`);

// 结构完整性
let badRating = 0, badId = 0;
for (const p of problems) {
  if (!(p.rating >= 800 && p.rating <= 3500)) badRating++;
  // CF 的 index 既可能是 "A"/"B1"/"F2"，也可能是 "01"（如 contest 921 Labyrinth）
  if (!(p.cid > 0) || !/^(?:[A-Z]\d*|\d+)$/.test(p.idx)) badId++;
}
console.log(`[校验] 非法 rating ${badRating} · 非法题目 id ${badId}`);

const buckets = {};
for (const p of problems) buckets[p.rating] = (buckets[p.rating] || 0) + 1;
const ratings = Object.keys(buckets).map(Number).sort((a, b) => a - b);
console.log(`[分布] rating ${ratings[0]}..${ratings[ratings.length - 1]}, 共 ${ratings.length} 档`);
for (const r of [800, 1200, 1600, 2000, 2400, 3000]) {
  console.log(`       ${r}: ${buckets[r] || 0} 题`);
}

const SIGMA = 110;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const hash = (n, seed) => {
  const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function makeCtx({ lo, hi, profile, challenge, seed }) {
  const mid = (lo + hi) / 2;
  const base = profile ? profile.rating : mid;
  const delta = { easy: 0, mid: 150, hard: 300 }[challenge || "mid"];
  return {
    target: clamp(base + delta, lo, hi),
    profile: profile || null,
    seed: seed == null ? 0.42 : seed,
  };
}

function score(p, c) {
  const D = Math.exp(-((p.rating - c.target) ** 2) / (2 * SIGMA * SIGMA));
  const Q = Math.log1p(p.solved) / Math.log1p(Math.max(maxSolved, 2));
  const F = (p.cid - minCid) / Math.max(1, maxCid - minCid);
  const J = hash(p.cid * 1000 + p.idx.charCodeAt(0) * 7 + (p.idx.charCodeAt(1) || 0), c.seed);
  return 0.55 * D + 0.25 * Q + 0.10 * F + 0.10 * J;
}

function pool(lo, hi, profile) {
  return problems.filter(p => {
    if (p.rating < lo || p.rating > hi) return false;
    if (profile && profile.solved.has(p.cid + p.idx)) return false;
    return true;
  });
}

console.log("\n=== 场景 1: 各难度区间的候选量 ===");
for (const [lo, hi] of [[800, 1000], [1200, 1400], [1200, 1600], [1400, 1600], [1800, 2100], [2400, 2600], [3400, 3500]]) {
  console.log(`  ${lo}-${hi}: ${pool(lo, hi).length} 题`);
}

console.log("\n=== 场景 2: 推荐排序 Top5 (1200-1600, 适中) ===");
const ctx = makeCtx({ lo: 1200, hi: 1600 });
const ranked = pool(1200, 1600)
  .map(p => ({ p, s: score(p, ctx) }))
  .sort((a, b) => b.s - a.s)
  .slice(0, 5);
console.log(`  目标难度 target = ${ctx.target}`);
for (const { p, s } of ranked) {
  console.log(`  ${s.toFixed(4)}  ${p.rating}  ${p.cid}${p.idx.padEnd(2)} ${p.name.slice(0, 44)}`);
}

console.log("\n=== 场景 3: 挑战度三档的目标难度 ===");
for (const c of ["easy", "mid", "hard"]) {
  const x = makeCtx({ lo: 1200, hi: 1600, challenge: c });
  const top = pool(1200, 1600).map(p => ({ p, s: score(p, x) })).sort((a, b) => b.s - a.s)[0];
  console.log(`  ${c.padEnd(5)} target=${String(x.target).padEnd(5)} top1 rating=${top.p.rating}`);
}

console.log("\n=== 场景 4: 模拟账号 rating 1500 ===");
const profile = { rating: 1500, solved: new Set() };
const ctx2 = makeCtx({ lo: 1200, hi: 1800, profile });
const ranked2 = pool(1200, 1800, profile)
  .map(p => ({ p, s: score(p, ctx2) }))
  .sort((a, b) => b.s - a.s)
  .slice(0, 5);
console.log(`  目标难度 target = ${ctx2.target}（应为 1500+150=1650）`);
for (const { p, s } of ranked2) {
  console.log(`  ${s.toFixed(4)}  ${p.rating}  ${p.cid}${p.idx.padEnd(2)} ${p.name.slice(0, 40)}`);
}

console.log("\n=== 场景 5: 排除已做 ===");
const fakeSolved = new Set(problems.slice(0, 500).map(p => p.cid + p.idx));
const p1 = pool(800, 3500).length;
const p2 = pool(800, 3500, { rating: 1500, solved: fakeSolved }).length;
console.log(`  不带账号 ${p1} 题 -> 排除 500 道已做后 ${p2} 题 (差 ${p1 - p2})`);

console.log("\n[断言]");
const checks = [
  ["schema 是 v4", data.v === 4],
  ["带标签字典（38 个）", Array.isArray(data.tags) && data.tags.length === 38],
  ["题库 > 10000", problems.length > 10000],
  ["每行 6 个字段", data.p.every(r => r.length === 6)],
  ["标签索引都合法", data.p.every(r => r[5].every(i => i >= 0 && i < data.tags.length))],
  ["高位标签（trees）不串位", (() => {
    const ti = data.tags.indexOf("trees");
    const flows = data.tags.indexOf("flows");
    const withTrees = data.p.filter(r => r[5].includes(ti)).length;
    const withFlows = data.p.filter(r => r[5].includes(flows)).length;
    return ti >= 32 && withTrees > 0 && withTrees !== withFlows;
  })()],
  ["无非法 rating", badRating === 0],
  ["无非法题目 id", badId === 0],
  ["1200-1600 池非空", pool(1200, 1600).length > 0],
  ["Top1 分值在 (0,1]", ranked[0].s > 0 && ranked[0].s <= 1.0],
  ["Top5 全在区间内", ranked.every(x => x.p.rating >= 1200 && x.p.rating <= 1600)],
  ["已做过滤生效", p2 === p1 - 500],
  ["挑战度会抬高目标难度", (() => {
    const e = makeCtx({ lo: 1200, hi: 1800, profile, challenge: "easy" }).target;
    const m = makeCtx({ lo: 1200, hi: 1800, profile, challenge: "mid" }).target;
    const h = makeCtx({ lo: 1200, hi: 1800, profile, challenge: "hard" }).target;
    return e < m && m < h;
  })()],
  ["target 不越出区间", (() => {
    for (const ch of ["easy", "mid", "hard"]) {
      for (const [lo, hi] of [[800, 900], [1200, 1200 + 100], [3400, 3500]]) {
        const t = makeCtx({ lo, hi, profile: { rating: 3000 }, challenge: ch }).target;
        if (t < lo || t > hi) return false;
      }
    }
    return true;
  })()],
];
let ok = true;
for (const [name, pass] of checks) {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}
console.log(ok ? "\n全部通过" : "\n有失败项");
process.exit(ok ? 0 : 1);
