# 题库快照怎么更新

主页 `index.html` 现在是「CF 题目推荐器」，页面读取 `data/problems.json`。
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

产出 `data/problems.json`（schema v2，约 550 KB，gzip 后约 140 KB）。
脚本会自动丢弃无 rating 的题目。

## 3. 跑测试再推送

```powershell
node _build\check-syntax.js   # 内联脚本语法 + DOM id 引用检查
node _build\smoke.js          # 数据完整性 + 打分逻辑 12 项断言
git add . && git commit -m "chore: 更新题库快照" && git push
```

## 数据结构（别改成位掩码！）

```jsonc
{
  "v": 2,
  "gen": 1760000000,
  "tags": ["2-sat", "..."],          // 38 个，下标即标签编号
  "p": [[1858, "B", "The Walkway", 1500, [4, 12, 21, 25, 28], 13293]]
       //  contestId, index, name, rating, 标签索引数组, solvedCount
}
```

**为什么不用位掩码**：标签有 38 个，而 JavaScript 的位运算只有 32 位。
`1 << 37` 实际等于 `1 << 5`，会让索引 32~37 的标签
（`sortings` / `string suffix structures` / `strings` / `ternary search` /
`trees` / `two pointers`）与低位标签串位——`trees` 会被当成 `flows`，
静默产生错误的推荐结果。`smoke.js` 里有专门的回归断言守着这点。

## 页面结构

| 文件 | 作用 |
|---|---|
| `index.html` | CF 题目推荐器（当前主页） |
| `index.v1.html` | 旧版个人主页简历，保留可访问 |
| `index.backup.html` | 更早的一版备份 |
| `data/problems.json` | 题库快照 |
| `food-recommender/` | 之前的食物推荐 demo |
| `DEPLOY.md` | GitHub Pages 部署教程 |
