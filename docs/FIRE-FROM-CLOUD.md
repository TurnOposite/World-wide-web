# Fire from the cloud

**What it is.** `.github/workflows/fire.yml`: when the self-test passes on
`main`, GitHub connects to the tower and runs its updater at once. A push from
anywhere — Claude Code on the web, a cloud agent, the phone — then reaches the
site (Vercel) *and* the tower within minutes, with the laptop off. Without
it, the tower still takes `main` every night at about 04:20 UTC.

**State on 2026-11-16: built, not switched on.** It needs a key only Ortis
should make. Until the secret exists every run says « No TOWER_DEPLOY_KEY
secret yet » and ends green; nothing is sent to the tower.

The laptop is then needed only for the music (the files are there), reading
his folders, and his Chrome.

## Why it is safe to leave on

- **The key can do one thing.** On the tower its line starts with
  `restrict,command="sudo /usr/local/bin/radio-tower-update"`: whoever holds
  it — GitHub, or a thief — can make the tower run its own updater, and
  nothing else. No shell, no file copy, no forwarding.
- **The updater decides, not GitHub.** It only takes a commit whose self-test
  passed, and puts the previous one back if the new one does not answer
  (`deploy/cloud/update.sh`). The worst a stolen key does is ask the tower to
  update to what it would take tonight anyway.
- **It is a different key from the laptop's.** `~\.ssh\radio-tower` (full
  access) never leaves the laptop and is not what goes to GitHub.
- **The tower's identity is pinned** in the workflow (its public host key):
  the run will not send anything to a machine that is not the tower.
- **Only a push to `main` of this repository** sets it off; a pull request or
  a fork cannot.

## Switching it on (about ten minutes, once)

**1. Make the key pair.** PowerShell on the laptop:

```powershell
ssh-keygen -t ed25519 -N '""' -C github-fire -f "$env:USERPROFILE\.ssh\radio-tower-github"
```

**2. Show its public half, and copy the whole line** (it starts with
`ssh-ed25519`). PowerShell on the laptop:

```powershell
Get-Content "$env:USERPROFILE\.ssh\radio-tower-github.pub"
```

**3. Give it to the tower, restricted.** PowerShell on the laptop:

```powershell
ssh -i $env:USERPROFILE\.ssh\radio-tower ubuntu@129.151.227.129
```

then, bash on the tower — replace `PASTE-THE-LINE` with what you copied, and
keep the single quotes:

```bash
echo 'restrict,command="sudo /usr/local/bin/radio-tower-update" PASTE-THE-LINE' >> ~/.ssh/authorized_keys
```

```bash
exit
```

**4. Check the restriction before trusting it.** PowerShell on the laptop —
this asks for a shell command and must **not** get one: the tower should
answer with its updater's line (« already up to date … ») and never with
`uid=`:

```powershell
ssh -i "$env:USERPROFILE\.ssh\radio-tower-github" -o IdentitiesOnly=yes ubuntu@129.151.227.129 id
```

**5. Give GitHub the private half.** In Chrome:
github.com/TurnOposite/World-wide-web → Settings → Secrets and variables →
Actions → New repository secret. Name: `TOWER_DEPLOY_KEY`. Value: the whole
content of the file `radio-tower-github` (no `.pub`), from
`-----BEGIN OPENSSH PRIVATE KEY-----` to `-----END OPENSSH PRIVATE KEY-----`.
To put it on the clipboard without it appearing on screen, PowerShell on the
laptop:

```powershell
Get-Content -Raw "$env:USERPROFILE\.ssh\radio-tower-github" | Set-Clipboard
```

The private half is a secret: it goes into that GitHub box and nowhere else —
not a chat, not a document, not the repository.

**6. Try it.** GitHub → Actions → **fire** → Run workflow. The run's page
shows the updater's lines and « The tower is on air on … ».

## Switching it off

Delete the secret on GitHub (the runs go back to « nothing sent »), and remove
the `github-fire` line from `~/.ssh/authorized_keys` on the tower.

## If the tower moves

A new server has a new address and a new host key: change `TOWER_SSH`,
`TOWER_URL` and `TOWER_HOST_KEY` at the top of `fire.yml` together with
`deploy/fire.json` and `site/config.json` (a test fails if the workflow and
`fire.json` disagree), and repeat step 3 on the new server. The host key is
what this prints, PowerShell on the laptop:

```powershell
ssh-keyscan -t ed25519 129.151.227.129
```

## Reading a failed run

- « Permission denied (publickey) » — the secret is not the private half of
  the key in step 3, or the line was not added.
- « Host key verification failed » — the server was reinstalled: see above.
- « not updating to …: its self-test is pending » — the updater asked GitHub
  a moment too early; run **fire** again, or leave it to the night.
- « did not come up — going back to … » — the commit does not start on the
  tower; the previous one is back on air. Fix it with a new commit.
