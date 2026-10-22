# 题库快照怎么更新

主页 `index.html` 是「CF 题目推荐器」，页面读取 `data/problems.json`。
这个文件是 Codeforces 题库的离线快照，页面首屏靠它秒开；点右上角
**同步最新题库** 会直接拉 CF API 并写进浏览器 localStorage，不走这个文件。

---

## 站内读题的题面数据（reader/data/）

点开任意题目卡片会在弹窗里显示题面。题面来自 `reader/data/{题号}.json`，
由 `_build/crawl_reader.py` 抓取生成。

### 为什么是「预先生成」而不是「实时抓」

`codeforces.com` 和 `luogu.com.cn` **都在 Cloudflare 后面**。实测：

| 出口 | 结果 |
|---|---|
| 住宅宽带（本机） | 200，正常拿到题面 |
| GitHub Actions（Azure） | `403 Just a moment...` |
| Vercel | `403` |

也就是说**任何机房 IP 都会被 Cloudflare 的 JS 挑战拦掉**，换云厂商、换区域、
换请求头都没用（我试过全部）。所以只能由能访问的机器预先生成，访客直接读同源 JSON。

### 更新命令

```powershell
cd my-homepage

# 抓一个难度区间（默认 1200-1600，本次最多 400 道，可中断续爬）
python _build\crawl_reader.py --min 1200 --max 1600 --limit 400

# 抓指定题号
python _build\crawl_reader.py 1858B 1528A

# 已收录的想重抓
python _build\crawl_reader.py --min 1400 --max 1600 --limit 100 --force
```

脚本会跳过已收录的题目，所以重复执行就是**增量续爬**；每 10 题落一次盘，
中断了重跑同一条命令即可接着来。

### 数据形状

```jsonc
// reader/data/1858B.json
{
  "id": "CF1858B", "tag": "1858B",
  "title": "The Walkway",
  "difficulty": 3,          // 洛谷 1-7 难度
  "timeMs": 1000, "memoryKb": 256000,
  "submit": 566, "accepted": 273,
  "content": { "description": "...", "formatI": "...", "formatO": "...", "hint": "..." },
  "translations": { "zh-CN": {...}, "en": {...} },   // 中英双语，前端可切换
  "samples": [{ "input": "...", "output": "..." }],
  "url": "https://www.luogu.com.cn/problem/CF1858B",
  "cfUrl": "https://codeforces.com/problemset/problem/1858/B"
}

// reader/data/index.json —— { gen, ids[], meta{tag: {title, rating, difficulty}} }
```

### 前端取数顺序

`index.html` 里的 `openReader()` 依次尝试：

1. `reader/data/{tag}.json` —— 同源静态，最快最可靠
2. `https://cf-live-eight.vercel.app/api/problem?id=` —— 在线接口（机房出口被拦，通常不可用）
3. 都没有 → 提示「还没收录」＋ 洛谷 / Codeforces 链接

### 深链接

`https://cha0son.github.io/?id=1858B` 会直接打开该题的读题弹窗，方便发给别人。

---

## 题库快照（data/problems.json）怎么更新

想更新仓库里的快照，按下面三步走。

## 1. 抓原始数据

```powershell
cd my-homepage
mkdir _build -Force
curl.exe -sS -o "_build\problemset.json" `
  -w "HTTP=%{http_code} size=%{size_download}`n" `
  "https://codeforces.com/api/problemset.problems"
```

> 注意：不要用 `Invoke-WebRequest` / `Invoke-RestMethod`。
> PowerShell 的 TLS 指纹会被 Cloudflare 拦掉（报「接收时发生错误」），
> 而 `curl.exe` 正常。也可以直接用浏览器打开那个 API 地址另存为。

## 2. 压缩成页面格式

```powershell
python _build\transform.py
```

产出 `data/problems.json`（schema v3，约 445 KB，gzip 后约 110 KB）。
脚本会自动丢弃无 rating 的题目。

## 3. 跑测试再推送

```powershell
node _build\check-syntax.js   # 内联脚本语法 + DOM id 引用 + 标签功能确已移除
node _build\smoke.js          # 数据完整性 + 打分逻辑 12 项断言
node _build\dom-test.js       # 最小 DOM 垫片真跑一遍 main()，11 项断言
git add . && git commit -m "chore: 更新题库快照" && git push
```

## 数据结构（schema v3）

```jsonc
{
  "v": 3,
  "gen": 1760000000,
  "p": [[1858, "B", "The Walkway", 1500, 13293]]
       //  contestId, index, name, rating, solvedCount
}
```

**标签已经整套移除**（页面不需要）。如果你哪天想把标签加回来，注意一个坑：
标签有 38 个，而 JavaScript 的位运算只有 32 位，`1 << 37` 实际等于 `1 << 5`。
用位掩码会让索引 32~37 的标签（`sortings` / `strings` / `ternary search` /
`trees` / `two pointers` / `string suffix structures`）与低位标签串位——
`trees` 会被静默当成 `flows`。真要用，请用**标签索引数组**，别用位掩码。

## 页面评分（无标签后）

```
score = 0.55 × 难度契合(高斯, σ=110) + 0.25 × 热度(log 通过数) + 0.10 × 新鲜度 + 0.10 × 抖动
```

目标难度 `target = clamp(基准 + Δ, lo, hi)`，基准取 `handle 的 rating` 或区间中点；
Δ 由「轻松 / 适中 / 挑战」三档取 0 / 150 / 300。

## 页面结构

| 文件 | 作用 |
|---|---|
| `index.html` | CF 题目推荐器（当前主页） |
| `index.v1.html` | 旧版个人主页简历，保留可访问 |
| `index.backup.html` | 更早的一版备份 |
| `data/problems.json` | 题库快照（schema v3，无标签） |
| `reader/` | 离线题面页，由 `cf-reader` 生成后推进来 |
| `reader/manifest.json` | 哪些题有离线页；主页据此决定卡片点进去是站内还是 CF |
| `food-recommender/` | 之前的食物推荐 demo |
| `DEPLOY.md` | GitHub Pages 部署教程 |

## 卡片点进去是站内阅读还是 CF？

主页启动时读 `reader/manifest.json`：

- 题号在清单里 → 卡片有绿色「离线」标记，点进去是 `reader/1858B.html`，
  同时保留一个 `CF ↗` 小链接用于去原站提交
- 不在清单里 → 直接跳 `codeforces.com`

所以加题流程是：在 `cf-reader/` 里跑 `发布到主页.bat`，它会把新页面和
`manifest.json` 一起推到本仓库。**不要手动改 `manifest.json`**，它由生成器写。

## 相关工具：cf-reader

工作区里还有一个 `cf-reader/`（不在本仓库），用于把题目抓到本地生成
离线可读的 HTML。它和这个页面通过 `data/problems.json` 的题目 id 对接：
在页面上看到想做的题，把编号（如 `1858B`）丢给 `cf_reader.py` 即可。
