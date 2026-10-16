"""Standard-library helpers; no application imports or database schema changes."""
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import sys
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
CLEAN = ROOT / "clean"
USER_AGENT = "NineCubeSeed/1.0 (educational Bangladesh catalogue import)"
_last = {}

def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def fetch(url, filename, source, license_name, refresh=False):
    """One request per second per host; cached successes; no access-block retries."""
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / filename
    manifest_path = RAW / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    if path.exists() and not refresh:
        entry = next((x for x in reversed(manifest) if x.get("file") == filename and x.get("url") == url and x.get("status") == "ok"), None)
        if entry and hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"]:
            data = path.read_bytes()
            if b"<title>One moment, please" not in data and b"Just a moment..." not in data:
                return data
    host = urlsplit(url).netloc
    time.sleep(max(0, 1.1 - (time.monotonic() - _last.get(host, 0))))
    entry = dict(url=url, fetched_at=datetime.now(timezone.utc).isoformat(), source=source,
                 license=license_name, file=filename)
    try:
        with urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=35) as response:
            data = response.read()
        path.write_bytes(data)
        entry.update(status="ok", sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))
        if b"<title>One moment, please" in data or b"Just a moment..." in data:
            entry.update(status="blocked", error="HTML access challenge; no bypass attempted")
            data = None
    except Exception as error:
        entry.update(status="blocked", error=str(error))
        data = None
    finally:
        _last[host] = time.monotonic()
        manifest.append(entry)
        save_json(manifest_path, manifest)
    print(source, filename, entry["status"])
    return data

class ParameterizedSql(str):
    def __new__(cls, statement, parameters):
        result = super().__new__(cls, statement)
        result.parameters = parameters
        return result

def sql(statement, parameters=None):
    parameters = parameters if parameters is not None else getattr(statement, "parameters", None)
    server = os.environ.get("NINECUBE_SQL_SERVER")
    database = os.environ.get("NINECUBE_SQL_DATABASE")
    if not server or not database:
        raise ValueError("Set NINECUBE_SQL_SERVER and NINECUBE_SQL_DATABASE explicitly.")
    if parameters is not None:
        sys.path.insert(0, str(ROOT / ".deps"))
        try:
            import pyodbc
        except ImportError as error:
            raise RuntimeError("Install seed requirements: python -m pip install --target seed/.deps -r seed/requirements.txt") from error
        drivers = pyodbc.drivers()
        driver = next((d for d in ["ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server"] if d in drivers), None)
        if not driver:
            raise RuntimeError("Microsoft ODBC Driver 17 or 18 for SQL Server is required.")
        quote = lambda value: "{" + value.replace("}", "}}") + "}"
        encrypt = os.environ.get("NINECUBE_SQL_ENCRYPT", "no" if server.lower().startswith("(localdb)") else "yes")
        if encrypt.lower() not in {"yes", "no"}:
            raise ValueError("NINECUBE_SQL_ENCRYPT must be yes or no.")
        connection = f"DRIVER={quote(driver)};SERVER={quote(server)};DATABASE={quote(database)};TrustServerCertificate=yes;Encrypt={encrypt};"
        user = os.environ.get("NINECUBE_SQL_USER")
        if user:
            password = os.environ.get("SQLCMDPASSWORD")
            if not password:
                raise ValueError("SQL authentication requires SQLCMDPASSWORD.")
            connection += f"UID={quote(user)};PWD={quote(password)};"
        else:
            connection += "Trusted_Connection=yes;"
        try:
            with pyodbc.connect(connection, autocommit=True, timeout=60) as db:
                db.timeout = 120
                cursor = db.cursor()
                cursor.execute("SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;" + str(statement), parameters)
                output = []
                while True:
                    if cursor.description:
                        output.extend(str(row[0]) for row in cursor.fetchall())
                    if not cursor.nextset():
                        break
                return "\n".join(output)
        except pyodbc.Error as error:
            raise RuntimeError(str(error)) from error
    command = ["sqlcmd", "-S", server, "-d", database, "-b", "-C", "-I", "-y", "0", "-w", "65535", "-t", "120", "-f", "65001"]
    username = os.environ.get("NINECUBE_SQL_USER")
    command += ["-U", username] if username else ["-E"]
    if username and not os.environ.get("SQLCMDPASSWORD"):
        raise ValueError("SQL authentication requires SQLCMDPASSWORD.")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", encoding="utf-8-sig", delete=False) as stream:
        stream.write("SET NOCOUNT ON; SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF;\n" + statement)
        path = stream.name
    try:
        result = subprocess.run(command + ["-i", path], capture_output=True, text=True, encoding="utf-8")
        if result.returncode:
            raise RuntimeError((result.stderr + result.stdout).strip())
        return result.stdout.strip()
    finally:
        Path(path).unlink(missing_ok=True)

def sql_json(statement):
    text = sql(statement + " FOR JSON PATH;")
    if not text:
        return []
    return json.loads("".join(text.splitlines()))

def categories():
    return sql_json("SELECT Id,Name,Slug,ParentId,Path,Depth,IsActive FROM dbo.Categories ORDER BY Id")

def sku(slug):
    """Readable, deterministic code; the database unique index remains the final collision guard."""
    normalized = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-")
    parts = [part for part in normalized.split("-") if part not in {"generic", "the", "and"}]
    label = "-".join(part[:4] for part in parts)[:14].rstrip("-").upper() or "ITEM"
    suffix = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:6].upper()
    return f"BD-{label}-{suffix}"

