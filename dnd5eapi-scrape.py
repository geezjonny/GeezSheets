import requests
import json
import os
import time

BASE_URL = "https://www.dnd5eapi.co/api/2014"

# Datasets that have a /list + /detail pattern (index → detail fetch per item)
DETAIL_DATASETS = [
    "spells",
    "feats",
    "conditions",
    "equipment",
    "magic-items",
    "monsters",
    "skills",
    "weapon-properties",
    "damage-types",
    "backgrounds",
    "classes",
    "traits",
    "features",
    "languages",
    "races",
]

# Datasets that return useful data directly from the index (no detail fetch needed)
FLAT_DATASETS = [
    "rules",
    "rule-sections",
    "ability-scores",
    "alignments",
    "magic-schools",
    "equipment-categories",
]

os.makedirs("data", exist_ok=True)


def download_detail_dataset(endpoint):
    """Fetch index, then fetch full detail record for each item."""

    print(f"\n{'='*50}")
    print(f"Downloading: {endpoint}")
    print(f"{'='*50}")

    try:
        index = requests.get(f"{BASE_URL}/{endpoint}", timeout=10).json()
    except Exception as e:
        print(f"  ERROR fetching index: {e}")
        return

    items = index.get("results", [])
    if not items:
        print(f"  No results found — skipping")
        return

    records = []
    total = len(items)

    for i, item in enumerate(items, start=1):
        url = "https://www.dnd5eapi.co" + item["url"]
        print(f"  {i}/{total} — {item['name']}")

        try:
            detail = requests.get(url, timeout=10).json()
            records.append(detail)
            time.sleep(0.05)
        except Exception as e:
            print(f"    ERROR: {e}")

    filename = endpoint.replace("-", "_") + ".json"
    path = os.path.join("data", filename)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    print(f"  Saved {len(records)} records → data/{filename}")


def download_flat_dataset(endpoint):
    """Fetch index directly — the top-level data is sufficient."""

    print(f"\n{'='*50}")
    print(f"Downloading (flat): {endpoint}")
    print(f"{'='*50}")

    try:
        data = requests.get(f"{BASE_URL}/{endpoint}", timeout=10).json()
    except Exception as e:
        print(f"  ERROR: {e}")
        return

    # Some flat endpoints return {results:[...]}, others return the data directly
    if "results" in data:
        records = data["results"]
    elif isinstance(data, list):
        records = data
    else:
        # Single dict — wrap in array
        records = [data]

    filename = endpoint.replace("-", "_") + ".json"
    path = os.path.join("data", filename)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    print(f"  Saved {len(records)} records → data/{filename}")


def main():
    print("\nD&D 5e API Scraper")
    print(f"Base URL: {BASE_URL}")
    print(f"Detail datasets: {len(DETAIL_DATASETS)}")
    print(f"Flat datasets: {len(FLAT_DATASETS)}")

    # Detail datasets (index + per-item fetch)
    for endpoint in DETAIL_DATASETS:
        download_detail_dataset(endpoint)

    # Flat datasets (index only)
    for endpoint in FLAT_DATASETS:
        download_flat_dataset(endpoint)

    # Summary
    print(f"\n{'='*50}")
    print("Done! Files in data/:")
    for f in sorted(os.listdir("data")):
        size = os.path.getsize(os.path.join("data", f))
        count = len(json.load(open(os.path.join("data", f), encoding="utf-8")))
        print(f"  {f:<30} {count:>4} records   ({size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
