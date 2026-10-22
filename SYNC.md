# 维护说明

主页 `index.html` 是「CF 题目推荐器」。点任意题目卡片会**直接跳到洛谷对应题面**，
不在站内渲染题面。

## 一、题库快照 `data/problems.json`

页面首屏读它，格式是 schema v3：

```jsonc
{
  "v": 3,
  "gen": 1760000000,
  "p": [[1858, "B", "The Walkway", 1500, 13293]]
       //  contestId, index, name, rating, solvedCount
}
```

更新步骤：

```powershell
cd my-homepage
mkdir _build -Force
curl.exe -sS -o "_build\problemset.json" `
  -w "HTTP=%{http_code} size=%{size_download}`n" `
  "https://codeforces.com/api/problemset.problems"

python _build\transform.py     # 生成 data/problems.json
```

> 不要用 `Invoke-WebRequest`：PowerShell 的 TLS 指纹会被 Cloudflare 拦。

另外页面右上角**同步最新题库**会直接拉 CF API 写进浏览器 localStorage，不走这个文件。

## 二、卡片为什么跳洛谷

题号拼接规则很简单：

```
1858B  ->  https://www.luogu.com.cn/problem/CF1858B
```

也就是 `CF + contestId + index`。代码里是 `CF_URL` / `luoguUrl` 那一行。
每张卡片右下角还有一个 `CF ↗` 小链接，用于去 Codeforces 提交。

深链接：`https://cha0son.github.io/?id=1858B` 会直接跳到洛谷该题。

### 为什么不在站内抓题面

这是被验证过的硬约束，不是没做：

| 出口 | codeforces.com / luogu.com.cn |
|---|---|
| 住宅宽带 | ✅ 200 |
| Vercel 机房 | ❌ 403 `Just a moment...` |
| GitHub Actions（Azure） | ❌ 403 `Just a moment...` |

`Just a moment...` 是 **Cloudflare 的机器人挑战**，按 IP 类型 + TLS 指纹判定。
换云厂商、换区域、换请求头、加 cookie 握手都试过，机房出口一律被拦。
站内渲染题面还需要绕过 CORS（洛谷不发 `Access-Control-Allow-Origin`），
两者叠加导致「纯静态站 + 实时抓取」不可能成立，所以选择直接跳转。

## 三、难度区间

左侧双滑条范围 800–3500。下面有一排快捷区间：

| 按钮 | 区间 |
|---|---|
| 入门 | 800–1000 |
| 基础 | 1000–1400 |
| 常见 | 1200–1600（默认） |
| 提高 | 1600–2000 |
| 竞赛 | 2000–2400 |
| 硬核 | 2400+ |

> 默认区间是 1200–1600，所以 **800 分的题默认不显示** —— 但它们有 1104 道，
> 点「入门」或把左滑块拖到 800 就能看到。

## 四、文件结构

| 文件 | 作用 |
|---|---|
| `index.html` | 推荐器（单文件，无构建） |
| `index.v1.html` | 旧版个人主页简历 |
| `data/problems.json` | 题库快照（schema v3） |
| `_build/transform.py` | 快照生成脚本 |
| `_build/smoke.js` | 数据 + 打分逻辑断言 |
| `_build/dom-test.js` | 用 DOM 垫片跑页面脚本的端到端断言 |
| `_build/check-syntax.js` | 内联脚本语法 + DOM id 引用检查 |
| `reader/` | 早前的离线题面页（历史遗留，未再更新） |
| `food-recommender/` | 食物推荐 demo |
| `DEPLOY.md` | GitHub Pages 部署教程 |

## 五、改完怎么验证

```powershell
node _build\check-syntax.js
node _build\smoke.js
node _build\dom-test.js
git add . && git commit -m "..." && git push
```

推送后等 1 分钟左右 Pages 会重建。
