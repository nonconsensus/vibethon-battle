# Publishing the Vibethon Battle skill

Two distribution channels, both from the **same skill folder** (this directory):

1. **ClawHub** — so agents install by name: `openclaw skills install @vibethon/vibethon-battle`
2. **vibethon.ai/SKILL.md** — a single hosted file behind a "Play with your agent"
   button, for a zero-registry copy/paste path.

The folder is already ClawHub-shaped: `SKILL.md` has the required frontmatter
(`name`, `description`, `version`, `metadata.openclaw`), with `vibethon.mjs`,
`soul.md`, `memory.md`, `steer.txt`, and `references/` as supporting files.

---

## A. Publish to ClawHub (you run these — needs your GitHub identity)

ClawHub auth is GitHub OAuth; publishing under an **org** needs an org publisher
claim. I can't create accounts as you, so these steps are yours — they're exact.

### 1. Install the publisher CLI
```bash
npm i -g clawhub
clawhub --version
```

### 2. Log in (GitHub OAuth)
```bash
clawhub login           # opens a browser; use `clawhub login --device` if headless
clawhub whoami          # confirm you're authenticated
```
Note: GitHub accounts must be at least ~1 week old to publish.

### 3. Claim the `vibethon` org namespace (one-time)
Org/namespace publishing requires a claim. From the ClawHub site or repo, open the
**"Org / Namespace Claim"** GitHub issue template for `clawhub` and provide the
public proof it asks for (e.g. that you control the vibethon.ai domain / the
GitHub org). Once the claim is approved, your token has publisher access to
`@vibethon`. Verify with:
```bash
clawhub whoami          # should list vibethon among your publishers
```
If you'd rather ship first and namespace later, you can publish under your personal
handle now (skip `--owner`) and migrate to `@vibethon` after the claim.

### 4. Publish
From this folder:
```bash
clawhub skill publish . \
  --slug vibethon-battle \
  --name "Vibethon Battle" \
  --owner vibethon \
  --dry-run            # preview first; remove to publish for real
```
- Drop `--owner vibethon` to publish under your personal handle instead.
- First publish is `1.0.0` (matches our frontmatter); later edits auto-bump the
  patch version, or pass `--version`.
- Publishing runs automated security/moderation scans (it cross-checks the env/bins
  declared in `metadata.openclaw` against what the code references — ours declares
  `node` + the `VIBETHON_*` vars, which is accurate).

### 5. Confirm install works
```bash
openclaw skills install @vibethon/vibethon-battle
# resolves latest → extracts into <workdir>/skills/vibethon-battle
```

After this, the agent instruction becomes simply:
> "Install `@vibethon/vibethon-battle`, then join Vibethon room CODE and play."

---

## B. Host at vibethon.ai/SKILL.md (in this repo)

`bundle/SKILL.md` is a **self-contained** single file: instructions + the full
client embedded, so an agent can bootstrap with no registry. `build-bundle.mjs`
copies it to `sparky/public/SKILL.md`, which the app serves at `/SKILL.md` via the
existing static-file handler (Vite copies `public/` into `dist/` on build — no
server route needed). It's linked from the new "Play with your agent" button in the
battle lobby.

To update the hosted copy after changing the skill, regenerate the bundle:
```bash
node scripts/build-bundle.mjs      # writes bundle/SKILL.md from the live files
```
Then deploy the Vibethon app as usual.

---

## License

ClawHub skills publish under **MIT-0** (free to use/modify/redistribute, no
attribution required). Keep that in mind for anything proprietary you might add to
soul.md — personal persona files are local and never published.
