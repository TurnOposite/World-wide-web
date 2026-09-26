---
description: Add, remove or fix what the Library, Photos and Crates rooms show — shortlist first, privacy-scrub, then publish via collections/collection.json.
---

Use the `tower-curator` agent for this. Follow the `tower-curate` skill.

What to curate: $ARGUMENTS

1. Shortlist and show Ortis before anything is published: a contact sheet for
   photos, title + class for essays.
2. After he approves: build the web copies (redact IDs, strip EXIF), stage them
   in `collections/_incoming/`, move them into place, and edit
   `collections/collection.json`.
3. `npm run collections`, `node --test tests/collections.test.js`, then
   `bash scripts/build-test.sh`.
4. Append to `docs/WORKLOG.md`. Report per room: published / held back and why.
