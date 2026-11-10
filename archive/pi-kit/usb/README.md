# usb/

The kit for rebuilding the Radio Tower USB stick so it carries exactly the
curated library — and nothing else that `pi/install.sh` could mistake for one.

| | |
|---|---|
| `rebuild-usb.ps1` | the script. Dry run by default, refuses to purge without a verified archive |
| `manifests/` | a dated CSV of everything on the stick, written on every run |

**The plan, the reasoning, and the paste-ready Claude Code prompt live in
[`docs/guides/USB-CLEANUP.md`](../docs/guides/USB-CLEANUP.md).** Read that first.

Quick version:

```powershell
cd "C:\Users\barri\Documents\Ortis\Radio Tower\usb"
.\rebuild-usb.ps1                                                # report only
.\rebuild-usb.ps1 -Archive D:\RadioTowerArchive -Apply           # copy, no deletes
.\rebuild-usb.ps1 -Archive D:\RadioTowerArchive -Apply -Purge    # and remove strays
```

**Not yet run against the real stick** — it was not plugged in when this was
written. Treat the first dry run as the test.
