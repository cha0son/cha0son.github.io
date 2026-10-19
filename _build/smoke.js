/* 离线冒烟测试：不依赖浏览器，验证题库数据 + 打分逻辑是否产出合理结果。
   用法: node _build/smoke.js
*/
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "problems.json"), "utf8"));

const tags = data.tags;
const tagIndex = new Map(tags.map((t, i) => [t, i]));
const problems = data.p.map(([cid, idx, name, rating, tl, solved]) =>
  ({ cid, idx, name, rating, tags: tl, solved }));

let maxSolved = 1, minCid = Infinity, maxCid = 0;
for (const p of problems) {
  if (p.solved > maxSolved) maxSolved = p.solved;
  if (p.cid > maxCid) maxCid = p.cid;
  if (p.cid < minCid) minCid = p.cid;
}

console.log(`[数据] schema=v${data.v} · 题目 ${problems.length} · 标签 ${tags.length} · contestId ${minCid}..${maxCid}`);
console.log(`[数据] 单题最高通过数 ${maxSolved}`);

// 标签完整性：每题的标签索引必须合法且已排序
let badIdx = 0, unsorted = 0;
for (const p of problems) {
  for (let i = 0; i < p.tags.length; i++) {
    if (p.tags[i] < 0 || p.tags[i] >= tags.length) badIdx++;
    if (i && p.tags[i] <= p.tags[i - 1]) unsorted++;
  }
}
console.log(`[校验] 非法标签索引 ${badIdx} · 未排序 ${unsorted}`);

const sample = problems.find(p => p.cid === 1858 && p.idx === "B");
console.log(`[校验] 1858B "${sample.name}" rating=${sample.rating} 标签=${JSON.stringify(sample.tags.map(i => tags[i]))}`);

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

function makeCtx({ lo, hi, sel, profile, challenge, seed }) {
  const mid = (lo + hi) / 2;
  const base = profile ? profile.rating : mid;
  const delta = { easy: 0, mid: 150, hard: 300 }[challenge || "mid"];
  const target = clamp(base + delta, lo, hi);
  return {
    target,
    selIdx: new Set(sel.map(t => tagIndex.get(t))),
    profile: profile || null,
    seed: seed == null ? 0.42 : seed,
  };
}

function score(p, c) {
  const D = Math.exp(-((p.rating - c.target) ** 2) / (2 * SIGMA * SIGMA));
  let T = 0.5;
  const prof = c.profile;
  if (c.selIdx.size) {
    let hit = 0, sw = 0;
    for (const ti of p.tags) if (c.selIdx.has(ti)) { hit++; if (prof) sw += prof.weak[ti]; }
    T = hit / c.selIdx.size;
    if (prof && hit) T = 0.5 * T + 0.5 * (sw / hit);
  } else if (prof) {
    let w = 0;
    for (const ti of p.tags) w += prof.weak[ti];
    T = p.tags.length ? w / p.tags.length : 0.5;
  }
  const Q = Math.log1p(p.solved) / Math.log1p(Math.max(maxSolved, 2));
  const F = (p.cid - minCid) / Math.max(1, maxCid - minCid);
  const J = hash(p.cid * 1000 + p.idx.charCodeAt(0) * 7 + (p.idx.charCodeAt(1) || 0), c.seed);
  return 0.40 * D + 0.25 * T + 0.15 * Q + 0.10 * F + 0.10 * J;
}

function pool(lo, hi, sel, profile) {
  const s = new Set(sel.map(t => tagIndex.get(t)));
  return problems.filter(p => {
    if (p.rating < lo || p.rating > hi) return false;
    if (profile && profile.solved.has(p.cid + p.idx)) return false;
    if (s.size && !p.tags.some(t => s.has(t))) return false;
    return true;
  });
}

console.log("\n=== 场景 1: 各难度区间的候选量（无标签/无账号）===");
for (const [lo, hi] of [[800, 1000], [1200, 1400], [1200, 1600], [1400, 1600], [1800, 2100], [2400, 2600]]) {
  console.log(`  ${lo}-${hi}: ${pool(lo, hi, []).length} 题`);
}

console.log("\n=== 场景 2: 标签过滤（含高危高位标签）===");
for (const sel of [["dp"], ["dp", "greedy"], ["graphs", "trees"], ["trees"], ["two pointers"], ["sortings"], ["strings"], ["geometry"]]) {
  console.log(`  ${sel.join("+").padEnd(16)} ${pool(1200, 1600, sel).length} 题 (1200-1600)`);
}

console.log("\n=== 场景 3: 推荐排序 Top5 (1200-1600, dp+greedy) ===");
const ctx = makeCtx({ lo: 1200, hi: 1600, sel: ["dp", "greedy"] });
const ranked = pool(1200, 1600, ["dp", "greedy"])
  .map(p => ({ p, s: score(p, ctx) }))
  .sort((a, b) => b.s - a.s)
  .slice(0, 5);
for (const { p, s } of ranked) {
  console.log(`  ${s.toFixed(4)}  ${p.rating}  ${p.cid}${p.idx.padEnd(2)} ${p.name.slice(0, 40)}  [${p.tags.map(i => tags[i]).join(",")}]`);
}

console.log("\n=== 场景 4: 模拟账号 (rating 1500, dp 弱, graphs/trees 零基础) ===");
const weak = new Float32Array(tags.length).fill(0.4);
weak[tagIndex.get("dp")] = 0.33;
weak[tagIndex.get("graphs")] = 1.0;
weak[tagIndex.get("trees")] = 1.0;
weak[tagIndex.get("two pointers")] = 1.0;
const profile = { rating: 1500, weak, solved: new Set() };
const ctx2 = makeCtx({ lo: 1200, hi: 1800, sel: [], profile });
const ranked2 = pool(1200, 1800, [], profile)
  .map(p => ({ p, s: score(p, ctx2) }))
  .sort((a, b) => b.s - a.s)
  .slice(0, 6);
console.log(`  目标难度 target = ${ctx2.target}`);
for (const { p, s } of ranked2) {
  console.log(`  ${s.toFixed(4)}  ${p.rating}  ${p.cid}${p.idx.padEnd(2)} ${p.name.slice(0, 36)}  [${p.tags.map(i => tags[i]).join(",")}]`);
}

console.log("\n=== 场景 5: 排除已做 ===");
const fakeSolved = new Set(problems.slice(0, 500).map(p => p.cid + p.idx));
const p1 = pool(800, 3500, []).length;
const p2 = pool(800, 3500, [], { rating: 1500, weak, solved: fakeSolved }).length;
console.log(`  不带账号 ${p1} 题 -> 排除 500 道已做后 ${p2} 题 (差 ${p1 - p2})`);

// 关键回归：高位标签必须真的生效（防 32 位位运算串位）
const treesIdx = tagIndex.get("trees");
const treesOnly = pool(800, 3500, ["trees"]);
const allHaveTrees = treesOnly.every(p => p.tags.includes(treesIdx));
const twoPtr = pool(800, 3500, ["two pointers"]);
const allHave2p = twoPtr.every(p => p.tags.includes(tagIndex.get("two pointers")));

console.log("\n[断言]");
const checks = [
  ["题库 > 10000", problems.length > 10000],
  ["标签 38 个", tags.length === 38],
  ["无非法标签索引", badIdx === 0],
  ["标签索引已排序", unsorted === 0],
  ["1200-1600 池非空", pool(1200, 1600, []).length > 0],
  ["dp+greedy 有题", pool(1200, 1600, ["dp", "greedy"]).length > 0],
  ["Top1 分值在 (0,1]", ranked[0].s > 0 && ranked[0].s <= 1.0],
  ["已做过滤生效", p2 === p1 - 500],
  ["Top5 全在区间内", ranked.every(x => x.p.rating >= 1200 && x.p.rating <= 1600)],
  ["高位标签 trees 过滤正确", allHaveTrees && treesOnly.length > 0],
  ["高位标签 two pointers 过滤正确", allHave2p && twoPtr.length > 0],
  ["trees 与 flows 结果不同", pool(800, 3500, ["trees"]).length !== pool(800, 3500, ["flows"]).length],
];
let ok = true;
for (const [name, pass] of checks) {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}
console.log(ok ? "\n全部通过" : "\n有失败项");
process.exit(ok ? 0 : 1);
