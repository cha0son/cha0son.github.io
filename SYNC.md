# 维护说明

主页 `index.html` 是「CF 题目推荐器」。点任意题目卡片会**直接跳到洛谷对应题面**，
不在站内渲染题面。

## 一、题库快照 `data/problems.json`

页面首屏读它，格式是 **schema v4**（带标签）：

```jsonc
{
  "v": 4,
  "gen": 1760000000,
  "tags": ["2-sat", "binary search", "..."],          // 38 个，下标即标签编号
  "p": [[1858, "B", "The Walkway", 1500, 13293, [4, 12, 21, 25, 28]]]
       //  contestId, index, name, rating, solvedCount, 标签索引数组
}
```

> ⚠️ 标签必须用**索引数组**，不能用位掩码。标签有 38 个，而 JavaScript 的位运算
> 只有 32 位，`1 << 37` 实际等于 `1 << 5`，会让 `trees` / `two pointers` / `strings`
> 等高位标签与低位标签串位，静默产生错误结果。`smoke.js` 里有专门的回归断言守着。

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

## 四、按水平自动匹配难度

页面有两个水平来源，优先级从高到低：

1. **分析 Codeforces 账号**得到的估算水平
2. **手输的「我的 rating」**
3. 都没有 → 按难度区间中点，不做偏移

拿到水平 `base` 后，自动把区间设成 `[base-100, base+300]`（取整到 100），
例如 1500 → **1400–1800**。滑块下方会写明依据，手动拖动可覆盖。

### 水平是怎么估的（不再瞎套 1200）

| 情况 | 用什么 |
|---|---|
| 打过 rated 比赛 | 官方 `rating` |
| 未定级，AC 过 ≥5 道有评分的题 | 已 AC 题目的 **60% 分位 + 50** |
| 未定级，样本不足 5 道 | 最高 AC **+150** |
| 没有任何带评分的过题记录 | **不估算**，退回区间中点并提示 |

推荐打分里还有两条纪律：题目超过「历史最高 AC」200 分打 75 折、300 分打 5 折；
「试过但没过」的题会优先再战。

## 五、标签筛选

筛选区有一排标签 chip，**命中任一选中标签即可**；标签只用于筛选和排序，
**不会显示在题目卡片上**（卡片只显示难度、题号、题目名、推荐理由）。

URL 里也会带上状态，可直接分享：

```
#lo=1400&hi=1800&c=mid&t=dp,greedy&r=1500
```

> 标签索引务必用数组而不是位掩码，原因见第一节的警告。

## 六、文件结构

| 文件 | 作用 |
|---|---|
| `index.html` | 推荐器（单文件，无构建） |
| `index.v1.html` | 旧版个人主页简历 |
| `data/problems.json` | 题库快照（schema v4，带标签） |
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
