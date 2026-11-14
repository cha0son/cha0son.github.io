/* 在线编译器 · 浏览器端到端测试（可选，需要网络 + 本机 Chrome/Edge）
 *
 * 依赖 puppeteer-core（不放进仓库）：
 *   npm i puppeteer-core
 * 运行：
 *   node _build/compiler-browser-test.js
 *
 * 会真的打开无头浏览器、点「运行」、等 Judge0 返回结果，所以需要联网。
 * 找不到 puppeteer-core / 浏览器时直接跳过，不算失败。
 */
"use strict";

const path = require("path");
const fs = require("fs");
const assert = require("assert");
const { start } = require("./serve.js");

const PORT = 8124;

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    process.env.CHROME_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

let puppeteer = null;
try {
  puppeteer = require("puppeteer-core");
} catch (e) {
  console.log("跳过：没有安装 puppeteer-core（可选依赖）。");
  console.log("  npm i puppeteer-core            # 装完再跑");
  process.exit(0);
}

const browserPath = findBrowser();
if (!browserPath) {
  console.log("跳过：没找到 Chrome / Edge。可用 EDGE_PATH 指定可执行文件。");
  process.exit(0);
}

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  PASS  " + name);
  } catch (e) {
    failures.push(name);
    console.log("  FAIL  " + name + "\n        " + String(e.message || e).split("\n").join("\n        "));
  }
}

async function waitVerdict(page, timeout) {
  await page.waitForFunction(() => {
    const meta = document.getElementById("meta");
    return meta && /通过|编译错误|运行错误|超时|系统错误|运行失败/.test(meta.textContent);
  }, { timeout: timeout || 60000, polling: 200 });
  return page.evaluate(() => ({
    meta: document.getElementById("meta").textContent,
    out: document.getElementById("output").innerText
  }));
}

(async function main() {
  const server = start(PORT, () => {});
  await new Promise((r) => setTimeout(r, 300));

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  const URL = "http://127.0.0.1:" + PORT + "/compiler/";
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 400));

  console.log("\n=== 编译器浏览器端到端 ===");

  await check("页面加载无脚本错误，默认 C++", async () => {
    assert.deepStrictEqual(pageErrors, []);
    const s = await page.evaluate(() => ({
      lang: document.querySelector(".lang.on").dataset.lang,
      file: document.getElementById("filename").textContent,
      lines: document.getElementById("gutter").children.length,
      runLabel: document.getElementById("run").textContent
    }));
    assert.strictEqual(s.lang, "cpp");
    assert.strictEqual(s.file, "main.cpp");
    assert.strictEqual(s.lines, 12);
    assert.match(s.runLabel, /运行/);
  });

  await check("C++ 编译运行 A+B", async () => {
    const t0 = Date.now();
    await page.click("#run");
    const r = await waitVerdict(page);
    assert.match(r.meta, /通过/, "没有通过：" + r.meta);
    assert.match(r.out, /\b8\b/, "输出里没有 8：" + r.out);
    console.log("        用时 " + (Date.now() - t0) + " ms：" + r.meta.replace(/\s+/g, " "));
  });

  await check("编译错误能被识别并展示", async () => {
    await page.evaluate(() => {
      const code = document.getElementById("code");
      code.value = "int main() { int x = ; }";
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.click("#run");
    const r = await waitVerdict(page);
    assert.match(r.meta, /编译错误/, r.meta);
    assert.match(r.out, /error/i);
  });

  await check("切换 Python 后文件名与结果正确", async () => {
    await page.click('[data-lang="py"]');
    await new Promise((r) => setTimeout(r, 200));
    const file = await page.evaluate(() => document.getElementById("filename").textContent);
    assert.strictEqual(file, "main.py");
    await page.click("#run");
    const r = await waitVerdict(page);
    assert.match(r.meta, /通过/, r.meta);
    assert.match(r.out, /\b8\b/);
  });

  await check("分享链接能还原代码", async () => {
    await page.click("#btnShare");
    await new Promise((r) => setTimeout(r, 400));
    const url = page.url();
    assert.ok(url.includes("#s="), "URL 里没有分享参数");
    const p2 = await browser.newPage();
    await p2.goto(url, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 500));
    const restored = await p2.evaluate(() => ({
      lang: document.querySelector(".lang.on").dataset.lang,
      head: document.getElementById("code").value.slice(0, 20)
    }));
    assert.strictEqual(restored.lang, "py");
    assert.match(restored.head, /import sys/);
    await p2.close();
  });

  await browser.close();
  server.close();

  console.log("\n=== 结果 ===");
  if (failures.length) {
    console.log("✗ " + failures.length + " 个失败 / " + passed + " 个通过");
    process.exitCode = 1;
  } else {
    console.log("✓ 全部通过（" + passed + " 项）");
  }
})().catch((e) => {
  console.error("端到端测试崩溃:", e);
  process.exitCode = 1;
});
