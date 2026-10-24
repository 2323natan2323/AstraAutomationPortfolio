"""Privacy scan: read the ORIGINAL artifacts at run time (they are never stored in the repo) and make sure none of their
sensitive strings appear anywhere in the publishable tree. Prints categories and file names only, never values.
Usage: python -I tests/leak_scan.py   (originals default to the Downloads folder; override with ASTRA_ORIGINALS)"""
import json, os, re, subprocess, sys, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.environ.get("ASTRA_ORIGINALS", os.path.join(os.path.expanduser("~"), "Downloads"))
REQ, XLSX = os.path.join(SRC, "request example.txt"), os.path.join(SRC, "astra-results table excel.xlsx")
PUBLIC_OK = {"2323natan2323@gmail.com"}          # the contact address is public on purpose
SAFE = {"TLV", "DXB", "EK", "IL", "Flights", "Flight"}  # route and airline codes are not sensitive

if not (os.path.exists(REQ) and os.path.exists(XLSX)):
    print("originals not found, scan cannot run"); sys.exit(2)

secrets = {}   # value -> category
def add(v, cat):
    v = str(v).strip()
    if len(v) >= 5 and v not in PUBLIC_OK and v not in SAFE: secrets[v] = cat

def walk(o):
    if isinstance(o, dict):
        for v in o.values(): yield from walk(v)
    elif isinstance(o, list):
        for v in o: yield from walk(v)
    elif isinstance(o, str): yield o

for s in walk(json.load(open(REQ, encoding="utf-8"))):
    add(s, "request value")
    for host in re.findall(r"https?://[^/\s]+", s): add(host, "request host")

ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
z = zipfile.ZipFile(XLSX)
ss = ["".join(t.text or "" for t in si.iter("{%s}t" % ns["m"])) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns)]
for v in ss:
    for host in re.findall(r"https?://[^/\s?#]+", v): add(host, "workbook host"); add(host.split("//")[1], "workbook host")
    for tok in re.findall(r"eyJ[A-Za-z0-9_\-]{10,}", v): add(tok[:40], "workbook token")
    for sid in re.findall(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", v): add(sid, "workbook identifier")
    for num in re.findall(r"\b\d{7,}\b", v): add(num, "workbook number")
rels = z.read("xl/worksheets/_rels/sheet1.xml.rels").decode("utf8", "ignore")
for t in re.findall(r'Target="([^"]+)"', rels):
    for seg in re.split(r"[/\\]", t):
        if len(seg) >= 7 and re.search(r"[0-9._\-]", seg) and seg.lower() not in ("net8.0",) and not seg.startswith("printerSettings"): add(seg, "workbook path")
add("bin/Debug", "workbook path"); add("bin\\Debug", "workbook path")
# brand words come from the originals themselves (second-level domain labels) and from an optional private terms file
for h in [k for k, c in list(secrets.items()) if "host" in c]:
    for label in re.sub(r"^https?://", "", h).split(":")[0].split("."):
        if len(label) >= 6 and label not in ("localhost",): secrets[label] = "employer or internal name"
PRIV = os.environ.get("ASTRA_PRIVATE_DIR", r"C:\Projects\astra-private")
if os.path.exists(os.path.join(PRIV, "banned-terms.txt")):
    for line in open(os.path.join(PRIV, "banned-terms.txt"), encoding="utf-8"):
        if line.strip(): secrets[line.strip()] = "employer or internal name"

# publishable tree: tracked files plus untracked-but-not-ignored files, text only
files = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True).stdout.split("\n")
hits = []
for rel in files:
    if not rel or rel in ("tests/leak_scan.py",) or rel.startswith(("tests/screenshots", "node_modules/")) or rel.endswith((".jpg", ".png", ".woff2", ".ttf", ".webp", ".lock")): continue
    try: text = open(os.path.join(ROOT, rel), encoding="utf-8", errors="ignore").read()
    except OSError: continue
    low = text.lower()
    for v, cat in secrets.items():
        if v.lower() in low :
            hits.append((rel, cat))
hits = sorted(set(hits))
print(f"scanned {len(files)} files against {len(secrets)} sensitive strings from the originals")
for rel, cat in hits: print(f"LEAK: {rel} ({cat})")
sys.exit(1 if hits else 0)
