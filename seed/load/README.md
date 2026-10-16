# Load entry point

Install `seed/requirements.txt` into `seed/.deps`, then run the read-only master
category gate before starting a new import:

```powershell
python -m pip install --target seed/.deps -r seed/requirements.txt
python seed/preflight_master.py
python seed/load.py --dry-run
python seed/load.py
```

Stop if preflight exits 2. The existing loader binds its JSON payload as an ODBC
parameter, resolves SQL categories inside each serializable transaction, skips
existing product slugs/SKUs, adds only missing links and preserves existing stock.
`--with-scenarios` remains explicitly dev-only; never run it in production.
