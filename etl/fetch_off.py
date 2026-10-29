"""Controlled snapshot download from the Open Food Facts search API.

Open Food Facts data are licensed under the Open Database License (ODbL 1.0);
individual contents under the Database Contents License; images under CC BY-SA.
See docs/DATASET.md for the attribution and share-alike obligations.

This script is run manually (never at application start-up). It respects the
documented search-API rate limit (10 requests/minute) and sends an identifying
User-Agent, then writes a dated JSONL snapshot to data/raw/off/.

Usage:
    python etl/fetch_off.py --pages 45 --country india
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.parse
import urllib.request

API_V2 = "https://world.openfoodfacts.org/api/v2/search"
# Open Food Facts' Elasticsearch-based search service ("search-a-licious").
# Used by default because it stays available when the v2 search endpoint is overloaded.
API_SAL = "https://search.openfoodfacts.org/search"
FIELDS = [
    "code", "product_name", "product_name_en", "brands", "categories_tags",
    "categories_hierarchy", "ingredients_text", "ingredients_text_en",
    "image_front_small_url", "image_front_url", "last_modified_t", "nutriments",
    "nutrition_data_per", "nutriscore_grade", "nutriscore_score", "countries_tags",
    "quantity", "labels_tags", "ingredients_analysis_tags", "serving_size",
    "nova_group", "allergens_tags",
]
MIN_INTERVAL_S = 6.5  # 10 req/min limit on search queries, with margin


def _get_json(url: str, user_agent: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_page_sal(country: str, page: int, page_size: int, user_agent: str) -> dict:
    query = f'countries_tags:"en:{country}" AND states_tags:"en:nutrition-facts-completed"'
    params = {
        "q": query,
        "fields": ",".join(FIELDS),
        "page_size": str(page_size),
        "page": str(page),
        "sort_by": "-unique_scans_n",
    }
    data = _get_json(f"{API_SAL}?{urllib.parse.urlencode(params)}", user_agent)
    products = []
    for hit in data.get("hits", []):
        # search-a-licious returns brands as a list; v2 returns a comma-separated string
        if isinstance(hit.get("brands"), list):
            hit["brands"] = ", ".join(hit["brands"])
        products.append(hit)
    return {"count": data.get("count"), "products": products}


def fetch_page_v2(country: str, page: int, page_size: int, user_agent: str) -> dict:
    params = {
        "countries_tags_en": country,
        "states_tags": "en:nutrition-facts-completed",
        "fields": ",".join(FIELDS),
        "page_size": str(page_size),
        "page": str(page),
        "sort_by": "unique_scans_n",
        "json": "1",
    }
    return _get_json(f"{API_V2}?{urllib.parse.urlencode(params)}", user_agent)


def fetch_page(api: str, country: str, page: int, page_size: int, user_agent: str) -> dict:
    fn = fetch_page_sal if api == "sal" else fetch_page_v2
    for attempt in range(4):
        try:
            return fn(country, page, page_size, user_agent)
        except Exception as exc:  # network errors / 429 / 5xx
            wait = 20 * (attempt + 1)
            print(f"  page {page} attempt {attempt + 1} failed: {exc}; retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"page {page} failed after retries")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", default="india")
    ap.add_argument("--api", choices=["sal", "v2"], default="sal",
                    help="sal = search.openfoodfacts.org (default), v2 = world.openfoodfacts.org/api/v2/search")
    ap.add_argument("--pages", type=int, default=40)
    ap.add_argument("--page-size", type=int, default=100)
    ap.add_argument("--out-dir", default=os.path.join("data", "raw", "off"))
    ap.add_argument("--user-agent", default=os.environ.get(
        "OFF_USER_AGENT", "NutriScan-Academic/1.0 (student project; offline snapshot import)"))
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    stamp = dt.date.today().isoformat()
    out_path = os.path.join(args.out_dir, f"off_{args.country}_{stamp}.jsonl")
    meta_path = out_path.replace(".jsonl", ".meta.json")

    seen: set[str] = set()
    total_reported = None
    last = 0.0
    with open(out_path, "w", encoding="utf-8") as fh:
        for page in range(1, args.pages + 1):
            delay = MIN_INTERVAL_S - (time.monotonic() - last)
            if delay > 0:
                time.sleep(delay)
            last = time.monotonic()
            data = fetch_page(args.api, args.country, page, args.page_size, args.user_agent)
            total_reported = data.get("count", total_reported)
            products = data.get("products", [])
            if not products:
                break
            new = 0
            for p in products:
                code = str(p.get("code", ""))
                if code in seen:
                    continue
                seen.add(code)
                fh.write(json.dumps(p, ensure_ascii=False) + "\n")
                new += 1
            print(f"page {page}: {len(products)} products ({new} new), total {len(seen)}")

    meta = {
        "source": "Open Food Facts search API",
        "endpoint": API_SAL if args.api == "sal" else API_V2,
        "country": args.country,
        "filters": {"states_tags": "en:nutrition-facts-completed"},
        "downloaded_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "pages": args.pages,
        "page_size": args.page_size,
        "records": len(seen),
        "count_reported_by_api": total_reported,
        "license": "ODbL 1.0 (database), DbCL 1.0 (contents), CC BY-SA (images)",
        "attribution": "Data from Open Food Facts contributors - https://world.openfoodfacts.org",
    }
    with open(meta_path, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    print(f"wrote {len(seen)} records to {out_path}")


if __name__ == "__main__":
    main()
