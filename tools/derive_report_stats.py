"""Derive SAFE aggregate counts from the private workbook and write js/report-stats.js.
Only counts and generic step names are written: no rows, URLs, identifiers or exception text.
Usage: python -I tools/derive_report_stats.py            (originals in Downloads, or ASTRA_ORIGINALS)
       python -I tools/derive_report_stats.py --check    (fail if js/report-stats.js does not match the workbook)"""
import collections, json, os, re, sys, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.environ.get("ASTRA_ORIGINALS", os.path.join(os.path.expanduser("~"), "Downloads"))
XLSX = os.path.join(SRC, "astra-results table excel.xlsx")
OUT = os.path.join(ROOT, "js", "report-stats.js")
if not os.path.exists(XLSX):
    print("workbook not found: cannot derive or verify statistics"); sys.exit(2)

ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
z = zipfile.ZipFile(XLSX)
ss = ["".join(t.text or "" for t in si.iter("{%s}t" % ns["m"])) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns)]
sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
def col(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(): n = n * 26 + ord(ch) - 64
    return n - 1
rows = []
for r in sheet.find("m:sheetData", ns):
    d = {}
    for c in r:
        v = c.find("m:v", ns)
        d[col(c.get("r"))] = (ss[int(v.text)] if c.get("t") == "s" else v.text) if v is not None else None
    rows.append(d)
names = [rows[0].get(i) for i in range(max(rows[0]) + 1)]
data = rows[1:]
status, step = names.index("Status"), names.index("Failed Step")

def bucket(f):
    f = f or ""
    if f.startswith("Unmapped failure"): return "unmapped"
    return {"Summary Page": "summary", "Search Results": "search", "Flexi": "flexi", "Pre-Run Validation": "prerun", "Ancillaries Page": "ancillaries", "Contact Page": "contact", "Stopped manually": "stopped", "No failure": "none"}.get(f, "other:" + f)

total = len(data)
succeeded = sum(1 for r in data if r.get(status) == "Success")
failed = sum(1 for r in data if r.get(status) == "Failed")
by = collections.Counter(bucket(r.get(step)) for r in data if r.get(status) == "Failed")
stopped = by.pop("stopped", 0)
assert not any(k.startswith("other:") for k in by), f"unmapped failed-step names: {[k for k in by if k.startswith('other:')]}"
assert succeeded + failed == total and sum(by.values()) + stopped == failed, "counts do not add up"
order = ["summary", "search", "unmapped", "flexi", "prerun", "ancillaries", "contact"]
stats = {"total": total, "succeeded": succeeded, "failedOther": failed - stopped, "stopped": stopped, "byStep": [[k, by.get(k, 0)] for k in order], "columns": len(names)}
assert sum(n for _, n in stats["byStep"]) == stats["failedOther"], "failed-step buckets do not add up"
text = "/* Historical aggregates from the development workbook (counts only). Regenerate with tools/derive_report_stats.py. */\nwindow.ASTRA_STATS = " + json.dumps(stats, separators=(", ", ": ")) + ";\n"
if "--check" in sys.argv:
    cur = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
    if cur != text: print("MISMATCH: js/report-stats.js is out of date with the workbook"); sys.exit(1)
    print(f"report-stats.js matches the workbook: {total} runs = {succeeded} succeeded + {stats['failedOther']} failed + {stopped} stopped manually, {len(names)} columns"); sys.exit(0)
open(OUT, "w", encoding="utf-8", newline="\n").write(text)
print(json.dumps(stats))
