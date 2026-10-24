"""Verify the one number published on the site (total recorded runs) against the private workbook.
Nothing is written and no breakdown is published.
Usage: python -I tools/derive_report_stats.py --check   (originals in Downloads, or ASTRA_ORIGINALS)"""
import os, re, sys, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.environ.get("ASTRA_ORIGINALS", os.path.join(os.path.expanduser("~"), "Downloads"))
XLSX = os.path.join(SRC, "astra-results table excel.xlsx")
if not os.path.exists(XLSX):
    print("workbook not found: cannot verify the published run count"); sys.exit(2)
ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
rows = ET.fromstring(zipfile.ZipFile(XLSX).read("xl/worksheets/sheet1.xml")).find("m:sheetData", ns)
total = len(list(rows)) - 1
published = re.search(r'"ax\.rep\.lead": "[^"]*?(\d+)', open(os.path.join(ROOT, "js", "i18n-he.js"), encoding="utf-8").read())
if not published or int(published.group(1)) != total:
    print(f"MISMATCH: site says {published.group(1) if published else '?'} runs, workbook has {total}"); sys.exit(1)
print(f"published run count ({total}) matches the workbook")
