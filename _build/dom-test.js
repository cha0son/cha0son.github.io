/* 用最小 DOM 垫片在 Node 里真跑一遍 index.html 的内联脚本。
   目的: 验证 main() 端到端不抛异常、能渲染出卡片(chip 38 个 / card > 0)。
   用法: node _build/dom-test.js
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const dataRaw = fs.readFileSync(path.join(ROOT, "data", "problems.json"), "utf8");

function makeEl(tag) {
  const el = {
    tagName: tag,
    children: [],
    _html: "",
    className: "",
    textContent: "",
    value: "",
    href: "",
    target: "",
    rel: "",
    scrollTop: 0,
    dataset: {},
    listeners: {},
    style: { setProperty() {}, zIndex: "" },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(c) {
      if (c && c.__frag) {
        for (const x of c.children) el.children.push(x);
        c.children.length = 0;
      } else {
        el.children.push(c);
      }
      return c;
    },
    addEventListener(type, fn) {
      (el.listeners[type] = el.listeners[type] || []).push(fn);
    },
    fire(type, ev) {
      const e = ev || { preventDefault() {}, target: el };
      (el.listeners[type] || []).forEach((fn) => fn(e));
      return e;
    },
    // 每个选择器返回同一个缓存节点，这样脚本挂上的监听器还能被测试触发
    _sub: {},
    querySelector(sel) {
      if (!el._sub[sel]) el._sub[sel] = makeEl("sub");
      return el._sub[sel];
    },
    get innerHTML() { return el._html; },
    set innerHTML(v) { el._html = v; el.children = []; el._sub = {}; },
  };
  return el;
}

function run(hash, opts) {
  opts = opts || {};
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  const nodes = {};
  for (const id of ids) nodes[id] = makeEl("div");

  const store = new Map();
  const errors = [];

  const ctx = {
    console,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 5)),
    clearTimeout,
    URLSearchParams,
    Math, JSON, Date, Object, Array, String, Number, Promise, Map, Set, Float32Array, Error,
    document: {
      getElementById: id => nodes[id] || null,
      createElement: makeEl,
      createDocumentFragment: () => ({
        __frag: true,
        children: [],
        appendChild(c) { this.children.push(c); },
      }),
      addEventListener() {},
    },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    AbortController: class { constructor(){ this.signal = {}; } abort(){} },
    fetch: async (url) => {
      const u = String(url);
      // Codeforces API（账号分析）
      if (u.indexOf("codeforces.com/api/") >= 0) {
        if (u.indexOf("user.info") >= 0) {
          return { ok: true, json: async () => ({ status: "OK", result: [opts.cfInfo || {}] }) };
        }
        if (u.indexOf("user.status") >= 0) {
          return { ok: true, json: async () => ({ status: "OK", result: opts.cfSubs || [] }) };
        }
        return { ok: false, json: async () => ({ status: "FAILED" }) };
      }
      // 同源静态题面：reader/data/{tag}.json
      if (u.indexOf("reader/data/") >= 0) {
        if (!opts.local) return { ok: false, json: async () => ({}) };
        return { ok: true, json: async () => opts.local };
      }
      // 在线接口
      if (u.indexOf("/api/problem") >= 0) {
        if (!opts.live) return { ok: false, json: async () => ({ error: "接口不可用" }) };
        return { ok: true, json: async () => opts.live };
      }
      // 离线页清单
      if (u.indexOf("manifest.json") >= 0) {
        if (!opts.manifest) return { ok: false, json: async () => ({}) };
        return { ok: true, json: async () => ({ gen: 1, ids: opts.manifest }) };
      }
      return { ok: true, json: async () => JSON.parse(dataRaw) };
    },
    requestAnimationFrame: fn => setTimeout(fn, 0),
    history: { replaceState() {} },
    location: { hash: hash || "" },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;

  const sandbox = vm.createContext(ctx);
  try {
    new vm.Script(js, { filename: "index.inline.js" }).runInContext(sandbox);
  } catch (e) {
    errors.push("同步抛错: " + e.message);
  }
  return { nodes, errors, store };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const results = [];

  // 场景 A: 默认打开
  const a = run("");
  await sleep(400);
  results.push(["默认加载无异常", a.errors.length === 0, a.errors.join(" | ")]);
  results.push(["渲染出题目卡片", a.nodes.grid.children.length > 0, `实际 ${a.nodes.grid.children.length} 个节点`]);
  results.push(["命中数已写入", /^\d[\d,]*$/.test(a.nodes.count.textContent), `count="${a.nodes.count.textContent}"`]);
  results.push(["状态栏已更新", a.nodes.statusText.textContent.includes("道有评级的题目"), `"${a.nodes.statusText.textContent}"`]);
  results.push(["无骨架屏残留", !a.nodes.grid.innerHTML.includes("skel") || a.nodes.grid.children.length > 0, ""]);

  // 场景 B: 带 hash 直达 (高难度 + 挑战档)
  const b = run("#lo=2400&hi=2600&c=hard");
  await sleep(400);
  results.push(["hash 加载无异常", b.errors.length === 0, b.errors.join(" | ")]);
  results.push(["hash 生效(难度区间)", b.nodes.rangeLabel.textContent === "2400 – 2600", `"${b.nodes.rangeLabel.textContent}"`]);
  results.push(["hash 生效(有结果)", b.nodes.grid.children.length > 0, `实际 ${b.nodes.grid.children.length}`]);
  results.push(["卡片不再含标签块", !b.nodes.grid.children.some(x => x._html && x._html.includes('class="tags"')), ""]);

  // 场景 C: 最高难度档（滑条能选到的极值），确认不会出现空结果
  const c = run("#lo=3400&hi=3500&c=hard");
  await sleep(400);
  results.push(["最高难度档不崩", c.errors.length === 0, c.errors.join(" | ")]);
  results.push(["最高难度档有结果", c.nodes.grid.children.length > 0, `实际 ${c.nodes.grid.children.length}`]);

  // 场景 D: 没有离线页清单 → 卡片仍然指向站内读题（走在线接口）
  const d = run("", {});
  await sleep(400);
  const dCards = d.nodes.grid.children.filter(x => x._html && x._html.includes("card-top"));
  results.push(["无清单时卡片数量正常", dCards.length > 0, `实际 ${dCards.length}`]);
  results.push(["卡片链接指向洛谷",
                dCards.every(x => x._html.includes("luogu.com.cn/problem/CF")),
                `异常 ${dCards.filter(x => !x._html.includes("luogu.com.cn/problem/CF")).length} 张`]);
  results.push(["每张卡都留了 CF 直达链接",
                dCards.every(x => x._html.includes("codeforces.com/problemset/problem/")), ""]);
  results.push(["卡片外层不是 <a>（避免嵌套链接）",
                dCards.every(x => x.tagName !== "a"),
                `实际 ${dCards[0] && dCards[0].tagName}`]);

  // 场景 E: 卡片直接跳洛谷（不再弹窗）
  const e = run("", {});
  await sleep(400);
  const firstCard = e.nodes.grid.children.find(x => x._html && x._html.includes("card-top"));
  results.push(["卡片 href 指向洛谷", firstCard._html.includes("luogu.com.cn/problem/CF"), ""]);
  results.push(["卡片新标签打开", firstCard._html.includes('target="_blank"'), ""]);
  results.push(["卡片保留 CF 直达链接",
                firstCard._html.includes("codeforces.com/problemset/problem/"), ""]);
  firstCard.querySelector(".hit").fire("click", { preventDefault() {} });
  await sleep(150);
  results.push(["页面已无读题弹窗", !html.includes('id="modal"'), ""]);
  results.push(["点击不再拦截跳转（无 openReader）", !html.includes("openReader"), ""]);

  // 场景 F: 快捷难度区间
  results.push(["有 800 起步的快捷区间",
                /data-lo="800"\s+data-hi="1000"/.test(html), ""]);
  results.push(["快捷区间按钮齐全",
                (html.match(/data-lo="\d+"/g) || []).length >= 6,
                `HTML 里 ${(html.match(/data-lo="\d+"/g) || []).length} 个`]);

  // 场景 F2: 标签筛选（只过滤，卡片上不显示标签）
  const noTag = run("", {});
  await sleep(400);
  const baseCount = noTag.nodes.count.textContent;

  const withTag = run("#lo=1400&hi=1600&t=dp", {});
  await sleep(400);
  const tagCount = withTag.nodes.count.textContent;
  results.push(["标签筛选生效（结果变少）",
                parseInt(tagCount.replace(/,/g, ""), 10) <
                parseInt(baseCount.replace(/,/g, ""), 10),
                `${baseCount} -> ${tagCount}`]);
  const tagCards = withTag.nodes.grid.children.filter(x => x._html && x._html.includes("card-top"));
  results.push(["筛选后仍有题", tagCards.length > 0, `实际 ${tagCards.length}`]);
  results.push(["卡片上不显示标签",
                tagCards.every(x => !x._html.includes('class="tags"')), ""]);
  results.push(["标签筛选区渲染出 chip",
                /data-tag="/.test(withTag.nodes.chips._html), ""]);

  // 场景 F3: 手输 rating → 自动匹配难度带（1500 -> 1400-1800）
  const rt = run("", {});
  await sleep(400);
  rt.nodes.myRating.value = "1500";
  rt.nodes.myRating.fire("input");
  await sleep(300);
  results.push(["填 rating 后自动匹配难度带",
                rt.nodes.rangeLabel.textContent === "1400 – 1800",
                `"${rt.nodes.rangeLabel.textContent}"`]);
  results.push(["难度提示写明依据",
                /1500/.test(rt.nodes.bandHint.textContent),
                `"${rt.nodes.bandHint.textContent}"`]);

  // 场景 G: 未定级但有过题记录 → 必须按记录估算，不能瞎套 1200
  const subsLow = [
    { verdict: "OK", problem: { contestId: 1, index: "A", rating: 800 } },
    { verdict: "OK", problem: { contestId: 2, index: "A", rating: 800 } },
    { verdict: "OK", problem: { contestId: 3, index: "A", rating: 900 } },
    { verdict: "OK", problem: { contestId: 4, index: "A", rating: 900 } },
    { verdict: "OK", problem: { contestId: 5, index: "A", rating: 900 } },
    { verdict: "WRONG_ANSWER", problem: { contestId: 6, index: "C", rating: 1600 } },
  ];
  const g = run("", { cfInfo: { handle: "newbie01" }, cfSubs: subsLow });
  await sleep(400);
  g.nodes.handle.value = "newbie01";
  g.nodes.btnAnalyze.fire("click");
  await sleep(600);
  const gt = String(g.nodes.profile._html);
  results.push(["未定级账号标为未定级", gt.includes("未定级"), ""]);
  results.push(["显示了估算水平", gt.includes("估算水平"), ""]);
  results.push(["估算来自过题记录", gt.includes("已 AC 题目"), ""]);
  results.push(["估算值 950（不是 1200）", gt.includes(">950<"), ""]);
  results.push(["统计到 5 道过题", gt.includes(">5<"), ""]);
  results.push(["识别出曾尝试未通过", gt.includes("曾尝试未通过"), ""]);

  // 场景 H: 官方 rating 优先
  const h = run("", {
    cfInfo: { handle: "rated01", rating: 1723, maxRating: 1800 },
    cfSubs: [{ verdict: "OK", problem: { contestId: 9, index: "A", rating: 1200 } }],
  });
  await sleep(400);
  h.nodes.handle.value = "rated01";
  h.nodes.btnAnalyze.fire("click");
  await sleep(600);
  const ht = String(h.nodes.profile._html);
  results.push(["有官方 rating 时用它", ht.includes("1723"), ht.replace(/<[^>]+>/g, " ").slice(0, 80)]);
  results.push(["官方 rating 时不标估算", !ht.includes("估算水平"), ""]);

  // 场景 I: 完全无提交记录 → 明确说无法判断
  const i2 = run("", { cfInfo: { handle: "empty01" }, cfSubs: [] });
  await sleep(400);
  i2.nodes.handle.value = "empty01";
  i2.nodes.btnAnalyze.fire("click");
  await sleep(600);
  const it = String(i2.nodes.profile._html);
  results.push(["无记录时明说无法判断", it.includes("无法判断"), ""]);
  results.push(["无记录时给出建议", it.includes("手动把难度区间"), ""]);

  console.log("=== DOM 端到端测试 ===");
  let ok = true;
  for (const [name, pass, detail] of results) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
    if (!pass) ok = false;
  }

  // 打印一张真实渲染出的卡片，肉眼确认内容
  const card = a.nodes.grid.children.find(x => x._html && x._html.includes("card-top"));
  if (card) {
    console.log("\n=== 渲染样例（去掉标签后的纯文本骨架）===");
    console.log(card._html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200));
  }

  console.log(ok ? "\n全部通过" : "\n有失败项");
  process.exit(ok ? 0 : 1);
})();
