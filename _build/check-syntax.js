/* 从 index.html 抽出内联 <script> 做语法检查（不执行）。
   用法: node _build/check-syntax.js
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const file = path.resolve(__dirname, "..", "index.html");
const html = fs.readFileSync(file, "utf8");

const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: 没找到内联 <script>"); process.exit(1); }

const js = m[1];
fs.writeFileSync(path.resolve(__dirname, "_extracted.js"), js, "utf8");
console.log(`抽出脚本 ${js.length} 字符 / ${js.split("\n").length} 行`);

try {
  new vm.Script(js, { filename: "index.inline.js" });
  console.log("PASS: 脚本语法正确");
} catch (e) {
  console.error("FAIL: 语法错误 ->", e.message);
  process.exit(1);
}

// 结构检查
const must = [
  ["双滑条 #lo", /id="lo"/, html],
  ["双滑条 #hi", /id="hi"/, html],
  ["结果网格", /id="grid"/, html],
  ["handle 输入", /id="handle"/, html],
  ["手输 rating", /id="myRating"/, html],
  ["难度提示 #bandHint", /id="bandHint"/, html],
  ["标签筛选容器", /id="chips"/, html],
  ["标签清空按钮", /id="btnClearTags"/, html],
  ["每日一题按钮", /id="btnDaily"/, html],
  ["旧版主页链接", /index\.v1\.html/, html],
  ["调用 CF API", /problemset\.problems/, html],
  ["标签索引用数组不是位掩码", /tags: r\[5\]/, html],
];

// 这些是实现层面的约束，必须不出现
const mustNot = [
  ["标签位运算掩码", /\.mask\b/],
  ["iframe 嵌套", /<iframe/],
  ["卡片上显示标签", /class="tags"/],
  ["旧的 1200 兜底", /rating \|\| 1200/],
];

let ok = true;
for (const [name, re, src] of must) {
  const pass = re.test(src);
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}
for (const [name, re] of mustNot) {
  const pass = !re.test(html);
  console.log(`  ${pass ? "PASS" : "FAIL"}  不应出现: ${name}`);
  if (!pass) ok = false;
}

// id 引用检查：脚本里 $("x") 的 x 必须在 HTML 里存在
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(x => x[1]));
const refs = new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map(x => x[1]));
for (const r of refs) {
  const pass = ids.has(r);
  if (!pass) { console.log(`  FAIL  引用了不存在的 id: #${r}`); ok = false; }
}
console.log(`  检查了 ${refs.size} 个 DOM id 引用`);

process.exit(ok ? 0 : 1);
