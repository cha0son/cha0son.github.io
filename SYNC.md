# 题库快照怎么更新

主页 `index.html` 是「CF 题目推荐器」，页面读取 `data/problems.json`。
这个文件是 Codeforces 题库的离线快照，页面首屏靠它秒开；点右上角
**同步最新题库** 会直接拉 CF API 并写进浏览器 localStorage，不走这个文件。

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
