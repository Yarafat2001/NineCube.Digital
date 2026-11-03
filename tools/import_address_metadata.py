"""Import Google's Apache-2.0 address-format metadata for the API and storefront.

No customer addresses are sent to a third party; runtime forms use the checked-in snapshot.
"""
import hashlib
import json
from pathlib import Path
import re
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://raw.githubusercontent.com/google/libaddressinput/master/common/src/main/java/com/google/i18n/addressinput/common/RegionDataConstants.java"
LICENSE = "https://raw.githubusercontent.com/google/libaddressinput/master/LICENSE"


def main():
    source = urlopen(SOURCE, timeout=30).read()
    countries = {}
    for code, expression in re.findall(r'map\.put\(\s*"([A-Z]{2})",\s*(.*?)\);', source.decode(), re.S):
        fragments = re.findall(r'"(?:\\.|[^"\\])*"', expression)
        metadata = json.loads("".join(json.loads(fragment) for fragment in fragments))
        countries[code] = {key: metadata[key] for key in (
            "name", "fmt", "lfmt", "require", "state_name_type", "locality_name_type", "sublocality_name_type", "zip_name_type"
        ) if key in metadata}
    countries.pop("ZZ", None)
    assert len(countries) > 200 and all(code in countries for code in ("BD", "US", "GB", "AE", "JP"))
    target = ROOT / "shared"
    target.mkdir(exist_ok=True)
    (target / "address-countries.json").write_text(json.dumps(countries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (target / "address-countries.source.json").write_text(json.dumps({"source": SOURCE,
        "sha256": hashlib.sha256(source).hexdigest(), "copyright": "Copyright (C) 2010 Google Inc.",
        "license": "Apache-2.0", "documentation": "https://github.com/google/libaddressinput/wiki/AddressValidationMetadata"}, indent=2) + "\n", encoding="utf-8")
    (target / "LICENSE.address-metadata").write_bytes(urlopen(LICENSE, timeout=30).read())
    print(f"Imported address metadata for {len(countries)} countries/regions.")


if __name__ == "__main__":
    main()
