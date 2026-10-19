"""把 Codeforces problemset.problems 原始响应压成前端可直接吃的紧凑格式。

输入: _build/problemset.json   (curl 抓的原始 ~2.2MB 响应)
输出: data/problems.json       (约 450KB, gzip 后 ~110KB)

紧凑格式 v3（不再携带标签）:
  {
    "v": 3,
    "gen": 1760000000,                              # 生成时间(unix秒)
    "p": [[contestId, "A", "名字", rating, solvedCount], ...]
  }
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "_build" / "problemset.json"
OUT = ROOT / "data" / "problems.json"
SCHEMA = 3


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

    rows = []
    dropped_no_rating = 0
    for p in problems:
        rating = p.get("rating")
        if not rating:                      # 未评级题目直接丢弃(推荐场景无意义)
            dropped_no_rating += 1
            continue
        cid, idx = p["contestId"], p["index"]
        rows.append([cid, idx, p["name"], rating, stats.get((cid, idx), 0)])

    rows.sort(key=lambda r: (r[0], r[1]))

    payload = {"v": SCHEMA, "gen": int(time.time()), "p": rows}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    size = OUT.stat().st_size
    print(f"[OK] 题目 {len(rows)} 条 (丢弃未评级 {dropped_no_rating})")
    print(f"[OK] contestId {rows[0][0]}..{rows[-1][0]}")
    print(f"[OK] schema=v{SCHEMA}, 输出 {OUT} {size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
