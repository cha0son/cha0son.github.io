/*!
 * 在线编译器 · 逻辑层
 * ------------------------------------------------------------------
 * 这一层不碰 DOM：语法高亮、base64、后端协议、结果归一化全在这里，
 * 所以可以直接在 Node 里 require 进来跑单元测试（见 _build/compiler-test.js）。
 *
 * 后端：Judge0 CE（主）/ Wandbox（备）。两者都开 CORS，浏览器可直连，
 * 因此本站不需要自己的服务器。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CompilerEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var JUDGE0_URL = "https://ce.judge0.com/submissions?base64_encoded=true&wait=true";
  var WANDBOX_URL = "https://wandbox.org/api/compile.json";
  var DEFAULT_STDIN = "3 5\n";

  /* ------------------------------------------------------------------ */
  /* 语言表                                                              */
  /* ------------------------------------------------------------------ */

  var LANGS = [
    {
      key: "cpp",
      name: "C++17",
      short: "C++",
      file: "main.cpp",
      dot: "C++",
      judge0: { id: 105, label: "GCC 14.1.0" },
      wandbox: { compiler: "gcc-13.2.0", options: "warning,c++17" },
      template: [
        "#include <bits/stdc++.h>",
        "using namespace std;",
        "",
        "int main() {",
        "    ios::sync_with_stdio(false);",
        "    cin.tie(nullptr);",
        "",
        "    int a, b;",
        '    if (!(cin >> a >> b)) return 0;',
        '    cout << a + b << "\\n";',
        "    return 0;",
        "}"
      ].join("\n")
    },
    {
      key: "c",
      name: "C11",
      short: "C",
      file: "main.c",
      dot: "C",
      judge0: { id: 103, label: "GCC 14.1.0" },
      wandbox: { compiler: "gcc-13.2.0-c", options: "warning,c11" },
      template: [
        "#include <stdio.h>",
        "",
        "int main(void) {",
        "    int a, b;",
        '    if (scanf("%d %d", &a, &b) != 2) return 0;',
        '    printf("%d\\n", a + b);',
        "    return 0;",
        "}"
      ].join("\n")
    },
    {
      key: "py",
      name: "Python 3",
      short: "Python",
      file: "main.py",
      dot: "Py",
      judge0: { id: 109, label: "Python 3.13" },
      wandbox: { compiler: "cpython-3.13.8", options: "" },
      template: [
        "import sys",
        "",
        "",
        "def main():",
        '    data = sys.stdin.read().split()',
        "    if len(data) < 2:",
        "        return",
        "    a, b = map(int, data[:2])",
        "    print(a + b)",
        "",
        "",
        'if __name__ == "__main__":',
        "    main()"
      ].join("\n")
    },
    {
      key: "java",
      name: "Java 17",
      short: "Java",
      file: "Main.java",
      dot: "Java",
      judge0: { id: 91, label: "JDK 17.0.6" },
      wandbox: { compiler: "openjdk-jdk-21+35", options: "" },
      template: [
        "import java.io.*;",
        "import java.util.*;",
        "",
        "public class Main {",
        "    public static void main(String[] args) throws IOException {",
        "        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));",
        "        StringTokenizer st = new StringTokenizer(br.readLine());",
        "        int a = Integer.parseInt(st.nextToken());",
        "        int b = Integer.parseInt(st.nextToken());",
        "        System.out.println(a + b);",
        "    }",
        "}"
      ].join("\n")
    },
    {
      key: "js",
      name: "Node 22",
      short: "JS",
      file: "main.js",
      dot: "JS",
      judge0: { id: 102, label: "Node 22.08" },
      wandbox: { compiler: "nodejs-20.17.0", options: "" },
      template: [
        'const fs = require("fs");',
        "",
        'const nums = fs.readFileSync(0, "utf8").trim().split(/\\s+/).map(Number);',
        "const [a, b] = nums;",
        "console.log(a + b);"
      ].join("\n")
    }
  ];

  var LANG_MAP = {};
  LANGS.forEach(function (l) { LANG_MAP[l.key] = l; });

  function getLang(key) {
    return LANG_MAP[key] || LANGS[0];
  }

  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  /* ------------------------------------------------------------------ */
  /* base64（UTF-8 安全）                                                */
  /* Judge0 的 base64 模式可以原样传中文/控制字符，比 JSON 裸传稳。      */
  /* ------------------------------------------------------------------ */

  function encodeB64(str) {
    var text = String(str == null ? "" : str);
    var bytes = new TextEncoder().encode(text);
    var bin = "";
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function decodeB64(str) {
    if (!str) return "";
    var bin = atob(String(str));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ------------------------------------------------------------------ */
  /* 语法高亮                                                            */
  /* ------------------------------------------------------------------ */

  var KEYWORDS = {
    cpp: "alignas alignof and and_eq asm auto bitand bitor bool break case catch char char8_t char16_t char32_t " +
         "class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield " +
         "decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto " +
         "if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected " +
         "public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct " +
         "switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void " +
         "volatile wchar_t while xor xor_eq",
    c: "auto break case char const continue default do double else enum extern float for goto if inline int long " +
       "register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while " +
       "_Bool _Complex _Atomic _Generic _Noreturn _Static_assert _Thread_local",
    py: "False None True and as assert async await break class continue def del elif else except finally for from " +
        "global if import in is lambda nonlocal not or pass raise return try while with yield match case",
    java: "abstract assert boolean break byte case catch char class const continue default do double else enum " +
          "extends final finally float for goto if implements import instanceof int interface long native new " +
          "package private protected public return short static strictfp super switch synchronized this throw " +
          "throws transient try void volatile while var record sealed permits yield true false null",
    js: "await async break case catch class const continue debugger default delete do else export extends finally " +
        "for function if import in instanceof let new return static super switch this throw try typeof var void " +
        "while with yield true false null undefined of"
  };

  var TYPES = {
    cpp: "string vector map set queue stack deque pair tuple array list unordered_map unordered_set priority_queue " +
         "bitset size_t int64_t uint64_t int32_t uint32_t",
    c: "size_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t FILE",
    py: "int float str list dict set tuple bool bytes object",
    java: "String Integer Long Double Boolean List Map Set ArrayList HashMap HashSet Scanner StringBuilder",
    js: "Object Array String Number Boolean Promise Map Set JSON Math Date RegExp Error"
  };

  var KW_SETS = {};
  var TYPE_SETS = {};
  Object.keys(KEYWORDS).forEach(function (k) {
    KW_SETS[k] = {};
    KEYWORDS[k].split(/\s+/).forEach(function (w) { if (w) KW_SETS[k][w] = true; });
    TYPE_SETS[k] = {};
    (TYPES[k] || "").split(/\s+/).forEach(function (w) { if (w) TYPE_SETS[k][w] = true; });
  });

  /* ------------------------------------------------------------------ */
  /* 自动补全                                                            */
  /* ------------------------------------------------------------------ */
  /* 不做语义分析：就是「前缀匹配 + 常用词排前面 + 文里出现过的词跟上」。 */

  var COMMON_WORDS = {
    cpp: "vector string map set unordered_map unordered_set queue stack deque priority_queue pair tuple array bitset " +
         "sort reverse unique lower_bound upper_bound max_element min_element accumulate iota memset memcpy printf " +
         "scanf getline cin cout cerr endl ios sync_with_stdio tie push_back emplace_back pop_back front back begin " +
         "end size empty clear insert erase find count first second make_pair using namespace std int long double " +
         "char bool void const auto return if else for while switch case break continue sizeof nullptr true false " +
         "struct class template typename typedef include define unsigned signed",
    c: "printf scanf puts gets strlen strcpy strcmp strcat memcpy memset malloc calloc realloc free sizeof fopen " +
       "fclose fprintf fscanf fgets fputs FILE int long double float char void struct typedef const static unsigned " +
       "signed return if else for while do switch case break continue NULL include define bool true false",
    py: "print input range len int str float list dict set tuple sorted sum min max map filter zip enumerate append " +
        "extend split strip join replace format open read write readline sys math collections defaultdict Counter def " +
        "return for while if elif else import from as class try except finally with lambda yield None True False in " +
        "not and or is pass break continue self __init__ __name__ __main__ stdin stdout heapq bisect",
    java: "System out println print printf Scanner nextInt nextLong nextLine BufferedReader InputStreamReader " +
          "StringTokenizer String StringBuilder ArrayList HashMap HashSet Arrays Collections Math Integer Long Double " +
          "Boolean Character public private protected static void class interface extends implements new return if " +
          "else for while do switch case break continue try catch finally throws import package final int long double " +
          "boolean char true false null this super main args",
    js: "console log require fs readFileSync process stdin stdout JSON parse stringify Array Object String Number " +
        "Boolean Math Date Map Set Promise async await function const let var return if else for while of in class " +
        "new this try catch throw length push pop slice splice map filter reduce forEach sort join split trim toString " +
        "parseInt parseFloat module exports"
  };

  var COMMON_CACHE = {};
  function commonWords(langKey) {
    if (!COMMON_CACHE[langKey]) {
      COMMON_CACHE[langKey] = (COMMON_WORDS[langKey] || COMMON_WORDS.cpp).split(/\s+/).filter(Boolean);
    }
    return COMMON_CACHE[langKey];
  }

  /** 抽出源码里出现过的标识符，按出现次数降序。 */
  function extractWords(text) {
    var s = String(text == null ? "" : text);
    if (s.length > 200000) s = s.slice(0, 200000);
    var counts = {};
    var re = /[A-Za-z_][A-Za-z0-9_]{1,39}/g;
    var m;
    while ((m = re.exec(s)) !== null) {
      counts[m[0]] = (counts[m[0]] || 0) + 1;
    }
    return Object.keys(counts).map(function (w) {
      return { word: w, count: counts[w] };
    }).sort(function (a, b) {
      return b.count - a.count || (a.word < b.word ? -1 : 1);
    });
  }

  /**
   * 根据前缀给出候选词。
   * 顺序：常用符号 → 关键字 → 类型 → 当前代码里出现过的词。
   * 返回 [{ word, kind }]，不含与输入完全相同的那一项。
   */
  function completionsFor(langKey, prefix, docText, limit) {
    var p = String(prefix == null ? "" : prefix);
    if (!p) return [];
    var key = KW_SETS[langKey] ? langKey : "cpp";
    var max = limit || 8;
    var lower = p.toLowerCase();
    var seen = {};
    var out = [];

    function add(word, kind) {
      if (!word || seen[word]) return;
      if (word.length <= p.length) return;
      if (word.slice(0, p.length).toLowerCase() !== lower) return;
      seen[word] = true;
      out.push({ word: word, kind: kind });
    }

    commonWords(key).forEach(function (w) { add(w, "常用"); });
    Object.keys(KW_SETS[key]).forEach(function (w) { add(w, "关键字"); });
    Object.keys(TYPE_SETS[key]).forEach(function (w) { add(w, "类型"); });
    extractWords(docText).forEach(function (it) { add(it.word, "文中"); });

    return out.slice(0, max);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  var REGEX_CACHE = {};

  function buildRegex(langKey) {
    if (REGEX_CACHE[langKey]) return REGEX_CACHE[langKey];
    var str;
    if (langKey === "py") {
      str = [
        "(#[^\\n]*)",                                                   // 1 注释
        "(\"\"\"[\\s\\S]*?\"\"\"|'''[\\s\\S]*?'''|[rRbBuUfF]{0,2}\"(?:\\\\.|[^\"\\\\\\n])*\"|[rRbBuUfF]{0,2}'(?:\\\\.|[^'\\\\\\n])*')", // 2 字符串
        "(@[A-Za-z_][\\w.]*)",                                          // 3 装饰器
        "(\\b(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b)", // 4 数字
        "(\\b[A-Za-z_]\\w*\\b)"                                         // 5 标识符
      ].join("|");
    } else if (langKey === "js") {
      str = [
        "(//[^\\n]*|/\\*[\\s\\S]*?\\*/)",                               // 1 注释
        "(\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'|`(?:\\\\.|[^`\\\\])*`)", // 2 字符串
        "((?!x)x)",                                                     // 3 永不匹配（占位，保持分组编号一致）
        "(\\b(?:0[xX][0-9a-fA-F]+|\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b)", // 4 数字
        "(\\b[A-Za-z_$][\\w$]*\\b)"                                     // 5 标识符
      ].join("|");
    } else {
      str = [
        "(//[^\\n]*|/\\*[\\s\\S]*?\\*/)",                               // 1 注释
        "(\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*')",       // 2 字符串
        "(^[ \\t]*#[^\\n]*)",                                           // 3 预处理
        "(\\b(?:0[xX][0-9a-fA-F']+|0[bB][01']+|\\d[\\d']*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)[uUlLfF]*\\b)", // 4 数字
        "(\\b[A-Za-z_]\\w*\\b)"                                         // 5 标识符
      ].join("|");
    }
    var re = new RegExp(str, "gm");
    REGEX_CACHE[langKey] = re;
    return re;
  }

  function span(cls, text) {
    return '<span class="tok-' + cls + '">' + escapeHtml(text) + "</span>";
  }

  /**
   * 把源码变成高亮 HTML。输出只含本函数生成的 <span>，其余字符全部转义，
   * 因此可以安全地塞进 innerHTML（代码里写 <script> 也只会显示成文本）。
   */
  function highlight(code, langKey) {
    var src = String(code == null ? "" : code);
    if (!src) return "";
    var key = KW_SETS[langKey] ? langKey : "cpp";
    var re = buildRegex(key);
    var kw = KW_SETS[key];
    var types = TYPE_SETS[key];
    var out = "";
    var last = 0;
    var m;

    re.lastIndex = 0;
    while ((m = re.exec(src)) !== null) {
      if (m.index > last) out += escapeHtml(src.slice(last, m.index));

      var tok = m[0];
      if (m[1]) {
        out += span("c", tok);
      } else if (m[2]) {
        out += span("s", tok);
      } else if (m[3] && key === "py") {
        out += span("f", tok);          // 装饰器当函数色
      } else if (m[3]) {
        out += span("p", tok);          // 预处理指令
      } else if (m[4]) {
        out += span("n", tok);
      } else {
        // 标识符：先判关键字 / 类型，再看后面是不是 "("
        var next = src.slice(m.index + tok.length).match(/^[ \t]*\(/);
        if (kw[tok]) out += span("k", tok);
        else if (types[tok]) out += span("t", tok);
        else if (next) out += span("fn", tok);
        else out += escapeHtml(tok);
      }

      last = m.index + tok.length;
      if (re.lastIndex === m.index) re.lastIndex++;   // 空匹配保护
    }
    out += escapeHtml(src.slice(last));
    // 末尾补一个零宽字符，保证以换行结尾时最后一行高度不塌
    if (src.charAt(src.length - 1) === "\n") out += "\u200b";
    return out;
  }

  function countLines(text) {
    var s = String(text == null ? "" : text);
    if (!s) return 1;
    var n = 1;
    for (var i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* 后端请求                                                            */
  /* ------------------------------------------------------------------ */

  var VERDICT_LABEL = {
    AC: "通过",
    CE: "编译错误",
    RE: "运行错误",
    TLE: "超时",
    IE: "系统错误"
  };

  function statusLabel(v) {
    return VERDICT_LABEL[v] || "未知";
  }

  function formatSeconds(sec) {
    if (sec == null || isNaN(sec)) return "—";
    if (sec < 1) return Math.round(sec * 1000) + " ms";
    return (Math.round(sec * 100) / 100).toFixed(2) + " s";
  }

  function formatKb(kb) {
    if (kb == null || isNaN(kb) || kb <= 0) return "—";
    if (kb < 1024) return Math.round(kb) + " KB";
    return (Math.round(kb / 102.4) / 10).toFixed(1) + " MB";
  }

  function makeError(code, message, extra) {
    var err = new Error(message);
    err.code = code;
    if (extra) Object.keys(extra).forEach(function (k) { err[k] = extra[k]; });
    return err;
  }

  function isInfraFailure(text) {
    return /OCI runtime error|Resource temporarily unavailable|no healthy upstream|internal server error/i.test(String(text || ""));
  }

  function normalizeJudge0(json, wallMs, options) {
    var raw = json || {};
    var asBase64 = !options || options.base64 !== false;   // 页面里固定用 base64 模式
    var decode = asBase64 ? decodeB64 : function (x) { return x == null ? "" : String(x); };
    var status = raw.status || {};
    var id = Number(status.id || 0);
    var verdict =
      id === 3 ? "AC" :
      id === 6 ? "CE" :
      id === 5 ? "TLE" :
      (id >= 7 && id <= 12) ? "RE" : "IE";

    var stdout = decode(raw.stdout);
    var stderr = decode(raw.stderr);
    var compileOutput = decode(raw.compile_output);
    var message = decode(raw.message);

    if (verdict === "IE" && id !== 13 && id !== 14) {
      // 例：排队超时、被限流后返回的奇怪状态
      message = message || (status.description || "编译服务返回了未知状态");
    }

    return {
      backend: "judge0",
      verdict: verdict,
      verdictText: statusLabel(verdict),
      statusId: id,
      statusText: status.description || "",
      stdout: String(stdout || ""),
      stderr: String(stderr || ""),
      compileOutput: String(compileOutput || ""),
      message: String(message || ""),
      timeSec: raw.time != null && raw.time !== "" ? Number(raw.time) : null,
      memoryKb: raw.memory != null && raw.memory !== "" ? Number(raw.memory) : null,
      exitCode: raw.exit_code != null ? raw.exit_code : null,
      wallMs: wallMs || 0,
      raw: raw
    };
  }

  function normalizeWandbox(json, wallMs) {
    var raw = json || {};
    var status = raw.status == null ? "" : String(raw.status);
    var signal = String(raw.signal || "");
    var compilerError = String(raw.compiler_error || raw["compiler-error"] || "");
    var compilerOutput = String(raw.compiler_output || raw["compiler-output"] || "");
    var programOut = String(raw.program_output || raw["program-output"] || "");
    var programErr = String(raw.program_error || raw["program-error"] || "");
    var programMessage = String(raw.program_message || "");

    var infra = isInfraFailure(compilerError) || isInfraFailure(programMessage);
    var verdict;
    if (infra) verdict = "IE";
    else if (compilerError && /error:|错误/i.test(compilerError) && !programOut) verdict = "CE";
    else if (signal || (status !== "" && status !== "0")) verdict = "RE";
    else verdict = "AC";

    return {
      backend: "wandbox",
      verdict: verdict,
      verdictText: statusLabel(verdict),
      statusId: null,
      statusText: status,
      stdout: programOut,
      stderr: programErr,
      compileOutput: (compilerOutput + compilerError).trim(),
      message: programMessage,
      timeSec: null,
      memoryKb: null,
      exitCode: status === "" ? null : Number(status),
      wallMs: wallMs || 0,
      raw: raw
    };
  }

  function describeFailure(err) {
    if (!err) return "未知错误";
    if (err.name === "AbortError" || err.code === "TIMEOUT") return "请求超时";
    if (err.httpStatus === 429) return "请求太频繁（429）";
    if (err.httpStatus === 401 || err.httpStatus === 403) return "后端拒绝访问（" + err.httpStatus + "）";
    if (err.httpStatus) return "HTTP " + err.httpStatus;
    if (err.code === "NETWORK") return "网络不可达";
    return err.message || String(err);
  }

  function fetchJson(fetchImpl, url, init, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (ctrl) { try { ctrl.abort(); } catch (e) {} }
        reject(makeError("TIMEOUT", "请求超时（" + Math.round(timeoutMs / 1000) + " 秒）"));
      }, timeoutMs);

      var opts = {};
      Object.keys(init || {}).forEach(function (k) { opts[k] = init[k]; });
      if (ctrl) opts.signal = ctrl.signal;

      fetchImpl(url, opts).then(function (res) {
        return res.text().then(function (text) {
          return { res: res, text: text };
        });
      }).then(function (r) {
        if (settled) return;
        var json = null;
        try { json = JSON.parse(r.text); } catch (e) {}
        if (!r.res.ok) {
          settled = true;
          clearTimeout(timer);
          var msg = (json && (json.message || json.error)) || ("HTTP " + r.res.status);
          reject(makeError("HTTP", msg, { httpStatus: r.res.status, body: r.text }));
          return;
        }
        if (!json) {
          settled = true;
          clearTimeout(timer);
          reject(makeError("BAD_JSON", "后端返回的不是 JSON"));
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(json);
      }).catch(function (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (e && (e.name === "AbortError" || e.code === "TIMEOUT")) {
          reject(makeError("TIMEOUT", "请求超时"));
        } else {
          reject(makeError("NETWORK", (e && e.message) || "网络请求失败", { cause: e }));
        }
      });
    });
  }

  function buildJudge0Payload(lang, code, stdin) {
    return {
      source_code: encodeB64(code),
      stdin: encodeB64(stdin),
      language_id: lang.judge0.id,
      cpu_time_limit: 5,
      wall_time_limit: 15
    };
  }

  function buildWandboxPayload(lang, code, stdin) {
    var payload = {
      compiler: lang.wandbox.compiler,
      code: String(code || ""),
      stdin: String(stdin || ""),
      save: false
    };
    if (lang.wandbox.options) payload.options = lang.wandbox.options;
    return payload;
  }

  function runJudge0(lang, code, stdin, fetchImpl, timeoutMs) {
    var started = nowMs();
    return fetchJson(fetchImpl, JUDGE0_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildJudge0Payload(lang, code, stdin))
    }, timeoutMs).then(function (json) {
      return normalizeJudge0(json, nowMs() - started);
    });
  }

  function runWandbox(lang, code, stdin, fetchImpl, timeoutMs) {
    var started = nowMs();
    return fetchJson(fetchImpl, WANDBOX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildWandboxPayload(lang, code, stdin))
    }, timeoutMs).then(function (json) {
      return normalizeWandbox(json, nowMs() - started);
    });
  }

  /**
   * 跑一次编译。先走 Judge0，遇到网络/限流/后端内部错误再换 Wandbox。
   * 编译错误、运行错误、超时都是**正常结果**，不会触发换后端。
   *
   * options: { lang, code, stdin, fetch, timeoutMs, onStage }
   */
  async function runCompile(options) {
    var opts = options || {};
    var lang = getLang(opts.lang);
    var code = opts.code == null ? "" : String(opts.code);
    var stdin = opts.stdin == null ? "" : String(opts.stdin);
    var fetchImpl = opts.fetch || (typeof fetch === "function" ? fetch : null);
    var timeoutMs = opts.timeoutMs || 30000;
    var onStage = typeof opts.onStage === "function" ? opts.onStage : function () {};
    var attempts = [];

    if (!fetchImpl) throw makeError("NO_FETCH", "当前浏览器不支持 fetch");

    onStage({ phase: "judge0", text: "正在连接 Judge0…" });
    try {
      var res = await runJudge0(lang, code, stdin, fetchImpl, timeoutMs);
      var infra = res.verdict === "IE" &&
        (res.statusId === 13 || res.statusId === 14 || isInfraFailure(res.message));
      if (infra) {
        attempts.push({ backend: "Judge0", message: "后端内部错误：" + (res.statusText || res.statusId) });
      } else {
        res.attempts = attempts;
        return res;
      }
    } catch (e) {
      attempts.push({ backend: "Judge0", message: describeFailure(e) });
    }

    onStage({ phase: "wandbox", text: "Judge0 不可用，切换备用后端…" });
    try {
      var alt = await runWandbox(lang, code, stdin, fetchImpl, timeoutMs);
      if (alt.verdict === "IE" && isInfraFailure(alt.compileOutput + " " + alt.message)) {
        attempts.push({ backend: "Wandbox", message: "备用后端内部错误" });
      } else {
        alt.attempts = attempts;
        return alt;
      }
    } catch (e2) {
      attempts.push({ backend: "Wandbox", message: describeFailure(e2) });
    }

    var finalErr = makeError("ALL_FAILED", "所有编译后端都不可用", { attempts: attempts });
    finalErr.userMessage = "编译服务暂时不可用，请稍后重试。";
    finalErr.attempts = attempts;
    throw finalErr;
  }

  return {
    JUDGE0_URL: JUDGE0_URL,
    WANDBOX_URL: WANDBOX_URL,
    DEFAULT_STDIN: DEFAULT_STDIN,
    LANGS: LANGS,
    VERDICT_LABEL: VERDICT_LABEL,
    getLang: getLang,
    encodeB64: encodeB64,
    decodeB64: decodeB64,
    escapeHtml: escapeHtml,
    highlight: highlight,
    countLines: countLines,
    extractWords: extractWords,
    completionsFor: completionsFor,
    statusLabel: statusLabel,
    formatSeconds: formatSeconds,
    formatKb: formatKb,
    normalizeJudge0: normalizeJudge0,
    normalizeWandbox: normalizeWandbox,
    buildJudge0Payload: buildJudge0Payload,
    buildWandboxPayload: buildWandboxPayload,
    runJudge0: runJudge0,
    runWandbox: runWandbox,
    runCompile: runCompile,
    isInfraFailure: isInfraFailure
  };
});
