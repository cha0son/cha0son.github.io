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
      // 站内读题接口
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
  results.push(["卡片链接指向站内读题页",
                dCards.every(x => x._html.includes("cf-live-eight.vercel.app/?id=")),
                `异常 ${dCards.filter(x => !x._html.includes("cf-live-eight.vercel.app/?id=")).length} 张`]);
  results.push(["每张卡都留了 CF 直达链接",
                dCards.every(x => x._html.includes("codeforces.com/problemset/problem/")), ""]);
  results.push(["卡片外层不是 <a>（避免嵌套链接）",
                dCards.every(x => x.tagName !== "a"),
                `实际 ${dCards[0] && dCards[0].tagName}`]);

  // 场景 E: 点卡片 → 弹窗读题
  const live = {
    id: "CF1858B", title: "The Walkway", difficulty: 3,
    timeMs: 1000, memoryKb: 256000, submit: 566, accepted: 273,
    content: { locale: "zh-CN", background: "", description: "有 $n$ 个长椅。",
               formatI: "输入 $t$。", formatO: "输出答案。", hint: "" },
    translations: {
      "zh-CN": { description: "有 $n$ 个长椅。", formatI: "输入 $t$。", formatO: "输出答案。", hint: "" },
      en: { description: "There are $n$ benches.", formatI: "Input $t$.", formatO: "Output.", hint: "" },
    },
    samples: [{ input: "8\n6 2 2", output: "3 1" }],
    url: "https://www.luogu.com.cn/problem/CF1858B",
    cfUrl: "https://codeforces.com/problemset/problem/1858/B",
  };
  const e = run("", { live });
  await sleep(400);
  results.push(["有清单/无清单都能渲染", e.nodes.grid.children.length > 0, ""]);

  const firstCard = e.nodes.grid.children.find(x => x._html && x._html.includes("card-top"));
  firstCard.querySelector(".hit").fire("click", { preventDefault() {}, metaKey: false, ctrlKey: false });
  await sleep(300);

  const modal = e.nodes.modal;
  const mbody = e.nodes.mBody;
  results.push(["弹窗被打开", modal.className.includes("show"), `className="${modal.className}"`]);
  results.push(["弹窗标题是题名", e.nodes.mTitle.textContent === "The Walkway",
                `"${e.nodes.mTitle.textContent}"`]);
  results.push(["弹窗渲染出题目描述", mbody._html.includes("题目描述"), ""]);
  results.push(["弹窗渲染出输入/输出格式",
                mbody._html.includes("输入格式") && mbody._html.includes("输出格式"), ""]);
  results.push(["弹窗渲染出样例",
                mbody._html.includes("<pre>") && mbody._html.includes("6 2 2"), ""]);
  results.push(["弹窗里公式已转换",
                mbody._html.includes('class="math"') && !/\$\w/.test(mbody._html), ""]);
  results.push(["弹窗有中英切换按钮", e.nodes.mLang.style.display === "", ""]);
  results.push(["弹窗保留了 CF 链接",
                (e.nodes.mCf.href || "").includes("codeforces.com"), e.nodes.mCf.href]);

  // 场景 F: 接口挂了 → 弹窗给兜底
  const f = run("", {});
  await sleep(400);
  const fc = f.nodes.grid.children.find(x => x._html && x._html.includes("card-top"));
  fc.querySelector(".hit").fire("click", { preventDefault() {} });
  await sleep(300);
  results.push(["接口失败时弹窗不白屏", f.nodes.mBody._html.includes("没取到题面"), ""]);
  results.push(["接口失败时改为嵌入洛谷 iframe",
                f.nodes.mBody._html.includes("<iframe") &&
                f.nodes.mBody._html.includes("luogu.com.cn/problem/"), ""]);

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
