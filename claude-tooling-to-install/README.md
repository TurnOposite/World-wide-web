# New agents, skills and commands — copy these into `.claude\` yourself

Claude isn't allowed to write into a project's `.claude\` folder from Cowork
(it's a protected location, deliberately), so the new tooling from
2026-09-23 is parked here for you to install yourself — three copy commands.

RUN THIS IN: Windows PowerShell, on the laptop.

```powershell
cd "C:\Users\barri\Documents\Ortis\Radio Tower"
Copy-Item -Force .\claude-tooling-to-install\agents\*.md   .\.claude\agents\
Copy-Item -Force .\claude-tooling-to-install\commands\*.md .\.claude\commands\
Copy-Item -Recurse -Force .\claude-tooling-to-install\skills\* .\.claude\skills\
```

What arrives:

| Kind | Name | Use |
|---|---|---|
| Agent | `tower-roamer` | keeps the tower online anywhere — `pi/anywhere/`, `pi/wifi/` |
| Agent | `tower-curator` | what the Library / Photos / Crates rooms publish, safely — `collections/` |
| Skill | `tower-anywhere` | the go-anywhere kit's boot order, invariants, status file |
| Skill | `tower-curate` | the publishing pipeline and privacy rules |
| Command | `/tower-online` | is the tower ready to come online anywhere? |
| Command | `/tower-curate` | add / remove / fix what a room shows |

Nothing here overwrites an existing agent — they are all new names. Once
copied, this folder can be moved to `_to_delete\`.
