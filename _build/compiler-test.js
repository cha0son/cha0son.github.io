/* 在线编译器 · 单元 / 结构测试
   用法: node _build/compiler-test.js
   覆盖: 语言表、高亮（含 XSS 转义）、base64、两种后端的结果归一化、失败切换、页面结构。 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const E = require("../compiler/engine.js");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "compiler", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(ROOT, "compiler", "app.js"), "utf8");

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  PASS  " + name);
  } catch (e) {
    failures.push({ name, error: e });
    console.log("  FAIL  " + name + "\n        " + String(e.message || e).split("\n").join("\n        "));
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  PASS  " + name);
  } catch (e) {
    failures.push({ name, error: e });
    console.log("  FAIL  " + name + "\n        " + String(e.message || e).split("\n").join("\n        "));
  }
}

const b64 = (s) => Buffer.from(String(s), "utf8").toString("base64");
const j0 = (over) => Object.assign({
  stdout: null,
  stderr: null,
  compile_output: null,
  message: null,
  time: null,
  memory: null,
  status: { id: 3, description: "Accepted" }
}, over || {});

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

function mockFetch(handler) {
  const calls = [];
  const fn = async function (url, init) {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    return handler(url, calls.length, calls);
  };
  fn.calls = calls;
  return fn;
}

/* ------------------------------------------------------------------ */
console.log("\n=== 一、页面结构 ===");

test("compiler/index.html 引用了 engine.js 和 app.js", () => {
  assert.match(html, /<script src="engine\.js"><\/script>/);
  assert.match(html, /<script src="app\.js"><\/script>/);
});

test("页面没有外链 script（不依赖 CDN）", () => {
  const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(srcs, ["engine.js", "app.js"]);
});

const REQUIRED_IDS = [
  "code", "stdin", "highlight", "gutter", "filename", "langs", "run",
  "meta", "output", "backend", "backendDot", "backendText",
  "btnShare", "btnReset", "btnClearStdin", "btnCopyOut", "toast"
];
test("页面包含所有关键 DOM id", () => {
  REQUIRED_IDS.forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), "缺少 id=" + id);
  });
});

test("页面有 5 个语言入口 / 运行按钮提示", () => {
  assert.match(html, /Ctrl/);
  assert.match(html, /在线编译器/);
});

test("主页链接到 compiler/", () => {
  const home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.ok(home.includes('href="compiler/"'), "主页没有编译器入口");
});

test("高亮样式类齐全", () => {
  ["tok-c", "tok-s", "tok-p", "tok-n", "tok-k", "tok-t", "tok-fn"].forEach((cls) => {
    assert.ok(html.includes("." + cls), "缺少样式 ." + cls);
  });
});

test("app.js 不直接请求后端（统一走 engine）", () => {
  assert.ok(!/fetch\(\s*["'`]https?:\/\//.test(appJs), "app.js 不应自己 fetch 后端");
  assert.ok(!/JUDGE0_URL|WANDBOX_URL/.test(appJs), "app.js 不应拼后端地址");
});

/* ------------------------------------------------------------------ */
console.log("\n=== 二、语言表 ===");

test("5 种语言，key 唯一", () => {
  assert.strictEqual(E.LANGS.length, 5);
  const keys = E.LANGS.map((l) => l.key);
  assert.deepStrictEqual(keys, ["cpp", "c", "py", "java", "js"]);
});

test("每种语言都有模板 / 文件名 / 双后端配置", () => {
  E.LANGS.forEach((l) => {
    assert.ok(l.template.length > 20, l.key + " 模板太短");
    assert.ok(/\.(cpp|c|py|java|js)$/.test(l.file), l.key + " 文件名不对");
    assert.ok(l.judge0.id > 0, l.key + " 缺 judge0 id");
    assert.ok(l.wandbox.compiler, l.key + " 缺 wandbox compiler");
    assert.ok(l.name && l.short);
  });
});

test("judge0 语言 id 与实测值一致", () => {
  assert.deepStrictEqual(E.LANGS.map((l) => l.judge0.id), [105, 103, 109, 91, 102]);
});

test("未知语言回退到 C++", () => {
  assert.strictEqual(E.getLang("brainfuck").key, "cpp");
  assert.strictEqual(E.getLang(undefined).key, "cpp");
});

test("默认 stdin 是 A+B 的 3 5", () => {
  assert.strictEqual(E.DEFAULT_STDIN.trim(), "3 5");
});

/* ------------------------------------------------------------------ */
console.log("\n=== 三、语法高亮 ===");

test("关键字 / 数字 / 字符串 / 注释着色", () => {
  const out = E.highlight('int x = 42; // hi\nconst char* s = "abc";', "cpp");
  assert.match(out, /tok-k">int</);
  assert.match(out, /tok-n">42</);
  assert.match(out, /tok-c">\/\/ hi</);
  assert.match(out, /tok-s">"abc"</);
});

test("预处理指令着色", () => {
  const out = E.highlight("#include <bits/stdc++.h>", "cpp");
  assert.match(out, /tok-p">#include/);
  assert.match(out, /&lt;bits\/stdc\+\+\.h&gt;/);
});

test("函数调用名着色", () => {
  const out = E.highlight("printf(\"x\");", "cpp");
  assert.match(out, /tok-fn">printf</);
});

test("XSS：源码里的标签被转义", () => {
  const out = E.highlight('<script>alert(1)</script>', "cpp");
  assert.ok(!out.includes("<script>"), "出现了未转义的 <script>");
  assert.ok(out.includes("&lt;script&gt;"), "应该转义成实体");
});

test("XSS：字符串 / 注释里的标签同样转义", () => {
  const out = E.highlight('// <img src=x onerror=alert(1)>\nstring s = "<b>";', "cpp");
  assert.ok(!out.includes("<img"), "注释里的 <img 未转义");
  assert.ok(!out.includes("<b>"), "字符串里的 <b> 未转义");
});

test("Python：def / 注释 / 字符串", () => {
  const out = E.highlight("def f(x):\n    return '#not-comment'  # 注释", "py");
  assert.match(out, /tok-k">def</);
  assert.match(out, /tok-c"># 注释</);
  assert.match(out, /tok-s">'#not-comment'</);
});

test("JavaScript：模板字符串与注释", () => {
  const out = E.highlight("const a = `x${y}`; // hi", "js");
  assert.match(out, /tok-s">`x\$\{y\}`</);
  assert.match(out, /tok-c">\/\/ hi</);
});

test("未知语言不抛异常", () => {
  assert.doesNotThrow(() => E.highlight("int x;", "rust"));
});

test("空代码返回空串；末尾换行补零宽字符", () => {
  assert.strictEqual(E.highlight("", "cpp"), "");
  assert.ok(E.highlight("a\n", "cpp").endsWith("\u200b"));
  assert.ok(!E.highlight("a", "cpp").endsWith("\u200b"));
});

test("countLines", () => {
  assert.strictEqual(E.countLines(""), 1);
  assert.strictEqual(E.countLines("a"), 1);
  assert.strictEqual(E.countLines("a\nb"), 2);
  assert.strictEqual(E.countLines("a\nb\n"), 3);
});

/* ------------------------------------------------------------------ */
console.log("\n=== 四、base64 / 格式化 ===");

test("中文与 emoji 的 base64 往返", () => {
  const s = "中文 ✓ 😀\n\t\"引号\"";
  assert.strictEqual(E.decodeB64(E.encodeB64(s)), s);
});

test("空串 base64", () => {
  assert.strictEqual(E.encodeB64(""), "");
  assert.strictEqual(E.decodeB64(""), "");
  assert.strictEqual(E.decodeB64(null), "");
});

test("时间 / 内存格式化", () => {
  assert.strictEqual(E.formatSeconds(0.004), "4 ms");
  assert.strictEqual(E.formatSeconds(1.5), "1.50 s");
  assert.strictEqual(E.formatSeconds(null), "—");
  assert.strictEqual(E.formatKb(868), "868 KB");
  assert.strictEqual(E.formatKb(12440), "12.1 MB");
  assert.strictEqual(E.formatKb(null), "—");
});

test("escapeHtml", () => {
  assert.strictEqual(E.escapeHtml("<a&b>"), "&lt;a&amp;b&gt;");
});

/* ------------------------------------------------------------------ */
console.log("\n=== 五、Judge0 结果归一化 ===");

test("AC", () => {
  const r = E.normalizeJudge0(j0({ stdout: b64("8\n"), time: "0.004", memory: 1020 }), 120);
  assert.strictEqual(r.verdict, "AC");
  assert.strictEqual(r.stdout, "8\n");
  assert.strictEqual(r.timeSec, 0.004);
  assert.strictEqual(r.memoryKb, 1020);
  assert.strictEqual(r.backend, "judge0");
});

test("CE：编译输出被解码", () => {
  const r = E.normalizeJudge0(j0({
    status: { id: 6, description: "Compilation Error" },
    compile_output: b64("error: expected ';'")
  }), 90);
  assert.strictEqual(r.verdict, "CE");
  assert.strictEqual(r.compileOutput, "error: expected ';'");
});

test("TLE / RE / IE", () => {
  assert.strictEqual(E.normalizeJudge0(j0({ status: { id: 5, description: "Time Limit Exceeded" } }), 1).verdict, "TLE");
  assert.strictEqual(E.normalizeJudge0(j0({ status: { id: 11, description: "Runtime Error" }, stderr: b64("boom") }), 1).verdict, "RE");
  assert.strictEqual(E.normalizeJudge0(j0({ status: { id: 13, description: "Internal Error" } }), 1).verdict, "IE");
});

test("base64:false 时按明文处理（测试/调试用）", () => {
  const r = E.normalizeJudge0({ stdout: "raw", status: { id: 3 } }, 1, { base64: false });
  assert.strictEqual(r.stdout, "raw");
});

test("请求体：base64 编码 + 时限", () => {
  const p = E.buildJudge0Payload(E.getLang("cpp"), "int main(){}", "1 2");
  assert.strictEqual(E.decodeB64(p.source_code), "int main(){}");
  assert.strictEqual(E.decodeB64(p.stdin), "1 2");
  assert.strictEqual(p.language_id, 105);
  assert.strictEqual(p.cpu_time_limit, 5);
});

/* ------------------------------------------------------------------ */
console.log("\n=== 六、Wandbox 结果归一化 ===");

test("AC", () => {
  const r = E.normalizeWandbox({ status: "0", signal: "", compiler_error: "", program_output: "8\n", program_error: "" }, 200);
  assert.strictEqual(r.verdict, "AC");
  assert.strictEqual(r.stdout, "8\n");
  assert.strictEqual(r.backend, "wandbox");
});

test("CE", () => {
  const r = E.normalizeWandbox({ status: "1", compiler_error: "prog.cc:1:1: error: bad", program_output: "" }, 200);
  assert.strictEqual(r.verdict, "CE");
  assert.match(r.compileOutput, /error: bad/);
});

test("RE（非零退出）", () => {
  const r = E.normalizeWandbox({ status: "139", signal: "", program_error: "segfault" }, 200);
  assert.strictEqual(r.verdict, "RE");
});

test("基础设施错误识别为 IE", () => {
  const r = E.normalizeWandbox({ status: "126", compiler_error: "Error: OCI runtime error: crun: clone: Resource temporarily unavailable" }, 200);
  assert.strictEqual(r.verdict, "IE");
  assert.ok(E.isInfraFailure(r.compileOutput));
});

test("Wandbox 请求体：C++ 带 c++17 选项，Python 不带", () => {
  const cpp = E.buildWandboxPayload(E.getLang("cpp"), "int main(){}", "");
  assert.strictEqual(cpp.compiler, "gcc-13.2.0");
  assert.strictEqual(cpp.options, "warning,c++17");
  const py = E.buildWandboxPayload(E.getLang("py"), "print(1)", "");
  assert.strictEqual(py.compiler, "cpython-3.13.8");
  assert.ok(!("options" in py));
});

/* ------------------------------------------------------------------ */
console.log("\n=== 七、runCompile：结果与失败切换 ===");

(async function main() {
  await testAsync("Judge0 成功时返回 AC，且只调用一次", async () => {
    const f = mockFetch(() => jsonResponse(j0({ stdout: b64("8\n"), time: "0.004", memory: 1020 })));
    const r = await E.runCompile({ lang: "cpp", code: "int main(){}", stdin: "3 5", fetch: f });
    assert.strictEqual(r.verdict, "AC");
    assert.strictEqual(r.backend, "judge0");
    assert.strictEqual(f.calls.length, 1);
    assert.ok(f.calls[0].url.includes("ce.judge0.com"));
  });

  await testAsync("编译错误不触发换后端", async () => {
    const f = mockFetch(() => jsonResponse(j0({ status: { id: 6, description: "Compilation Error" }, compile_output: b64("error") })));
    const r = await E.runCompile({ lang: "cpp", code: "bad", fetch: f });
    assert.strictEqual(r.verdict, "CE");
    assert.strictEqual(f.calls.length, 1);
  });

  await testAsync("Judge0 429 → 自动切 Wandbox", async () => {
    const f = mockFetch((url) => {
      if (url.includes("judge0")) return jsonResponse({ error: "Too many requests" }, 429);
      return jsonResponse({ status: "0", compiler_error: "", program_output: "8\n", program_error: "" });
    });
    const r = await E.runCompile({ lang: "cpp", code: "int main(){}", fetch: f });
    assert.strictEqual(r.backend, "wandbox");
    assert.strictEqual(r.stdout, "8\n");
    assert.strictEqual(r.attempts.length, 1);
    assert.match(r.attempts[0].message, /429/);
    assert.strictEqual(f.calls.length, 2);
  });

  await testAsync("Judge0 网络异常 → 切 Wandbox", async () => {
    const f = mockFetch((url) => {
      if (url.includes("judge0")) throw new TypeError("Failed to fetch");
      return jsonResponse({ status: "0", program_output: "ok", compiler_error: "", program_error: "" });
    });
    const r = await E.runCompile({ lang: "py", code: "print(1)", fetch: f });
    assert.strictEqual(r.backend, "wandbox");
    assert.match(r.attempts[0].message, /网络/);
  });

  await testAsync("Judge0 内部错误（status 13）→ 切 Wandbox", async () => {
    const f = mockFetch((url) => {
      if (url.includes("judge0")) return jsonResponse(j0({ status: { id: 13, description: "Internal Error" } }));
      return jsonResponse({ status: "0", program_output: "ok", compiler_error: "", program_error: "" });
    });
    const r = await E.runCompile({ lang: "cpp", code: "int main(){}", fetch: f });
    assert.strictEqual(r.backend, "wandbox");
  });

  await testAsync("两个后端都挂 → ALL_FAILED + 尝试记录", async () => {
    const f = mockFetch((url) => {
      if (url.includes("judge0")) return jsonResponse({ error: "boom" }, 500);
      return jsonResponse({ error: "down" }, 503);
    });
    let err = null;
    try {
      await E.runCompile({ lang: "cpp", code: "int main(){}", fetch: f });
    } catch (e) {
      err = e;
    }
    assert.ok(err, "应该抛错");
    assert.strictEqual(err.code, "ALL_FAILED");
    assert.strictEqual(err.attempts.length, 2);
    assert.ok(err.userMessage);
  });

  await testAsync("Wandbox 的 OCI 错误不会被当成正常结果", async () => {
    const f = mockFetch((url) => {
      if (url.includes("judge0")) return jsonResponse({ error: "boom" }, 500);
      return jsonResponse({
        status: "126",
        compiler_error: "Error: OCI runtime error: crun: clone: Resource temporarily unavailable"
      });
    });
    let err = null;
    try {
      await E.runCompile({ lang: "cpp", code: "x", fetch: f });
    } catch (e) { err = e; }
    assert.ok(err && err.code === "ALL_FAILED");
  });

  await testAsync("请求体里带上了源码与 stdin 的 base64", async () => {
    const f = mockFetch(() => jsonResponse(j0({ stdout: b64("ok") })));
    await E.runCompile({ lang: "java", code: "class Main{}", stdin: "中文", fetch: f });
    const body = f.calls[0].body;
    assert.strictEqual(E.decodeB64(body.source_code), "class Main{}");
    assert.strictEqual(E.decodeB64(body.stdin), "中文");
    assert.strictEqual(body.language_id, 91);
  });

  /* ------------------------------------------------------------------ */
  console.log("\n=== 结果 ===");
  if (failures.length) {
    console.log("✗ " + failures.length + " 个失败 / " + passed + " 个通过");
    failures.forEach((f) => console.log("  - " + f.name));
    process.exitCode = 1;
  } else {
    console.log("✓ 全部通过（" + passed + " 项）");
  }
})().catch((e) => {
  console.error("测试运行器崩溃:", e);
  process.exitCode = 1;
});
