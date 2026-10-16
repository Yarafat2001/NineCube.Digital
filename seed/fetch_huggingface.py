"""Only consume a pinned, explicitly licensed mobile specification dataset."""
import argparse
import json
from common import fetch, save_json, RAW

DATASET = "jomarie04/smartphone-specifications-2020-2024"
ALLOWED_LICENSES = {"mit", "apache-2.0", "cc0-1.0", "cc-by-4.0"}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    raw = fetch(f"https://huggingface.co/api/datasets/{DATASET}", "hf-metadata.json", "Hugging Face", "Metadata only", args.refresh)
    if not raw:
        return
    meta = json.loads(raw)
    license_name = meta.get("cardData", {}).get("license")
    if license_name not in ALLOWED_LICENSES:
        raise ValueError(f"Refusing dataset license: {license_name}")
    revision = meta["sha"]
    csvs = [x["rfilename"] for x in meta["siblings"] if x["rfilename"].endswith(".csv")]
    if len(csvs) != 1:
        raise ValueError("Dataset layout changed: expected exactly one CSV; review adapter.")
    base = f"https://huggingface.co/datasets/{DATASET}/resolve/{revision}/"
    fetch(base + "README.md", "hf-card.md", DATASET, license_name, args.refresh)
    data = fetch(base + csvs[0], "hf-phones.csv", DATASET, license_name, args.refresh)
    if data:
        save_json(RAW / "hf-provenance.json", dict(source_name=DATASET, source_url=base + csvs[0],
                  source_license=license_name, revision=revision))

if __name__ == "__main__":
    main()

