"""Export the Labels tab of Arthur's label sheet to JSON, for scripts/streams-from-sheet.mjs. Needs openpyxl.
Usage: python -I scripts/sheet-to-json.py <the .xlsx> sheet.json"""
import openpyxl, sys, json, io, warnings
warnings.simplefilter('ignore')
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
rows = list(wb['Labels'].iter_rows(values_only=True))
data = [dict(zip(rows[0], r)) for r in rows[1:] if any(c is not None for c in r)]
with io.open(sys.argv[2], 'w', encoding='utf8') as out:
    json.dump({'rows': data}, out, ensure_ascii=False, default=str)
print(len(data), 'rows')
