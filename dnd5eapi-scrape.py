import requests
import json
import os
import time

BASE_URL = "https://www.dnd5eapi.co/api/2014"

CLASSES = [
    "barbarian","bard","cleric","druid","fighter",
    "monk","paladin","ranger","rogue","sorcerer",
    "warlock","wizard",
]

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

    # Class levels — fetch all 20 levels for each class, extract class_specific data
    print(f"\n{'='*50}")
    print("Downloading: class levels (class_specific data)")
    print(f"{'='*50}")
    class_levels = {}
    for cls in CLASSES:
        print(f"  {cls}...")
        try:
            data = requests.get(f"{BASE_URL}/classes/{cls}/levels", timeout=10).json()
            class_levels[cls] = data
            time.sleep(0.1)
        except Exception as e:
            print(f"    ERROR: {e}")

    with open(os.path.join("data","class_levels.json"), "w", encoding="utf-8") as f:
        json.dump(class_levels, f, indent=2, ensure_ascii=False)
    print(f"  Saved class_levels.json")

    # Build resources.json from class_levels class_specific fields
    # This maps each class → list of trackable resources with per-level counts
    print(f"\n{'='*50}")
    print("Building: resources.json")
    print(f"{'='*50}")

    # Map of class_specific API field → human-readable resource config
    RESOURCE_MAP = {
        "barbarian": [
            {"api_field": "rage_count",            "name": "Rage",             "die": None,  "reset": "long"},
        ],
        "bard": [
            {"api_field": "bardic_inspiration_die","name": "Bardic Inspiration","die_field": True,"reset": "short"},
        ],
        "cleric": [
            {"api_field": "channel_divinity_charges","name": "Channel Divinity","die": None, "reset": "short"},
        ],
        "druid": [
            {"api_field": "wild_shape_max_cr",     "name": "Wild Shape",        "die": None, "reset": "short", "max_override": 2},
        ],
        "fighter": [
            {"api_field": "action_surges",         "name": "Action Surge",      "die": None, "reset": "short"},
            {"api_field": "indomitable_uses",      "name": "Indomitable",       "die": None, "reset": "long"},
            # Battle Master subclass — only if subclass chosen, handled in resources.json as subclass entry
        ],
        "monk": [
            {"api_field": "ki_points",             "name": "Ki Points",         "die": None, "reset": "short"},
        ],
        "paladin": [
            {"api_field": "channel_divinity_charges","name": "Channel Divinity","die": None, "reset": "short"},
        ],
        "ranger": [],
        "rogue": [],
        "sorcerer": [
            {"api_field": "sorcery_points",        "name": "Sorcery Points",    "die": None, "reset": "long"},
        ],
        "warlock": [],
        "wizard": [],
    }

    resources = {}
    for cls in CLASSES:
        levels_data = class_levels.get(cls, [])
        resources[cls] = {"base": [], "subclasses": {}}
        for res_cfg in RESOURCE_MAP.get(cls, []):
            by_level = {}
            for lvl_obj in levels_data:
                lvl   = lvl_obj.get("level", 0)
                spec  = lvl_obj.get("class_specific", {})
                field = res_cfg["api_field"]
                val   = spec.get(field)
                if val is not None and val > 0:
                    # For die fields the value is the die size (e.g. 6 = d6)
                    if res_cfg.get("die_field"):
                        by_level[str(lvl)] = {"max": 1, "die": f"d{val}"}
                    elif res_cfg.get("max_override"):
                        by_level[str(lvl)] = res_cfg["max_override"]
                    else:
                        by_level[str(lvl)] = int(val)
            if by_level:
                resources[cls]["base"].append({
                    "name":    res_cfg["name"],
                    "die":     res_cfg.get("die"),
                    "reset":   res_cfg["reset"],
                    "by_level": by_level
                })

    # Add hardcoded subclass resources not in the API class_specific fields
    resources["fighter"]["subclasses"]["Battle Master"] = [
        {"name": "Superiority Dice", "die": "d8", "reset": "short",
         "by_level": {"3":4,"7":5,"10":5,"15":6,"18":6}}
    ]
    resources["fighter"]["subclasses"]["Eldritch Knight"] = [
        {"name": "Arcane Recovery", "die": None, "reset": "long",
         "by_level": {"3":1}}
    ]
    resources["paladin"]["subclasses"]["any"] = [
        {"name": "Lay on Hands", "die": None, "reset": "long",
         "by_level": {str(l): l*5 for l in range(1,21)}}
    ]
    resources["ranger"]["base"] = [
        {"name": "Favored Enemy", "die": None, "reset": None,
         "by_level": {"1":1,"6":2,"14":3}}
    ]
    resources["rogue"]["base"] = [
        {"name": "Cunning Action", "die": None, "reset": None,
         "by_level": {"2":1}}
    ]
    resources["rogue"]["subclasses"]["Assassin"] = [
        {"name": "Assassinate", "die": None, "reset": "short",
         "by_level": {"3":1}}
    ]
    resources["warlock"]["base"] = [
        {"name": "Eldritch Invocations", "die": None, "reset": None,
         "by_level": {"2":2,"5":3,"7":4,"9":5,"12":6,"15":7,"18":8}}
    ]
    resources["wizard"]["base"] = [
        {"name": "Arcane Recovery", "die": None, "reset": "long",
         "by_level": {str(l): max(1, l//2) for l in range(1,21)}}
    ]
    # Bard bardic inspiration count (separate from die size which we got from API)
    resources["bard"]["base"].append({
        "name": "Bardic Inspiration Uses",
        "die": None,
        "reset": "short",
        "by_level": {
            "1":1,"2":1,"3":1,"4":1,"5":5,"6":5,"7":5,"8":5,
            "9":5,"10":5,"11":5,"12":5,"13":5,"14":5,"15":5,
            "16":5,"17":5,"18":5,"19":5,"20":5
        }
    })

    with open(os.path.join("data","resources.json"), "w", encoding="utf-8") as f:
        json.dump(resources, f, indent=2, ensure_ascii=False)
    print(f"  Saved resources.json")

    # --- FIX: Clean summary loop for all generated files ---
    print(f"\n{'='*50}")
    print("Scrape Summary")
    print(f"{'='*50}")
    
    for filename in os.listdir("data"):
        if filename.endswith(".json"):
            file_path = os.path.join("data", filename)
            size = os.path.getsize(file_path)
            
            try:
                with open(file_path, "r", encoding="utf-8") as file_obj:
                    data_content = json.load(file_obj)
                    # If it's a dict (like class_levels or resources), count the top-level keys
                    # If it's a list (like spells, monsters), count the elements
                    count = len(data_content) if isinstance(data_content, (list, dict)) else 1
            except Exception:
                count = "N/A"

            print(f"  {filename:<25} {count:>5} entries   ({size/1024:.1f} KB)")


if __name__ == "__main__":
    main()