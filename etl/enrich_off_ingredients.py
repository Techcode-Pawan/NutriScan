"""Adds ingredient text to an Open Food Facts snapshot using the per-product API.

The search service used by fetch_off.py does not return `ingredients_text`, so this
script requests it product by product, below the documented 100 requests/minute limit
for product reads. It is resumable: codes already present in the output are skipped.

Usage:
    python etl/enrich_off_ingredients.py data/raw/off/off_india_2026-10-29.jsonl
Writes <snapshot>.ingredients.jsonl next to the snapshot.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

API = "https://world.openfoodfacts.org/api/v2/product/{code}.json?fields=code,ingredients_text,ingredients_text_en,image_front_small_url,serving_size"
MIN_INTERVAL_S = 2.5  # ~24 requests/minute; OFF throttled faster rates with HTTP 429 in practice


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    snapshot = sys.argv[1]
    out_path = snapshot.replace(".jsonl", ".ingredients.jsonl")
    user_agent = os.environ.get("OFF_USER_AGENT", "NutriScan-Academic/1.0 (student project; offline snapshot import)")

    done: set[str] = set()
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as fh:
            done = {json.loads(line)["code"] for line in fh if line.strip()}
    codes = [json.loads(line)["code"] for line in open(snapshot, encoding="utf-8") if line.strip()]
    todo = [c for c in codes if c not in done]
    print(f"{len(done)} already enriched, {len(todo)} to fetch")

    last = 0.0
    failures = 0
    with open(out_path, "a", encoding="utf-8") as out:
        for i, code in enumerate(todo, 1):
            delay = MIN_INTERVAL_S - (time.monotonic() - last)
            if delay > 0:
                time.sleep(delay)
            last = time.monotonic()
            req = urllib.request.Request(API.format(code=code), headers={"User-Agent": user_agent})
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
            except Exception as exc:
                if "429" in str(exc):
                    print(f"  rate limited at {code}; pausing 120 s", file=sys.stderr)
                    time.sleep(120)
                    continue  # skipped code is picked up on the next resume
                failures += 1
                print(f"  {code}: {exc}", file=sys.stderr)
                if failures > 50:
                    sys.exit("too many failures; re-run later to resume")
                time.sleep(5)
                continue
            product = data.get("product") or {}
            out.write(json.dumps({
                "code": code,
                "ingredients_text": product.get("ingredients_text_en") or product.get("ingredients_text") or None,
                "image_front_small_url": product.get("image_front_small_url"),
                "serving_size": product.get("serving_size"),
            }, ensure_ascii=False) + "\n")
            if i % 200 == 0:
                out.flush()
                print(f"{i}/{len(todo)}")
    print(f"done; {failures} failures")


if __name__ == "__main__":
    main()
