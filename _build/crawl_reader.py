#!/usr/bin/env python3
"""从洛谷抓 CF 题面，输出给主页 reader 用的 JSON。

数据源说明：
    codeforces.com 和 luogu.com.cn 都在 Cloudflare 后面，机房 IP 一律被
    「Just a moment...」挑战拦住。实测只有住宅网络能过。
    所以爬虫跑在能通的地方（本地 / 自己的机器），产物推到 GitHub Pages，
    访客打开就是完整题面 —— 不需要后端，也不需要 iframe。

产物:
    reader/data/{tag}.json    单题
    reader/data/index.json    已收录清单 {gen, ids[], meta{}}

用法:
    python crawl_reader.py --min 1400 --max 1600 --limit 200
    python crawl_reader.py 1858B 1528A
    python crawl_reader.py --min 1200 --max 1900 --limit 4000   # 大批量，可中断续爬
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
import time
import urllib.error
import urllib.request
import http.cookiejar
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent      # my-homepage/
SNAPSHOT = ROOT / "data" / "problems.json"          # 题库快照(选题目用)
DATA = ROOT / "reader" / "data"                     # 产物目录

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
ORIGIN = "https://www.luogu.com.cn"
DELAY = 1.8


# ---------------------------------------------------------------- 抓取
def make_opener():
    """带 cookie 的 opener：洛谷首次访问会 302 下发 C3VK，再请求才给内容。"""
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def fetch_text(opener, url, timeout=35):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip",
    })
    with opener.open(req, timeout=timeout) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return raw.decode("utf-8", "replace")


def extract_data(html):
    """洛谷把整页数据塞在 <script type="application/json"> 里。"""
    for m in re.finditer(r'<script[^>]*type="application/json"[^>]*>([\s\S]*?)</script>', html):
        body = m.group(1).strip()
        if not body.startswith("{"):
            continue
        try:
            j = json.loads(body)
        except Exception:
            continue
        if isinstance(j, dict) and j.get("data", {}).get("problem"):
            return j["data"]
    return None


def clean_translation(s):
    """剥掉洛谷机翻的署名水印。"""
    s = re.sub(r"\s*由\s*ChatGPT[^\n]*翻译\s*$", "", s or "")
    s = re.sub(r"\s*由\s*AI[^\n]*翻译\s*$", "", s)
    s = re.sub(r"\s*Translated by[^\n]*$", "", s, flags=re.I)
    return s.strip()


def build_problem(data, tag):
    p = data["problem"]
    cf = re.match(r"^CF(\d+)([A-Z]\d*)$", p["pid"])
    limits = p.get("limits") or {}
    t = limits.get("time")
    m = limits.get("memory")

    translations = {}
    for loc, tr in (data.get("translations") or {}).items():
        if tr and tr.get("description"):
            is_zh = "zh" in loc.lower()
            f = clean_translation if is_zh else (lambda x: x or "")
            translations[loc] = {
                "name": tr.get("name") or "",
                "background": f(tr.get("background") or ""),
                "description": f(tr.get("description") or ""),
                "formatI": f(tr.get("formatI") or ""),
                "formatO": f(tr.get("formatO") or ""),
                "hint": f(tr.get("hint") or ""),
            }

    raw = p.get("content") or {}
    picked = translations.get("zh-CN") or translations.get("en") or {
        "name": raw.get("name") or "",
        "background": raw.get("background") or "",
        "description": raw.get("description") or "",
        "formatI": raw.get("formatI") or "",
        "formatO": raw.get("formatO") or "",
        "hint": raw.get("hint") or "",
    }

    return {
        "id": p["pid"],
        "tag": tag,
        "source": "luogu",
        "cid": int(cf.group(1)) if cf else None,
        "idx": cf.group(2) if cf else None,
        "title": p.get("name") or "",
        "difficulty": p.get("difficulty"),
        "timeMs": t[0] if isinstance(t, list) and t else t,
        "memoryKb": m[0] if isinstance(m, list) and m else m,
        "submit": p.get("totalSubmit"),
        "accepted": p.get("totalAccepted"),
        "samples": [{"input": s[0] if len(s) > 0 else "",
                     "output": s[1] if len(s) > 1 else ""}
                    for s in (p.get("samples") or [])],
        "content": dict(picked, locale="zh-CN" if picked is translations.get("zh-CN") else "en"),
        "translations": translations,
        "url": f"{ORIGIN}/problem/{p['pid']}",
        "cfUrl": (f"https://codeforces.com/problemset/problem/{cf.group(1)}/{cf.group(2)}"
                  if cf else None),
        "fetchedAt": int(time.time() * 1000),
    }


# ---------------------------------------------------------------- 题目来源
def ids_from_snapshot(min_r, max_r):
    if not SNAPSHOT.exists():
        raise SystemExit(f"[FAIL] 找不到题库快照 {SNAPSHOT}")
    snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    out = []
    for row in snap.get("p", []):
        cid, idx, _name, rating = row[0], row[1], row[2], row[3]
        if min_r <= rating <= max_r:
            out.append((f"{cid}{idx}", rating, row[4] if len(row) > 4 else 0))
    # 通过数从高到低：先收录经典题
    out.sort(key=lambda x: -x[2])
    return out


def parse_id(arg):
    m = re.match(r"^(\d+)\s*[/-]?\s*([A-Za-z]\d*|\d+)$", arg.strip())
    if not m:
        raise ValueError(arg)
    return int(m.group(1)), m.group(2).upper()


# ---------------------------------------------------------------- 主流程
def load_index():
    f = DATA / "index.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"gen": 0, "ids": [], "meta": {}}


def save_index(idx):
    idx["ids"] = sorted(idx["meta"].keys())
    idx["gen"] = int(time.time())
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "index.json").write_text(
        json.dumps(idx, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description="抓洛谷题面生成 reader JSON")
    ap.add_argument("ids", nargs="*", help="题号，如 1858B")
    ap.add_argument("--min", type=int, default=1400, help="难度下限")
    ap.add_argument("--max", type=int, default=1600, help="难度上限")
    ap.add_argument("--limit", type=int, default=50, help="本次最多抓多少（默认 50）")
    ap.add_argument("--delay", type=float, default=DELAY)
    ap.add_argument("--force", action="store_true", help="已收录的也重抓")
    args = ap.parse_args(argv)

    DATA.mkdir(parents=True, exist_ok=True)
    index = load_index()
    opener = make_opener()

    if args.ids:
        targets = []
        for a in args.ids:
            try:
                cid, idx = parse_id(a)
                targets.append((f"{cid}{idx}", None, 0))
            except ValueError:
                print(f"[WARN] 看不懂的题号 {a}")
    else:
        allp = ids_from_snapshot(args.min, args.max)
        pending = [t for t in allp if args.force or not (DATA / f"{t[0]}.json").exists()]
        print(f"[..] 区间 {args.min}-{args.max} 共 {len(allp)} 题，未收录 {len(pending)} 题")
        targets = pending[:args.limit]

    if not targets:
        print("没有要抓的题目（都已收录，或用 --force 强制重抓）")
        save_index(index)
        return 0

    ok = failed = 0
    started = time.time()
    last = 0.0
    for i, (tag, rating, _solved) in enumerate(targets, 1):
        dest = DATA / f"{tag}.json"
        if dest.exists() and not args.force:
            print(f"[{i}/{len(targets)}] {tag} 已收录，跳过")
            continue

        gap = args.delay - (time.time() - last)
        if gap > 0:
            time.sleep(gap)
        last = time.time()

        eta = ""
        if i > 1:
            per = (time.time() - started) / (i - 1)
            eta = f"  [剩余约 {(len(targets) - i) * per / 60:.0f} 分钟]"
        print(f"[{i}/{len(targets)}] {tag} 抓取{eta}")

        try:
            html = fetch_text(opener, f"{ORIGIN}/problem/CF{tag}")
            data = extract_data(html)
            if not data:
                raise ValueError("页面里没找到题目数据（可能被挑战页拦了）")
            prob = build_problem(data, tag)
            if not prob["title"]:
                raise ValueError("标题为空")
            dest.write_text(json.dumps(prob, ensure_ascii=False, separators=(",", ":")),
                            encoding="utf-8")
            index["meta"][tag] = {
                "title": prob["title"],
                "rating": rating,
                "difficulty": prob["difficulty"],
                "timeMs": prob["timeMs"],
            }
            ok += 1
            print(f"    [OK] {prob['title']}  样例 {len(prob['samples'])} 组  "
                  f"{dest.stat().st_size // 1024} KB")
        except urllib.error.HTTPError as e:
            failed += 1
            print(f"    [FAIL] HTTP {e.code}")
        except Exception as e:
            failed += 1
            print(f"    [FAIL] {type(e).__name__}: {e}")

        # 每 10 题落一次盘，中断也不会白跑
        if i % 10 == 0:
            save_index(index)

    save_index(index)
    print(f"\n完成: 新增 {ok} 题, 失败 {failed} 题")
    print(f"已收录总计: {len(index['ids'])} 题")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
