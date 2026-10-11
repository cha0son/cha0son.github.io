# 个人主页部署教程

> 目标：让你的主页在互联网上有一个真实可访问的地址，能写进简历
> 预计耗时：**30 分钟**（其中 20 分钟是注册和等待）

---

## 一、先搞懂部署是怎么回事

你的主页是**纯静态文件**（一个 `index.html`），没有后端、没有数据库。所以部署极其简单：

```
你的电脑                          互联网
index.html  ──上传──►  GitHub 仓库  ──►  GitHub Pages 免费托管  ──►  一个网址
```

**"部署" = 把文件放到一台永远开机的服务器上，让它通过网址能访问。**

对个人主页来说，**GitHub Pages 是最优解**：免费、稳定、自带 HTTPS、支持绑定自己的域名、还能顺便当你的 Git 仓库用。

---

## 二、路线 A：GitHub Pages（推荐，全程免费）

### 步骤 1：注册 GitHub 账号

访问 https://github.com/signup

**用户名要认真起**，因为它会出现在你的网址和简历上：

| 好的用户名 | 不好的用户名 |
|---|---|
| `zhangsan-dev` | `xiaoshuaige123` |
| `zhang-san` | `woshishui666` |
| `zsan-cs` | `asdfghjkl` |

> 这个用户名以后会用来投简历，**别用中二 ID**。如果已经被占用，就在后面加 `-dev`、`-cs`、出生年份等。

### 步骤 2：建仓库（关键！名字不能错）

1. 右上角 **+** → **New repository**
2. **Repository name** 必须填：

```
你的用户名.github.io
```

   ⚠️ 举例：用户名是 `zhangsan-dev`，仓库名就必须是 **`zhangsan-dev.github.io`**。
   一个字都不能错，**这是 GitHub Pages 的硬性规则**。

3. 选 **Public**（必须是公开的，私有仓库不支持免费 Pages）
4. **不要**勾选 "Add a README file"
5. 点 **Create repository**

### 步骤 3：上传文件（用网页，最简单）

进到你刚建的仓库，然后：

1. 点 **uploading an existing file**（或 Add file → Upload files）
2. 把 `my-homepage` 文件夹里的 **`index.html` 拖进去**
3. 下面 Commit changes 的框里随便写点，比如 `init homepage`
4. 点 **Commit changes**

> ⚠️ **只传 `index.html` 本身，不要传整个文件夹**。
> 打开网址时找的是仓库根目录下的 `index.html`，如果它被包在文件夹里就会 404。

### 步骤 4：开启 Pages

1. 仓库页面点 **Settings**（顶部的齿轮）
2. 左侧菜单找到 **Pages**
3. **Source** 选 `Deploy from a branch`
4. **Branch** 选 `main`，目录选 `/ (root)`
5. 点 **Save**

### 步骤 5：等 1~3 分钟，然后访问

```
https://你的用户名.github.io
```

**第一次可能要等 5 分钟**，还要注意：

- 浏览器缓存 → 按 `Ctrl + F5` 强制刷新
- 如果显示 404 → 看下面的排查表

---

## 三、排查：如果访问是 404

| 现象 | 原因 | 解决 |
|---|---|---|
| 网址直接 404 | 仓库名写错了 | 必须是 `用户名.github.io`，逐字母核对 |
| 404 但仓库里明明有文件 | `index.html` 在子文件夹里 | 在仓库里点开确认它在**根目录** |
| 显示的是 README 而不是主页 | 文件名不对 | 必须是 `index.html`，小写，不是 `Index.html` 或 `index.htm` |
| 改了代码但网址没变 | 浏览器缓存 或 Pages 还没重建 | `Ctrl + F5`；去仓库 **Actions** 标签看部署是否完成 |
| Pages 里找不到设置项 | 仓库是私有的 | 改成 Public：Settings → General → 最下面 Change visibility |

---

## 四、路线 B：用 Git 命令行部署（进阶，但推荐学会）

网页上传只适合第一次。**以后每次改主页都用网页拖文件会很烦**，所以建议用 Git。

### 1. 检查 Git 装没装

```powershell
git --version
```

没装的话去 https://git-scm.com/download/win 下载，一路下一步。

### 2. 配置身份（只需一次）

```powershell
git config --global user.name "你的用户名"
git config --global user.email "你的邮箱"
```

### 3. 在项目文件夹里初始化并推送

```powershell
cd "C:\Users\HP\Desktop\codex专用文件夹\my-homepage"

git init
git add index.html
git commit -m "init homepage"
git branch -M main
git remote add origin https://github.com/你的用户名/你的用户名.github.io.git
git push -u origin main
```

### 4. 关于密码：GitHub 不能用账号密码推

**这是新手最常卡住的地方。** GitHub 早就禁用了密码推送，必须用 **Personal Access Token**。

生成方法：
1. GitHub 右上角头像 → **Settings**
2. 左侧最下面 → **Developer settings**
3. **Personal access tokens** → **Tokens (classic)**
4. **Generate new token (classic)**
5. Note 随便写，Expiration 选 90 天，勾选 **`repo`** 权限
6. 点生成，**把那一串 token 复制下来**（只显示一次！）

推送时：
- Username：填你的 GitHub 用户名
- Password：**粘贴那串 token**（不是你的登录密码）

> 💡 更省事的办法：装 **GitHub Desktop**（https://desktop.github.com），
> 图形界面点点点就能推送，不用管 token。**不熟悉命令行就用这个。**

### 5. 以后更新主页

```powershell
git add .
git commit -m "更新项目经历"
git push
```

等 1 分钟，刷新网址就变了。

---

## 五、路线 C：Vercel / Netlify（备选）

如果你觉得 GitHub Pages 慢，或者以后想做带后端的东西，可以试这两个：

| 平台 | 优点 | 适合场景 |
|---|---|---|
| **Vercel** | 部署最快，绑定 GitHub 后自动部署 | 以后想加 Next.js 之类 |
| **Netlify** | 拖拽文件夹就能部署，不用 Git | 完全不想碰命令行 |

**Netlify 最快上手**：打开 https://app.netlify.com/drop ，把你的 `my-homepage` 文件夹**直接拖进去**，几秒后就给你一个网址。适合临时预览。

但**简历上建议用 GitHub Pages**：因为它顺带证明你有 GitHub 账号、有代码提交记录，面试官点进去还能看到你的仓库。

---

## 六、绑定自己的域名（可选，先跳过）

如果你想用 `zhangsan.com` 而不是 `zhangsan.github.io`：

1. 买个域名（阿里云/腾讯云，`.com` 一年 50~70 元，`.top`/`.xyz` 首年几块钱）
2. DNS 解析里加 4 条 A 记录，指向 GitHub 的 IP：
   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```
3. 再加一条 CNAME：`www` → `你的用户名.github.io`
4. 在主页文件夹里新建一个文件叫 **`CNAME`**（没有后缀），内容就一行：
   ```
   你的域名.com
   ```
5. 推到仓库，然后在 GitHub Pages 设置里填上域名，勾选 **Enforce HTTPS**

> **建议**：**现在就别折腾域名。** 先用 `xxx.github.io` 把简历投出去，
> 等有面试反馈了再考虑。域名不影响你拿 offer，但会消耗你两小时。

---

## 七、部署前检查清单

把 `index.html` 里这些 **占位内容**全部替换掉：

- [ ] `<title>` 里的"你的名字"
- [ ] Hero 区的 `<h1>你的名字</h1>`
- [ ] 所有 `https://github.com/你的用户名` 链接（共 2 处）
- [ ] 所有 `你的邮箱@qq.com`（共 2 处）
- [ ] 微信号
- [ ] 「经历」区块的 GPA / 排名 / 竞赛记录
- [ ] 「项目」区块的数字和描述——**必须是你自己的真实数据**
- [ ] 删掉页面里那两条 ⚠️ 提示（搜 `⚠️` 就能找到）

**搜索技巧**：在编辑里按 `Ctrl + F` 搜 `你的`，一路替换下去，改完为止。

---

## 八、写主页的三条原则（比技术重要）

**1. 不要写你不会的东西。**
简历和主页上写的每一个技术，面试官都可能追问。写"熟悉 Redis"就要能答上来分布式锁怎么实现。
**宁可少写，不要虚写。**

**2. 数字比形容词有用一百倍。**

| ❌ 弱 | ✅ 强 |
|---|---|
| 熟悉推荐算法 | 用 `1 − exp(−Δt/λ)` 建模兴趣回升，做消融实验验证贡献 |
| 有较强的编程能力 | 算法竞赛训练 x 年，主攻图论与计算几何 |
| 参与过项目开发 | 独立实现 82 道菜品库 + 可配置打分引擎，支持参数实时调节 |

**3. 主页是给你自己看的进度条，不是装饰品。**
每完成一个项目、每拿到一个奖，就回来加一条。**它逼你把"我好像做了不少事"变成"我具体做出了什么"。**

---

## 九、本地预览（部署前先看看效果）

直接**双击 `index.html`** 就能在浏览器里打开。

或者起个本地服务（更接近线上环境）：

```powershell
cd "C:\Users\HP\Desktop\codex专用文件夹\my-homepage"
python -m http.server 8000
```

然后访问 http://localhost:8000

---

## 十、下一步

主页部署完之后，按这个顺序做：

1. **把 URL 写进简历**（放在最上面联系方式那行）
2. 在 GitHub 上给推荐系统项目建个仓库，把代码传上去，主页里链接过去
   —— **面试官会点进去看代码，这比主页本身更重要**
3. 加个 README 到项目仓库，写清算法原理和实验数据
4. 等你打完区域赛，回来把奖项加到主页最显眼的位置
