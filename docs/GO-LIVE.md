# Going live on the web — the one page

Written 2026-09-26/27 while you were flying. About ten minutes, once. Every
command block says which shell it runs in on its first line, and contains
commands only.

**What you need:** the file `radio-tower.bundle` (it is attached in the Claude
conversation where this was built, and a copy is in
`Radio Tower\Claude outputs\cloud-transfer\` if your laptop was online when
it was written); a GitHub account; Git for Windows (already installed in
`Documents\Ortis\Git`).

The bundle *is* the repository: every file and the full history.

**Want to click through it first?** A private copy is already on claude.ai as
the artifact **"Globe Trotter"** (your artifacts gallery). Everything works
there, including the DJ booth, except the music: claude.ai cannot reach Wix,
so each track plays a test tone of the same length. Only you can open it
until you share it; people you share it with as *Contributor* can use the
booth, *Viewers* can listen and watch.

---

## 1. Create an empty repository on GitHub

github.com → **New repository**

- Name: `radio-tower` (any name works; the site's address follows it)
- **Public** — GitHub Pages is free for public repositories
- **Do not** add a README, .gitignore or licence (the bundle has them)

Create it and copy its URL, e.g. `https://github.com/YOUR-NAME/radio-tower.git`.

> Public means everything in the repository is readable by anyone: the code,
> the docs (they describe your Pi and home-network setup in places), the
> portfolio's photos and essays, the texts. They were all prepared to be
> published — scanned on 2026-09-26: no keys, no student IDs, no emails in the
> PDFs, no GPS in the photos — but it is your call. Step 5 lists the three
> things to look at before you share the link.

## 2. Push

RUN THIS IN: Windows PowerShell on the laptop.

```powershell
cd "$env:USERPROFILE\Documents\Ortis"
git clone "$env:USERPROFILE\Downloads\radio-tower.bundle" radio-tower-git
cd radio-tower-git
git remote set-url origin https://github.com/YOUR-NAME/radio-tower.git
git push -u origin main
```

Change the bundle path if you saved it elsewhere, and `YOUR-NAME`. The first
push opens a browser window to sign in to GitHub — that is Git Credential
Manager, part of Git for Windows.

(The same thing as a script: `scripts\publish-to-github.ps1 -Bundle … -RepoUrl …`.)

## 3. Turn on Pages

In the repository on github.com:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Actions → pages → Run workflow** (the push already started it, but it
   fails until step 1 is done — just run it again).

Two minutes later the site is at **`https://YOUR-NAME.github.io/radio-tower/`**.
The **self-test** workflow also runs on every push; a green tick means the
tower is sound.

## 4. Check it plays

Open the address on your phone, press **Tune in**.

- If you hear music: the station is live. Open it on a second device — both
  play the same second.
- On your iPhone, two things only a real phone can prove: flip the **silent
  switch on** — the music must keep playing — then **lock the screen** for a
  minute — it must still be playing when you unlock. If either stops it, say
  so in the next Claude session: the fix is known (`docs/WORKLOG.md`,
  2026-09-26 shift 5).
- If it stays silent: open it on the laptop, press F12 → Console. A red line
  about `static.wixstatic.com` means Wix refused the audio; see
  "If something is wrong" below. This is the one thing that could not be
  tested from the cloud (the build container cannot reach Wix).

## 5. Before you send the link to anyone

1. **The Atlas** — `site/data/places.json`. Most entries still say
   *à confirmer* (Maputo lists the embassy's press service and the CIP study;
   Amsterdam lists GUT). Edit, delete, or add; `status: "verified"` hides the
   tag.
2. **Where the tower broadcasts from** — `site/config.json` →
   `station.origin` (Maputo today; Amsterdam from 5 October?).
3. **The bio** — the header says "par Zoneko" and nothing more.

Edit on github.com (pencil icon on the file) → Commit. The site redeploys
itself.

The picture that appears when you paste the link into WhatsApp or Instagram
(`site/assets/share-card.jpg`) is drawn from the same places and origin. After
changing them, ask the next Claude session to "re-draw the share card" — one
command, `node scripts/site-card.mjs`.

## 6. Give the DJ booth its key

The booth saves your reorders by committing `site/station/control.json` to
the repository, so it needs a token that can write to *this repository only*:

github.com → your avatar → **Settings → Developer settings → Personal access
tokens → Fine-grained tokens → Generate new token**

- Repository access: **Only select repositories → radio-tower**
- Permissions → Repository permissions → **Contents: Read and write**
- Expiration: 90 days is fine

Copy it, open `https://YOUR-NAME.github.io/radio-tower/booth`, paste, **Save
in this browser**. It stays in that browser only and is sent to nobody but
api.github.com. Then move a track with the arrow keys: every listener picks
the change up within about a minute.

---

## If something is wrong

| Symptom | Why | Fix |
|---|---|---|
| `pages` workflow: "Get Pages site failed" | Pages not switched on | Step 3.1, then re-run |
| Site loads, no sound, console mentions wixstatic | Wix refusing cross-site audio, or the monthly bandwidth is used up | Wix dashboard → Media: check usage. Then see "Bandwidth" |
| Booth says "GitHub refused the token" | Token lacks Contents: write, or is for another repo | Make a new one, step 6 |
| Booth says the repository is read-only | Opened from a copy with no repository configured | Use the github.io address, or `?control=local` to try it on one machine |
| Visuals too much / too little | — | <kbd>V</kbd> on any page. The booth's "Broadcast look" sets everyone's default |

## Bandwidth — the number to watch

The 28 tracks stream from your Wix media. The free Wix plan allows **1 GB a
month**, roughly **14 hours of listening for all visitors together**. Enough to
show people; not enough for a station left running. The fix is a data change,
not a code change: every track in `site/station/library.json` can list several
`sources`, tried in order. The cheapest home for the audio is **Cloudflare R2**
(10 GB free, no charge for listening). That needs your Cloudflare account;
`docs/CLOUD.md` §4.

## Your own domain (optional)

Settings → Pages → Custom domain. The workflow reads the new address and the
site moves to the root of your domain on its own.

## The Pi

Nothing here replaced it. When you have the Pi on a network again,
`docs/PICK-UP-AGAIN.md` still applies, and the new site can play the Pi's whole
library: add the Pi's public address to `site/config.json` → `tower.allowed`
(e.g. `["https://radio.example.com"]`), then open
`https://YOUR-NAME.github.io/radio-tower/radio?tower=https://radio.example.com`.
The list is there so nobody can send you a link that dresses a stranger's
server up as your station.
