import requests
import json
import os
import time

BASE_URL = "https://www.dnd5eapi.co/api"

DATASETS = [
    "spells",
    "feats",
    "conditions",
    "equipment",
    "magic-items"
]

os.makedirs("data", exist_ok=True)


def download_dataset(endpoint):

    print(f"\nDownloading {endpoint}")

    index = requests.get(
        f"{BASE_URL}/{endpoint}"
    ).json()

    records = []

    total = len(index["results"])

    for i, item in enumerate(index["results"], start=1):

        url = "https://www.dnd5eapi.co" + item["url"]

        print(f"{i}/{total} - {item['name']}")

        try:
            detail = requests.get(url).json()

            records.append(detail)

            time.sleep(0.05)

        except Exception as e:
            print(e)

    filename = endpoint.replace("-", "_") + ".json"

    with open(
        os.path.join("data", filename),
        "w",
        encoding="utf8"
    ) as f:

        json.dump(
            records,
            f,
            indent=2,
            ensure_ascii=False
        )

    print(f"Saved {len(records)} records")


for dataset in DATASETS:
    download_dataset(dataset)

print("\nDone!")