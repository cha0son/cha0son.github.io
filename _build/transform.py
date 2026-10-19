"""把 Codeforces problemset.problems 原始响应压成前端可直接吃的紧凑格式。

输入: _build/problemset.json   (curl 抓的原始 ~2.2MB 响应)
输出: data/problems.json       (约 500KB, gzip 后 ~140KB)

紧凑格式 v2:
  {
    "v": 2,
    "gen": 1760000000,                      # 生成时间(unix秒)
    "tags": ["2-sat", ...],                 # 38 个, 下标即标签编号
    "p": [[contestId, "A", "名字", rating, [0,12,21], solvedCount], ...]
  }

注意: 标签用「索引数组」而不是位掩码。
原因: 标签有 38 个, 而 JavaScript 的位运算只有 32 位, `1 << 37` 会退化成
`1 << 5`, 导致索引 32~37 的标签(trees / two pointers / strings / sortings /
ternary search / string suffix structures)与低位标签串位。
索引数组既正确又更省字节(2^37 十进制 12 位 vs [1,4,7] 7 位)。
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "_build" / "problemset.json"
OUT = ROOT / "data" / "problems.json"
SCHEMA = 2


def main() -> int:
    raw = json.loads(SRC.read_text(encoding="utf-8"))
    if raw.get("status") != "OK":
        print(f"[FAIL] API status = {raw.get('status')}: {raw.get('comment')}")
        return 1

    problems = raw["result"]["problems"]
    stats = {
        (s["contestId"], s["index"]): s.get("solvedCount", 0)
        for s in raw["result"]["problemStatistics"]
    }

    tags = sorted({t for p in problems for t in p.get("tags", [])})
    tidx = {t: i for i, t in enumerate(tags)}

    rows = []
    dropped_no_rating = 0
    no_tag = 0
    tag_slots = 0
    for p in problems:
        rating = p.get("rating")
        if not rating:                      # 未评级题目直接丢弃(推荐场景无意义)
            dropped_no_rating += 1
            continue
        cid, idx = p["contestId"], p["index"]
        tlist = sorted(tidx[t] for t in p.get("tags", []))
        if not tlist:
            no_tag += 1
        tag_slots += len(tlist)
        rows.append([cid, idx, p["name"], rating, tlist, stats.get((cid, idx), 0)])

    rows.sort(key=lambda r: (r[0], r[1]))

    payload = {
        "v": SCHEMA,
        "gen": int(time.time()),
        "tags": tags,
        "p": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    size = OUT.stat().st_size
    print(f"[OK] 题目 {len(rows)} 条 (丢弃未评级 {dropped_no_rating}, 无标签 {no_tag})")
    print(f"[OK] 标签 {len(tags)} 个, 平均每题 {tag_slots / len(rows):.2f} 个标签")
    print(f"[OK] contestId {rows[0][0]}..{rows[-1][0]}")
    print(f"[OK] schema=v{SCHEMA}, 输出 {OUT} {size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
