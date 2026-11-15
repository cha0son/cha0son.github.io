/*!
 * 在线编译器 · 交互层
 * ------------------------------------------------------------------
 * 编辑器（textarea + 高亮叠层）、语言切换、草稿、分享、运行与结果渲染。
 * 纯逻辑在 engine.js 里，这一层只负责 DOM。
 */
(function () {
  "use strict";

  var E = window.CompilerEngine;
  if (!E) return;

  var STORE_KEY = "cha0son.compiler.v1";
  var SAVE_DELAY = 500;

  function $(id) { return document.getElementById(id); }

  var els = {
    code: $("code"),
    stdin: $("stdin"),
    highlight: $("highlight"),
    gutter: $("gutter"),
    filename: $("filename"),
    langs: $("langs"),
    run: $("run"),
    meta: $("meta"),
    output: $("output"),
    backendDot: $("backendDot"),
    backendText: $("backendText"),
    backend: $("backend"),
    complete: $("complete"),
    toast: $("toast"),
    editor: $("editor")
  };

  var state = {
    lang: "cpp",
    running: false,
    drafts: {},
    lastText: "",
    gutterLines: 0,
    saveTimer: null,
    elapsedTimer: null,
    completion: { open: false, items: [], index: 0, start: 0, word: "" }
  };

  /* ================= 存储 ================= */

  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1,
        lang: state.lang,
        ts: Date.now(),
        drafts: state.drafts
      }));
    } catch (e) { /* 隐私模式 / 配额满，忽略 */ }
  }

  function saveDraftNow() {
    state.drafts[state.lang] = {
      code: els.code.value,
      stdin: els.stdin.value
    };
    writeStore();
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveDraftNow, SAVE_DELAY);
  }

  /* ================= 语言 ================= */

  function buildLangTabs() {
    els.langs.innerHTML = "";
    E.LANGS.forEach(function (lang) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lang";
      btn.dataset.lang = lang.key;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-label", lang.name + "（" + lang.judge0.label + "）");

      var name = document.createElement("span");
      name.className = "lang-name";
      name.textContent = lang.name;

      var ver = document.createElement("small");
      ver.textContent = lang.judge0.label;

      btn.appendChild(name);
      btn.appendChild(ver);
      btn.addEventListener("click", function () { switchLang(lang.key); });
      els.langs.appendChild(btn);
    });
  }

  function updateTabs() {
    Array.prototype.forEach.call(els.langs.children, function (btn) {
      var on = btn.dataset.lang === state.lang;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function setLang(key, preset) {
    key = E.getLang(key).key;
    state.lang = key;
    var lang = E.getLang(key);
    var draft = preset || state.drafts[key] || {};
    els.code.value = draft.code != null ? draft.code : lang.template;
    els.stdin.value = draft.stdin != null ? draft.stdin : E.DEFAULT_STDIN;
    els.filename.textContent = lang.file;
    updateTabs();
    refreshEditor();
    scheduleSave();
  }

  function switchLang(key) {
    if (key === state.lang) return;
    hideCompletion();
    saveDraftNow();
    setLang(key);
    els.code.focus();
  }

  /* ================= 编辑器 ================= */

  function refreshEditor() {
    els.highlight.innerHTML = E.highlight(els.code.value, state.lang);
    updateGutter();
    syncScroll();
  }

  function updateGutter() {
    var n = E.countLines(els.code.value);
    if (n === state.gutterLines) return;
    state.gutterLines = n;
    var buf = [];
    for (var i = 1; i <= n; i++) buf.push("<span>" + i + "</span>");
    els.gutter.innerHTML = buf.join("");
  }

  function syncScroll() {
    els.highlight.scrollTop = els.code.scrollTop;
    els.highlight.scrollLeft = els.code.scrollLeft;
    els.gutter.scrollTop = els.code.scrollTop;
  }

  function setCaret(pos) {
    try {
      els.code.selectionStart = els.code.selectionEnd = pos;
    } catch (e) { /* ignore */ }
  }

  function replaceRange(start, end, text) {
    var ta = els.code;
    if (ta.setRangeText) ta.setRangeText(text, start, end, "select");
    else {
      ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
      setCaret(start + text.length);
    }
    refreshEditor();
    scheduleSave();
  }

  function insertText(text) {
    var ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch (e) { ok = false; }
    if (!ok) {
      var s = els.code.selectionStart;
      var en = els.code.selectionEnd;
      replaceRange(s, en, text);
      setCaret(s + text.length);
    } else {
      refreshEditor();
      scheduleSave();
    }
  }

  function handleTab(outdent) {
    var ta = els.code;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var val = ta.value;

    if (val.slice(start, end).indexOf("\n") >= 0) {
      var lineStart = val.lastIndexOf("\n", start - 1) + 1;
      var lineEnd = val.indexOf("\n", end);
      if (lineEnd < 0) lineEnd = val.length;
      var block = val.slice(lineStart, lineEnd);
      var changed = block.split("\n").map(function (ln) {
        if (!outdent) return "  " + ln;
        if (ln.slice(0, 2) === "  ") return ln.slice(2);
        if (ln.charAt(0) === " ") return ln.slice(1);
        return ln;
      }).join("\n");
      if (changed !== block) {
        replaceRange(lineStart, lineEnd, changed);
        ta.selectionStart = lineStart;
        ta.selectionEnd = lineStart + changed.length;
      }
      return;
    }

    if (outdent) {
      var lineStart = val.lastIndexOf("\n", start - 1) + 1;
      var line = val.slice(lineStart);
      var removed = 0;
      if (line.slice(0, 2) === "  ") removed = 2;
      else if (line.charAt(0) === " ") removed = 1;
      if (!removed) return;
      replaceRange(lineStart, lineStart + removed, "");
      setCaret(Math.max(lineStart, start - removed));
      return;
    }

    insertText("  ");
  }

  function handleEnter(e) {
    var ta = els.code;
    if (ta.selectionStart !== ta.selectionEnd) return;
    var pos = ta.selectionStart;
    var val = ta.value;
    var before = val.slice(0, pos);
    var lineStart = before.lastIndexOf("\n") + 1;
    var indent = (before.slice(lineStart).match(/^[ \t]*/) || [""])[0];
    var prev = val.charAt(pos - 1);
    var next = val.charAt(pos);

    var text = "\n" + indent + (prev === "{" ? "  " : "");
    var offset = text.length;
    if (prev === "{" && next === "}") {
      text = "\n" + indent + "  " + "\n" + indent;
      offset = 1 + indent.length + 2;
    }

    e.preventDefault();
    insertText(text);
    setCaret(pos + offset);
  }

  function onCodeKeydown(e) {
    // 补全面板打开时，方向键/回车/Tab/Esc 归它管
    if (state.completion.open && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
      var k = e.key;
      if (k === "ArrowDown") { e.preventDefault(); moveCompletion(1); return; }
      if (k === "ArrowUp") { e.preventDefault(); moveCompletion(-1); return; }
      if (k === "Enter" || (k === "Tab" && !e.shiftKey)) { e.preventDefault(); acceptCompletion(); return; }
      if (k === "Escape") { e.preventDefault(); hideCompletion(); return; }
      if (k === "Tab" && e.shiftKey) { hideCompletion(); }
      if (k === "ArrowLeft" || k === "ArrowRight" || k === "Home" || k === "End" ||
          k === "PageUp" || k === "PageDown") {
        hideCompletion();
      }
    }

    if (e.key === "Tab") {
      e.preventDefault();
      handleTab(e.shiftKey);
      return;
    }
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
      handleEnter(e);
    }
  }

  /* ================= 自动补全 ================= */

  var COMPLETE_LIMIT = 8;

  /** 光标前正在输入的那个词；少于 2 个字符或存在选区时返回 null。 */
  function currentWordPrefix() {
    var ta = els.code;
    if (ta.selectionStart !== ta.selectionEnd) return null;
    var pos = ta.selectionStart;
    var m = ta.value.slice(0, pos).match(/[A-Za-z_][A-Za-z0-9_]*$/);
    if (!m || m[0].length < 2) return null;
    return { word: m[0], start: pos - m[0].length };
  }

  /** 用一个不可见的镜像 div 算出光标在屏幕上的位置。 */
  function caretPoint(pos) {
    var ta = els.code;
    var rect = ta.getBoundingClientRect();
    var cs = getComputedStyle(ta);
    var mirror = document.createElement("div");
    mirror.style.position = "fixed";
    mirror.style.visibility = "hidden";
    mirror.style.left = rect.left + "px";
    mirror.style.top = rect.top + "px";
    mirror.style.width = ta.clientWidth + "px";
    mirror.style.height = ta.clientHeight + "px";
    mirror.style.overflow = "hidden";
    mirror.style.whiteSpace = "pre";
    mirror.style.boxSizing = "border-box";
    mirror.style.pointerEvents = "none";
    ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing",
      "textTransform", "textIndent", "wordSpacing", "tabSize", "MozTabSize",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].forEach(function (prop) {
      if (cs[prop]) mirror.style[prop] = cs[prop];
    });

    mirror.textContent = ta.value.slice(0, pos);
    var mark = document.createElement("span");
    mark.textContent = ta.value.slice(pos) || "\u200b";
    mirror.appendChild(mark);
    document.body.appendChild(mirror);
    var r = mark.getBoundingClientRect();
    document.body.removeChild(mirror);

    return {
      left: r.left - ta.scrollLeft,
      top: r.top - ta.scrollTop,
      bottom: r.bottom - ta.scrollTop
    };
  }

  function hideCompletion() {
    var st = state.completion;
    if (!st.open && !els.complete.innerHTML) return;
    st.open = false;
    st.items = [];
    st.index = 0;
    els.complete.hidden = true;
    els.complete.innerHTML = "";
  }

  function renderCompletion() {
    var st = state.completion;
    els.complete.innerHTML = "";
    st.items.forEach(function (item, i) {
      var row = document.createElement("div");
      row.className = "c-item" + (i === st.index ? " on" : "");
      row.setAttribute("role", "option");
      row.dataset.index = String(i);

      var word = document.createElement("span");
      word.className = "c-word";
      word.textContent = item.word;
      var kind = document.createElement("span");
      kind.className = "c-kind";
      kind.textContent = item.kind;

      row.appendChild(word);
      row.appendChild(kind);
      els.complete.appendChild(row);
    });
  }

  function positionCompletion() {
    var st = state.completion;
    if (!st.open) return;
    var pt = caretPoint(els.code.selectionStart);
    var pop = els.complete;
    pop.style.left = "0px";
    pop.style.top = "0px";
    var pw = pop.offsetWidth;
    var ph = pop.offsetHeight;
    var left = Math.max(8, Math.min(pt.left, window.innerWidth - pw - 8));
    var top = pt.bottom + 4;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, pt.top - ph - 4);
    pop.style.left = Math.round(left) + "px";
    pop.style.top = Math.round(top) + "px";
  }

  function updateCompletion() {
    if (state.running) { hideCompletion(); return; }
    var info = currentWordPrefix();
    if (!info) { hideCompletion(); return; }
    if (els.code.value.length > 200000) { hideCompletion(); return; }

    var items = E.completionsFor(state.lang, info.word, els.code.value, COMPLETE_LIMIT);
    if (!items.length) { hideCompletion(); return; }

    var st = state.completion;
    st.open = true;
    st.items = items;
    st.index = 0;
    st.start = info.start;
    st.word = info.word;
    els.complete.hidden = false;
    renderCompletion();
    positionCompletion();
  }

  function moveCompletion(delta) {
    var st = state.completion;
    if (!st.open || !st.items.length) return;
    st.index = (st.index + delta + st.items.length) % st.items.length;
    renderCompletion();
    var row = els.complete.children[st.index];
    if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
  }

  function acceptCompletion() {
    var st = state.completion;
    if (!st.open || !st.items.length) return;
    var item = st.items[st.index];
    var ta = els.code;
    ta.setSelectionRange(st.start, ta.selectionStart);
    insertText(item.word);
    hideCompletion();
    ta.focus();
  }

  /* ================= 分享 ================= */

  function base64UrlEncode(str) {
    return E.encodeB64(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64UrlDecode(str) {
    var s = str.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return E.decodeB64(s);
  }

  function parseShare() {
    var h = location.hash || "";
    if (h.indexOf("#s=") !== 0) return null;
    try {
      var obj = JSON.parse(base64UrlDecode(h.slice(3)));
      if (!obj || typeof obj.c !== "string") return null;
      return {
        lang: E.getLang(obj.l).key,
        code: obj.c,
        stdin: typeof obj.i === "string" ? obj.i : ""
      };
    } catch (e) {
      return null;
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error("copy failed"));
    });
  }

  function share() {
    var url;
    try {
      var payload = JSON.stringify({
        v: 1,
        l: state.lang,
        c: els.code.value,
        i: els.stdin.value
      });
      url = location.origin + location.pathname + "#s=" + base64UrlEncode(payload);
      history.replaceState(null, "", url);
    } catch (e) {
      url = String(location.href);
    }
    copyText(url).then(function () {
      toast("分享链接已复制，包含当前代码与输入");
    }, function () {
      toast("复制失败，请手动复制地址栏", true);
    });
  }

  /* ================= 结果渲染 ================= */

  function stat(label, value) {
    var span = document.createElement("span");
    span.className = "stat";
    var b = document.createElement("b");
    b.textContent = label;
    span.appendChild(b);
    span.appendChild(document.createTextNode(value));
    return span;
  }

  function verdictChip(v) {
    var chip = document.createElement("span");
    chip.className = "verdict " + String(v || "ie").toLowerCase();
    chip.textContent = E.statusLabel(v);
    return chip;
  }

  function section(title, text, cls) {
    var sec = document.createElement("section");
    sec.className = "out-block" + (cls ? " " + cls : "");
    var h = document.createElement("div");
    h.className = "out-title";
    h.textContent = title;
    var pre = document.createElement("pre");
    pre.className = "out-text";
    if (text.length > 200000) {
      pre.textContent = text.slice(0, 200000) + "\n…（输出过长，已截断）";
    } else {
      pre.textContent = text;
    }
    sec.appendChild(h);
    sec.appendChild(pre);
    return sec;
  }

  function renderRunning(stage) {
    var started = state.runStarted || Date.now();
    var sec = document.createElement("div");
    sec.className = "running";
    var sp = document.createElement("span");
    sp.className = "spinner";
    var txt = document.createElement("span");
    txt.textContent = stage || "正在编译运行…";
    var el = document.createElement("span");
    el.className = "elapsed";
    el.id = "elapsed";
    el.textContent = ((Date.now() - started) / 1000).toFixed(1) + " s";
    sec.appendChild(sp);
    sec.appendChild(txt);
    sec.appendChild(el);
    els.output.innerHTML = "";
    els.output.appendChild(sec);
  }

  function setMetaEmpty(text) {
    els.meta.innerHTML = "";
    var span = document.createElement("span");
    span.className = "dim";
    span.textContent = text;
    els.meta.appendChild(span);
  }

  function renderResult(res) {
    els.meta.innerHTML = "";
    els.meta.appendChild(verdictChip(res.verdict));

    if (res.timeSec != null) els.meta.appendChild(stat("时间", E.formatSeconds(res.timeSec)));
    else if (res.wallMs) els.meta.appendChild(stat("耗时", E.formatSeconds(res.wallMs / 1000)));

    if (res.memoryKb != null) els.meta.appendChild(stat("内存", E.formatKb(res.memoryKb)));
    if (res.exitCode != null && res.verdict !== "AC" && res.verdict !== "CE") {
      els.meta.appendChild(stat("退出码", String(res.exitCode)));
    }
    els.meta.appendChild(stat("后端", res.backend === "wandbox" ? "Wandbox" : "Judge0"));

    els.output.innerHTML = "";
    var parts = [];

    if (res.verdict === "CE") {
      els.output.appendChild(section("编译错误", res.compileOutput || res.message || res.statusText || "编译失败", "err"));
      parts.push(res.compileOutput || res.message || "编译失败");
    } else {
      if (res.compileOutput) {
        els.output.appendChild(section("编译告警", res.compileOutput, "warn"));
        parts.push(res.compileOutput);
      }

      var outLabel = res.verdict === "TLE" ? "标准输出（可能不完整）" : "标准输出";
      if (res.stdout) {
        els.output.appendChild(section(outLabel, res.stdout));
        parts.push(res.stdout);
      } else {
        var emptySec = section(outLabel, "（没有输出）");
        emptySec.querySelector(".out-text").style.color = "#4c5665";
        els.output.appendChild(emptySec);
      }

      if (res.stderr) {
        els.output.appendChild(section("标准错误", res.stderr, "err"));
        parts.push(res.stderr);
      }
      if (res.message && !res.stdout && !res.stderr) {
        els.output.appendChild(section("系统消息", res.message, "warn"));
        parts.push(res.message);
      }
      if (res.verdict === "TLE") {
        els.output.appendChild(section("提示", "运行超过 5 秒被判超时。检查是否有死循环，或输入规模是否过大。", "warn"));
      } else if (res.verdict === "RE" && !res.stderr) {
        els.output.appendChild(section("提示", "程序以非零状态退出（" + (res.statusText || res.exitCode) + "）。", "warn"));
      }
    }

    state.lastText = parts.join("\n");

    if (res.attempts && res.attempts.length) {
      var note = document.createElement("div");
      note.className = "fail-hint";
      note.textContent = "已自动切换备用后端：" + res.attempts.map(function (a) {
        return a.backend + "（" + a.message + "）";
      }).join("；");
      els.output.appendChild(note);
    }
  }

  function renderFailure(err) {
    els.meta.innerHTML = "";
    els.meta.appendChild(verdictChip("IE"));

    els.output.innerHTML = "";
    var msg = (err && (err.userMessage || err.message)) || "未知错误";
    els.output.appendChild(section("运行失败", msg, "err"));

    var hints = [];
    if (err && err.attempts && err.attempts.length) {
      err.attempts.forEach(function (a) {
        hints.push(a.backend + "：" + a.message);
      });
    }
    var box = document.createElement("div");
    box.className = "fail-hint";
    box.appendChild(document.createTextNode("可能的原因："));
    var ul = document.createElement("ul");
    ["网络断了或代理拦住了 ce.judge0.com", "公共编译服务临时限流（稍等几秒再点运行）", "浏览器插件拦截了跨域请求"].forEach(function (t) {
      var li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if (hints.length) {
      var p = document.createElement("p");
      p.style.marginTop = "8px";
      p.textContent = "后端返回：" + hints.join("；");
      box.appendChild(p);
    }
    els.output.appendChild(box);
  }

  /* ================= 后端状态 ================= */

  function setBackend(kind) {
    els.backendDot.className = "dot" + (kind === "ok" ? " ok" : kind === "warn" ? " warn" : kind === "err" ? " err" : "");
    els.backendText.textContent =
      kind === "ok" ? "Judge0 在线" :
      kind === "warn" ? "Wandbox 备用" :
      kind === "err" ? "后端不可用" : "后端：自动";
    els.backend.title =
      kind === "ok" ? "主后端 Judge0 CE 可用" :
      kind === "warn" ? "主后端不可用，正在使用备用后端 Wandbox" :
      kind === "err" ? "两个公共编译后端都不可用" : "运行后显示实际使用的后端";
  }

  /* ================= 运行 ================= */

  function setRunning(on) {
    els.run.disabled = on;
    els.run.innerHTML = on
      ? '<span class="spin"></span><span class="run-label">运行中</span>'
      : '<span class="run-label">运行</span><kbd>Ctrl</kbd><kbd>↵</kbd>';
  }

  function run() {
    if (state.running) return;
    hideCompletion();
    var code = els.code.value;
    if (!code.trim()) {
      toast("先写点代码再运行", true);
      els.code.focus();
      return;
    }

    saveDraftNow();
    state.running = true;
    state.runStarted = Date.now();
    setRunning(true);
    renderRunning("正在连接编译后端…");
    setMetaEmpty("运行中…");

    state.elapsedTimer = setInterval(function () {
      var el = $("elapsed");
      if (el) el.textContent = ((Date.now() - state.runStarted) / 1000).toFixed(1) + " s";
    }, 100);

    E.runCompile({
      lang: state.lang,
      code: code,
      stdin: els.stdin.value,
      timeoutMs: 30000,
      onStage: function (stage) {
        renderRunning(stage.text);
        var el = $("elapsed");
        if (el) el.textContent = ((Date.now() - state.runStarted) / 1000).toFixed(1) + " s";
      }
    }).then(function (res) {
      renderResult(res);
      setBackend(res.backend === "wandbox" ? "warn" : "ok");
      if (res.verdict === "AC") toast("通过 · " + E.formatSeconds(res.timeSec != null ? res.timeSec : res.wallMs / 1000));
      if (window.matchMedia && window.matchMedia("(max-width: 980px)").matches) {
        var pane = document.querySelector(".out-pane");
        if (pane && pane.scrollIntoView) {
          setTimeout(function () { pane.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
        }
      }
    }).catch(function (err) {
      renderFailure(err);
      setBackend("err");
    }).then(function () {
      clearInterval(state.elapsedTimer);
      state.running = false;
      setRunning(false);
    });
  }

  /* ================= 杂项 ================= */

  var toastTimer = null;
  function toast(msg, isErr) {
    els.toast.textContent = msg;
    els.toast.className = "show" + (isErr ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.className = ""; }, 2800);
  }

  function resetTemplate() {
    var lang = E.getLang(state.lang);
    if (!window.confirm("恢复 " + lang.name + " 的默认模板？当前代码会被覆盖。")) return;
    hideCompletion();
    delete state.drafts[state.lang];
    els.code.value = lang.template;
    els.stdin.value = E.DEFAULT_STDIN;
    refreshEditor();
    saveDraftNow();
    toast("已恢复默认模板");
  }

  /* ================= 初始化 ================= */

  function init() {
    var store = readStore();
    state.drafts = store.drafts || {};

    buildLangTabs();

    var shared = parseShare();
    if (shared) {
      state.lang = shared.lang;
      setLang(shared.lang, { code: shared.code, stdin: shared.stdin });
      toast("已载入分享的代码");
    } else {
      var langKey = store.lang && E.getLang(store.lang).key ? store.lang : "cpp";
      setLang(langKey);
    }

    els.code.addEventListener("input", function () {
      refreshEditor();
      scheduleSave();
      updateCompletion();
    });
    els.code.addEventListener("scroll", function () {
      syncScroll();
      hideCompletion();
    });
    els.code.addEventListener("keydown", onCodeKeydown);
    els.code.addEventListener("blur", hideCompletion);
    els.code.addEventListener("click", hideCompletion);
    els.code.addEventListener("compositionstart", hideCompletion);
    els.stdin.addEventListener("input", scheduleSave);

    els.complete.addEventListener("mousedown", function (e) { e.preventDefault(); });
    els.complete.addEventListener("click", function (e) {
      var row = e.target && e.target.closest ? e.target.closest(".c-item") : null;
      if (!row) return;
      var idx = Number(row.dataset.index);
      if (isFinite(idx)) {
        state.completion.index = idx;
        acceptCompletion();
      }
    });

    $("run").addEventListener("click", run);
    $("btnShare").addEventListener("click", share);
    $("btnReset").addEventListener("click", resetTemplate);
    $("btnClearStdin").addEventListener("click", function () {
      els.stdin.value = "";
      scheduleSave();
      els.stdin.focus();
    });
    $("btnCopyOut").addEventListener("click", function () {
      if (!state.lastText) { toast("还没有可复制的输出", true); return; }
      copyText(state.lastText).then(function () { toast("输出已复制"); },
        function () { toast("复制失败", true); });
    });

    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        run();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveDraftNow();
        toast("草稿已保存到本机");
      }
    });

    window.addEventListener("pagehide", saveDraftNow);
    window.addEventListener("resize", function () {
      syncScroll();
      hideCompletion();
    });

    if (shared) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }

    refreshEditor();
    setBackend(null);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
