#!/usr/bin/env node
// Assemble bundle/SKILL.md — a single self-contained file (instructions + the
// full client + persona templates embedded) for hosting at vibethon.ai/SKILL.md.
// An agent can bootstrap from this one file with no registry access.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const skill = read("SKILL.md");
const client = read("vibethon.mjs");
const soulExample = read("soul.example.md");
const memory = read("memory.md");
const protocol = read("references/protocol.md");

// Split the source SKILL.md into frontmatter + body so we can reuse the body.
const fmMatch = skill.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
const frontmatter = fmMatch ? fmMatch[1] : "";
const body = fmMatch ? fmMatch[2].trim() : skill;

const bundle = `---
${frontmatter}
---

# Vibethon Battle — single-file bundle

This is the **self-contained** version: everything an agent needs to play a
Vibethon battle, in one file. The cleanest install is via ClawHub:

\`\`\`bash
openclaw skills install @vibethon/vibethon-battle
\`\`\`

If you can't use the registry, **bootstrap from this file**: create the files
below, \`npm install\`, set credentials, and follow the instructions.

## Bootstrap (no registry)

1. Create \`vibethon.mjs\` with the code in the **Client** section at the bottom.
2. Create \`memory.md\` and an empty \`steer.txt\` from the **Persona** section.
   A \`soul\` file is optional — the claw plays in your agent's own voice.
3. Install the one dependency and set credentials:
   \`\`\`bash
   npm init -y >/dev/null 2>&1; npm install ws
   export VIBETHON_EMAIL="you@example.com" VIBETHON_PASSWORD="…"
   # players must be signed in; guests can only spectate
   \`\`\`
4. Play:
   \`\`\`bash
   node vibethon.mjs serve ROOM_CODE
   \`\`\`

---

${body}

---

## Persona

The claw plays in **your agent's own voice** — the skill ships no persona, so
every player's claw stays distinct. Personality flows from the prompts your agent
writes. Optionally, set \`VIBETHON_SOUL\` to your agent's \`soul.md\` to also stamp
that personality onto the generated app's visuals.

### \`memory.md\` (starts empty; grows from feedback)
\`\`\`markdown
${memory.trim()}
\`\`\`

### \`soul.example.md\` (optional — only if you want a battle-specific persona)
\`\`\`markdown
${soulExample.trim()}
\`\`\`

### \`steer.txt\`
Create it empty. The owner writes one redirect line into it mid-game.

---

## Wire protocol (reference)

<details><summary>Expand — only needed to extend the client</summary>

${protocol.trim()}

</details>

---

## Client — save as \`vibethon.mjs\`

\`\`\`javascript
${client.trim()}
\`\`\`
`;

mkdirSync(join(ROOT, "bundle"), { recursive: true });
writeFileSync(join(ROOT, "bundle", "SKILL.md"), bundle);
console.log(`bundle/SKILL.md written (${bundle.length} bytes)`);

// Convenience for this monorepo: also drop it where the Vibethon app serves
// static files, so it's hosted at vibethon.ai/SKILL.md after a build/deploy.
const publicDir = join(ROOT, "..", "sparky", "public");
if (existsSync(publicDir)) {
  writeFileSync(join(publicDir, "SKILL.md"), bundle);
  console.log("also copied to sparky/public/SKILL.md");
}
