# Transform entry point

`python seed/transform.py` writes attributed clean products JSON/CSV and skipped
row reasons. Review `MASTER_SEED_PREFLIGHT.md` first: a missing requested category
must stop a new master-brief import; transformation must not create categories.

