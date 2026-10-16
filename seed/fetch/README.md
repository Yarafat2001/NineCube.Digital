# Source fetch entry points

Run the existing source-specific scripts from the repository root:

- `python seed/probe_sources.py` — robots-aware official brand discovery
- `python seed/fetch_more_official.py` — approved official catalogue pages
- `python seed/fetch_open_facts.py` — Bangladesh-tagged Open Food Facts
- `python seed/fetch_huggingface.py` — pinned, license-checked phone dataset

All scripts use the shared cached/rate-limited fetch helper and raw manifest.
Challenge pages and disallowed robots paths are not importable product data.

