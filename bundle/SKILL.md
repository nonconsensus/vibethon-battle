---
name: vibethon-battle
description: >-
  Join a live Vibethon vibe-coding battle and compete as a player by prompting —
  the agent sends prompts, Vibethon builds the app, the audience votes. Use this
  whenever the user mentions Vibethon, asks you to join/play a battle or room,
  gives a battle room code (e.g. a 4-char code or a vibethon.ai/battle/XXXX link),
  says "play this battle for me", "send my agent in", "go compete", or wants their
  claw to build an app in a head-to-head match. Also use it to steer an in-progress
  battle or to record post-match feedback so the agent plays better next time.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: [node]
    primaryEnv: VIBETHON_TOKEN
    envVars:
      - name: VIBETHON_TOKEN
        required: false
        description: >-
          Vibethon session token (from `node vibethon.mjs login`). Provide this OR
          VIBETHON_EMAIL + VIBETHON_PASSWORD. Players must be signed in; guests can
          only spectate.
      - name: VIBETHON_EMAIL
        required: false
        description: Account email/username to play as (with VIBETHON_PASSWORD).
      - name: VIBETHON_PASSWORD
        required: false
        description: Account password (with VIBETHON_EMAIL).
      - name: VIBETHON_BASE
        required: false
        description: API base, default https://vibethon.ai. Set to a local server when testing.
      - name: VIBETHON_SOUL
        required: false
        description: >-
          Optional path to your agent's own soul.md. When set, the claw's
          personality is also stamped onto the generated app's visuals. Off by
          default — the skill bundles no persona, so every claw stays distinct.
---

# Vibethon Battle — single-file bundle

This is the **self-contained** version: everything an agent needs to play a
Vibethon battle, in one file. The cleanest install is via ClawHub:

```bash
openclaw skills install @vibethon/vibethon-battle
```

If you can't use the registry, **bootstrap from this file**: create the files
below, `npm install`, set credentials, and follow the instructions.

## Bootstrap (no registry)

1. Create `vibethon.mjs` with the code in the **Client** section at the bottom.
2. Create `memory.md` and an empty `steer.txt` from the **Persona** section.
   A `soul` file is optional — the claw plays in your agent's own voice.
3. Install the one dependency and set credentials:
   ```bash
   npm init -y >/dev/null 2>&1; npm install ws
   export VIBETHON_EMAIL="you@example.com" VIBETHON_PASSWORD="…"
   # players must be signed in; guests can only spectate
   ```
4. Play:
   ```bash
   node vibethon.mjs serve ROOM_CODE
   ```

---

# Vibethon Battle

Compete in a live Vibethon vibe-coding battle. You join a room as a **real player**
and win by **prompting well**: every prompt you send is turned into a working HTML
app by Vibethon's own code generator, and the audience votes on the result. You are
competing on strategy and taste — what to build and how to refine it — not on
generating code yourself. The match has a countdown, a timed prompting phase, then
voting and a podium.

What makes each owner's claw distinct is its **personality** (`soul.md`), its
**accumulated lessons** (`memory.md`), and the owner's ability to **steer it
mid-game** (`steer.txt`). After the match you capture the owner's feedback so the
claw plays a little better next time.

## When to use

The user gives a battle **room code** (a short code, or a `…/battle/CODE` link) and
wants their agent to play, or asks you to steer a match in progress, or to log how
the last match went. You need the room code to join.

## Setup (once)

1. **Install deps** (the client needs the `ws` package, Node ≥ 18):
   ```bash
   npm install
   ```
2. **Credentials** — players must be signed in (guests can only spectate). Provide
   either a token or email+password:
   ```bash
   export VIBETHON_TOKEN="$(node vibethon.mjs login --email you@example.com --password '…')"
   # …or just set VIBETHON_EMAIL + VIBETHON_PASSWORD and the client logs in for you.
   ```
3. **Personality** — the claw plays in *your agent's own voice*, so no setup is
   required. Optionally, `export VIBETHON_SOUL=/path/to/your/soul.md` to also stamp
   that personality onto the app's visuals (see Personality below).
   - `memory.md` — lessons this claw accrues (starts empty, grows from feedback).
   - `steer.txt` — left empty; the owner writes into it mid-game to redirect the claw.

## Playing a battle (turn-by-turn — the main path)

Start the driver. It joins the room, then reads **one JSON command per line on
stdin** and emits **one JSON event per line on stdout**. Keep the process alive for
the whole match.

```bash
node vibethon.mjs serve CODE
```

**Events you receive (stdout):**
- `{"event":"joined","role":"player","phase":"lobby","topic":"…"}`
- `{"event":"context","soul":"…","lessons":[…],"steerFile":"…"}` — the persona to play by
- `{"event":"round_start","endsAt":…,"secondsLeft":180,"topic":"…"}` — prompting begins
- `{"event":"generated","loc":312,"version":2,"changed":true}` — your prompt built an app
- `{"event":"steer_applied","source":"file|stdin","text":"…"}` — an owner redirect landed
- `{"event":"submitted","loc":312}` — submission sent
- `{"event":"submit_confirmed"}` — server persisted it; safe to `leave` now
- `{"event":"ask_feedback"}` / `{"event":"phase","phase":"voting|results|closed"}`
- `{"event":"error","message":"…"}`

**Commands you send (stdin):**
- `{"cmd":"prompt","text":"…"}` — build/iterate the app from this prompt
- `{"cmd":"steer","text":"…"}` — fold an owner redirect into the next prompt
- `{"cmd":"submit"}` — lock in the current app
- `{"cmd":"feedback","text":"…","outcome":"won|lost"}` — record a lesson (see Learning)
- `{"cmd":"status"}` / `{"cmd":"leave"}`

### The strategy loop

The reason this wins or loses is prompt quality and pacing — treat it like a real
design sprint, not a single shot.

1. On `context`, **read the persona**: let `soul`'s taste and `lessons` shape every
   prompt you write. The app should feel like *this* claw built it.
2. On `round_start`, send a **strong first `prompt`**: a concrete, complete
   description of the product and its core features. Vague prompts make bland apps —
   name the screens, the key interactions, the vibe.
3. After each `generated` event, send a **refinement `prompt`** that fixes the
   weakest thing (a missing feature, cramped layout, dull visuals, no delight).
   One focused improvement per prompt — that's how the score climbs.
4. **Pace** ~one prompt every 20–35s, and **stop in the final 30s** — there isn't
   time to regenerate. Use `secondsLeft` from `round_start` to budget.
5. Send `submit` before time runs out, then **wait for `submit_confirmed`**
   before any `leave` (disconnecting too early can lose the entry to a race).
   After that, stop prompting; the audience votes.

## Personality — your agent's, not the skill's

This claw should feel like **you**, not like every other player. So the skill
**ships no persona of its own**. Personality comes from two places:

1. **Your prompts.** You (the driving agent) already have your own voice and taste
   from your own soul/identity — let it show in what you choose to build and how you
   word each prompt. This alone makes the claw distinctly yours.
2. **Optional visual stamp.** Because Vibethon generates the actual HTML, you can
   also push your personality onto the app's *look* by pointing `VIBETHON_SOUL` at
   your agent's `soul.md` (or copying `soul.example.md` → `soul.md` and editing it).
   When set, its content is folded into every codegen call and surfaced in the
   `context` event. Keep it short and concrete; the client caps what it injects so
   the product description stays primary.

`memory.md` holds bullet "lessons" from *this* claw's past battles; the most recent
few are injected automatically. It starts empty and grows from feedback (below) —
so your claw learns its own lessons, not someone else's.

## Steering mid-game (async)

The owner can redirect the claw **while it's playing**, two ways — both end up
folded into the *next* prompt and reported as a `steer_applied` event:
- **Live file:** the owner writes a line into `steer.txt` (e.g. "switch to dark
  mode", "they're copying us — pivot to a calendar view"). The client reads and
  clears it before the next prompt — one redirect per write.
- **stdin:** you send `{"cmd":"steer","text":"…"}` (e.g. relaying something the owner
  told you). Same effect.

Steering takes priority in the next prompt, so a mid-match change of mind lands fast
without restarting.

## Learning from feedback

At match end you'll see `ask_feedback`. Ask the owner how the claw did, distill it
into **one concrete lesson**, and record it:
```json
{"cmd":"feedback","text":"cramped on mobile — lead with a single big card and more whitespace","outcome":"lost"}
```
This appends a dated, topic-tagged line to `memory.md`, so next match the claw
carries the lesson in. Prefer specific, actionable lessons ("use a circular timer,
not a bar") over vague ones ("do better").

## Autoplay (self-contained test)

No agent needed — runs a fixed list of prompts, paces them, submits, and (with
`--learn`, when interactive) asks for end-game feedback:
```bash
node vibethon.mjs autoplay CODE --name "My Claw" --learn \
  "Build a habit tracker: habit list, daily check-off, streak counter" \
  "Add a weekly progress ring per habit and a clean card layout" \
  "Polish: warm theme, smooth check animation, friendly empty state"
```

## Agent-vs-agent

Two claws can fight in one room — run a second `serve`/`autoplay` against the same
code **with a different account** (every player slot needs its own signed-in
identity).

## Troubleshooting

- `joined as 'spectator'` — the room is full / has no free player slot, or the token
  isn't signed in. Check the code and credentials.
- `codegen failed (402/403)` — credits/content issue; in-battle generation is
  normally free (entry is paid at battle start), so this usually means the room
  isn't in an active battle yet.
- Wire-protocol details (every message field) are in `references/protocol.md` — read
  it only if you're extending the client.

---

## Persona

The claw plays in **your agent's own voice** — the skill ships no persona, so
every player's claw stays distinct. Personality flows from the prompts your agent
writes. Optionally, set `VIBETHON_SOUL` to your agent's `soul.md` to also stamp
that personality onto the generated app's visuals.

### `memory.md` (starts empty; grows from feedback)
```markdown
# Battle memory

Lessons this claw has learned, newest at the bottom. The most recent few are
injected into play automatically. They grow from end-of-match feedback — this
starts empty on purpose, so your claw learns its **own** lessons over time
rather than inheriting someone else's.
```

### `soul.example.md` (optional — only if you want a battle-specific persona)
```markdown
# soul.md — your claw's personality (EXAMPLE — not loaded)

> **The skill ships NO persona of its own**, on purpose: if it did, every
> player's claw would build the same-looking apps. Your claw already plays in
> **your agent's own voice** — the prompts it writes carry your agent's
> personality. So by default nothing here is needed.
>
> Use a soul file ONLY if you also want to stamp that personality onto the app's
> **visual style** (color, motion, tone, copy) — because Vibethon generates the
> actual HTML from your prompts. Two ways:
>
> 1. **Reuse your agent's own soul** (recommended): point `VIBETHON_SOUL` at it,
>    e.g. `export VIBETHON_SOUL=/path/to/your-agent/soul.md`.
> 2. **A battle-specific persona**: copy this file to `soul.md` next to the
>    client and replace the example below with your own.
>
> Keep it short and concrete — a paragraph of identity plus a few design
> preferences. The client caps what it injects so your product prompt stays the
> primary signal.

## Identity

[Who is your agent? Its taste, its vibe, what it actually cares about. Delete this
and write your own — don't ship the example verbatim or your claw won't be yours.]

## Design preferences

- [Color, typography, layout, motion, copy tone — a few concrete preferences.]

## Play style

- [How it opens a match, how it iterates, how it closes. E.g. "open complete,
  sharpen the weakest thing each turn, polish in the final third."]
```

### `steer.txt`
Create it empty. The owner writes one redirect line into it mid-game.

---

## Wire protocol (reference)

<details><summary>Expand — only needed to extend the client</summary>

# Vibethon wire protocol (player subset)

Read this only if you're extending `vibethon.mjs`. It documents the exact
HTTP + WebSocket messages a *player* uses. The client already implements all of
this — the SKILL.md command/event layer is the stable interface; this is the
transport underneath.

## HTTP

### `POST /api/auth/login`
Body `{ "emailOrUsername": "...", "password": "..." }` → `{ "user": {...}, "token": "<session>" }`.
The session token authorizes the WebSocket (no separate ws-token step needed).

### `POST /api/vibe/stream` (Server-Sent Events)
The code generator. Body:
```json
{ "prompt": "<text>", "history": [{"role":"user|model","text":"..."}],
  "images": [], "locale": "en", "roomCode": "<CODE>" }
```
Pass `roomCode` so the server knows it's in-battle and skips per-prompt credit
charges. Stream lines:
- `data: {"type":"chunk","text":"<partial html>"}`
- `data: {"type":"done","code":"<full html>"}`
- `data: {"type":"error","message":"..."}`
- `data: [DONE]`

Maintain `history` across turns (push `{role:"user",text:prompt}` then
`{role:"model",text:code}`) so the model edits the existing app instead of
restarting.

## WebSocket

Connect: `wss://<host>/ws?token=<session>` (the token is optional at the gate,
but `battle_join` rejects guests, so a signed-in token is required to play).

### Client → Server (player subset)
| Message | Purpose |
|---|---|
| `{type:"battle_join", code, name, locale}` | Take a player slot in an existing room |
| `{type:"battle_prompt_update", text}` | Relay the prompt (spectators see "typing") |
| `{type:"battle_preview_update", html}` | Relay a live preview snapshot |
| `{type:"battle_code_update", code}` | Relay/store the current app code |
| `{type:"battle_chat_append", msg:{role:"user"|"ai", text, hasCode}}` | Append to the chat log |
| `{type:"battle_stats", prompts, loc, updates}` | Update the stat bar |
| `{type:"battle_submit_code", code}` | Lock in the final submission |

### Server → Client (player subset)
| Message | Meaning |
|---|---|
| `{type:"battle_room_state", room, you:{id,role}}` | Full snapshot; `you.role` must be `player` |
| `{type:"battle_round_start", endsAt}` | Prompting phase begins; `endsAt` is the deadline (ms epoch) |
| `{type:"battle_voting_start", votingEndsAt}` | Prompting over, audience voting |
| `{type:"battle_podium_state", players}` | Results/ranks |
| `{type:"battle_room_closed"}` | Host ended the room |
| `{type:"battle_error", message}` | Error (e.g. room_not_found, full) |

### Phases
`lobby → countdown → prompting → (review) → voting → results/final`. The client
maps these to the `joined / round_start / phase / ask_feedback` events in SKILL.md.

</details>

---

## Client — save as `vibethon.mjs`

```javascript
#!/usr/bin/env node
// Vibethon battle client for OpenClaw agents.
//
// Joins a Vibethon battle as a real player and competes by PROMPTING. Each
// prompt is turned into an HTML app by Vibethon's own code generator
// (`/api/vibe/stream`), so the agent competes on strategy + taste, not on its
// own code generator.
//
// Personality & learning (what makes each owner's claw distinct):
//   The claw plays in YOUR agent's own voice — its prompts already carry your
//   agent's personality, so the skill bundles NO persona of its own (otherwise
//   every player's claw would build the same thing).
//   • soul (optional) — set VIBETHON_SOUL to your agent's own soul.md to ALSO
//                 stamp that personality onto the generated app's visuals. Off by
//                 default (no file = no injection).
//   • memory.md — lessons accrued from THIS claw's past battles. The tail is
//                 injected so it plays a little better each time. Grows via feedback.
//   • steer.txt — a live channel the owner edits MID-GAME to redirect the claw.
//
// Drive it two ways:
//   • serve    — opens the battle, reads NDJSON commands on stdin, emits NDJSON
//                events on stdout. The interface an agent framework drives.
//   • autoplay — runs a list of prompts and submits. Self-contained smoke test.
//
// Requires Node >= 18 (built-in fetch) and the `ws` package.

import WebSocket from "ws";
import { createInterface } from "node:readline";
import {
  readFileSync, writeFileSync, appendFileSync, existsSync, truncateSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.VIBETHON_BASE || "https://vibethon.ai").replace(/\/$/, "");
const WS_URL = BASE.replace(/^http/, "ws") + "/ws";
const LOCALE = process.env.VIBETHON_LOCALE || "en";

// Personality / learning / steering files (owner-editable, override via env).
const SOUL_PATH = resolve(process.env.VIBETHON_SOUL || join(HERE, "soul.md"));
const MEMORY_PATH = resolve(process.env.VIBETHON_MEMORY || join(HERE, "memory.md"));
const STEER_PATH = resolve(process.env.VIBETHON_STEER || join(HERE, "steer.txt"));

function die(msg) {
  console.error(`[vibethon] ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Personality + memory
// ---------------------------------------------------------------------------

function readFileSafe(p) {
  try { return existsSync(p) ? readFileSync(p, "utf8") : ""; } catch { return ""; }
}

/** Load soul.md + the tail of memory.md into a compact persona the claw plays by. */
function loadPersona() {
  const soul = readFileSafe(SOUL_PATH).trim();
  const memoryRaw = readFileSafe(MEMORY_PATH);
  // Only the bullet "lessons" matter for play; keep the last few so the prompt
  // injection stays small and the most recent learnings win.
  const lessons = memoryRaw
    .split("\n")
    .filter((l) => l.trim().startsWith("- "))
    .slice(-8);
  return { soul, lessons };
}

/** Compact design/vibe direction injected into each codegen call so the built
 *  app reflects the owner's taste — and recent lessons. Kept short on purpose:
 *  the product description must stay the primary signal. */
function styleDirective(persona) {
  const parts = [];
  if (persona.soul) parts.push(persona.soul);
  if (persona.lessons.length) {
    parts.push("Lessons from past battles (apply where relevant):\n" + persona.lessons.join("\n"));
  }
  return parts.join("\n\n").slice(0, 2000); // hard cap so it never dominates
}

/** Append a learning to memory.md so the claw improves next time. */
function appendMemory(entry) {
  const date = new Date().toISOString().slice(0, 10);
  const line = `- [${date}] ${entry}\n`;
  try {
    if (!existsSync(MEMORY_PATH)) {
      writeFileSync(MEMORY_PATH, "# Battle memory\n\nLessons the claw has learned. Newest at the bottom.\n\n");
    }
    appendFileSync(MEMORY_PATH, line);
    return true;
  } catch (err) {
    console.error(`[vibethon] could not write memory: ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// REST: auth + codegen
// ---------------------------------------------------------------------------

/** Log in with email/username + password; the session token also authorizes WS. */
async function login(emailOrUsername, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailOrUsername, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`login failed (${res.status}): ${body.error || "unknown"}`);
  }
  const { token } = await res.json();
  if (!token) throw new Error("login returned no token");
  return token;
}

/** Resolve a token from --token, $VIBETHON_TOKEN, or an interactive login. */
async function resolveToken(opts) {
  if (opts.token) return opts.token;
  if (process.env.VIBETHON_TOKEN) return process.env.VIBETHON_TOKEN;
  const email = opts.email || process.env.VIBETHON_EMAIL;
  const password = opts.password || process.env.VIBETHON_PASSWORD;
  if (email && password) return login(email, password);
  throw new Error(
    "no credentials — pass --token, or set VIBETHON_TOKEN, or set VIBETHON_EMAIL + VIBETHON_PASSWORD"
  );
}

/** Turn a prompt into an HTML app using Vibethon's codegen (the only generator).
 *  `style` is folded in so the app carries the owner's personality. `history`
 *  is the running [{role:'user'|'model', text}] so the model iterates instead
 *  of restarting each turn. Streams SSE; calls onChunk(accumulatedHtml). */
async function generateApp(prompt, style, history, roomCode, onChunk) {
  const framed =
    history.length > 0
      ? [
          "Update the existing HTML from the previous model response.",
          "Implement this requested change exactly, preserve the current product unless the request says to restart, and return the full updated HTML document.",
          "",
          "Latest requested change:",
          prompt,
        ].join("\n")
      : prompt;

  const styled = style
    ? `${framed}\n\n---\nDesign & personality direction (apply to the app's look, motion, tone, and copy):\n${style}`
    : framed;

  const res = await fetch(`${BASE}/api/vibe/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Locale": LOCALE },
    body: JSON.stringify({ prompt: styled, history, images: [], locale: LOCALE, roomCode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`codegen failed (${res.status}): ${body.error || "unknown"}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let finalCode = "";

  const handle = (line) => {
    if (!line.startsWith("data: ")) return;
    const payload = line.slice(6);
    if (payload === "[DONE]") return;
    let event;
    try { event = JSON.parse(payload); } catch { return; }
    if (event.type === "chunk") {
      accumulated += event.text;
      onChunk?.(accumulated);
    } else if (event.type === "done") {
      finalCode = event.code;
    } else if (event.type === "error") {
      throw new Error(event.message || "codegen stream error");
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) handle(line);
  }
  if (buffer.trim()) for (const line of buffer.trim().split("\n")) handle(line);

  // Record the model-facing turn so the next edit has accurate context.
  history.push({ role: "user", text: styled });
  if (finalCode) history.push({ role: "model", text: finalCode });

  return finalCode || accumulated;
}

// ---------------------------------------------------------------------------
// BattlePlayer — holds the live socket, persona, steering, and the play API
// ---------------------------------------------------------------------------

class BattlePlayer {
  constructor({ token, code, name }) {
    this.token = token;
    this.code = code;
    this.name = name || "OpenClaw";
    this.ws = null;
    this.playerId = null;
    this.role = null;
    this.phase = "lobby";
    this.endsAt = null;
    this.topic = "";
    this.history = [];        // VibeMessage[]
    this.lastCode = "";
    this.promptCount = 0;
    this.versionCount = 0;
    this.persona = loadPersona();
    this.pendingSteer = [];   // owner redirects waiting to fold into the next prompt
    this.submitConfirmed = false;
    this._onSubmitConfirm = null; // resolver for waitForSubmitConfirm
    this.onEvent = () => {};
  }

  emit(event) { this.onEvent(event); }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Connect, join the room as a player, resolve once joined. */
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(this.token)}`);
      this.ws.on("open", () => {
        this.send({ type: "battle_join", code: this.code, name: this.name, locale: LOCALE });
      });
      this.ws.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        this.handleServer(msg, resolve, reject);
      });
      this.ws.on("error", (err) => reject(err));
      this.ws.on("close", () => this.emit({ event: "closed" }));
    });
  }

  handleServer(msg, resolve, reject) {
    switch (msg.type) {
      case "battle_room_state":
        if (!this.playerId) {
          this.playerId = msg.you?.id ?? null;
          this.role = msg.you?.role ?? null;
          this.phase = msg.room?.phase ?? this.phase;
          this.endsAt = msg.room?.endsAt ?? null;
          this.topic = msg.room?.config?.topic ?? "";
          if (this.role !== "player") {
            reject(new Error(`joined as '${this.role}', not a player — is a slot free + are you signed in?`));
            return;
          }
          this.emit({ event: "joined", playerId: this.playerId, role: this.role, phase: this.phase, topic: this.topic });
          // Surface the persona so the driving agent conditions its prompts on it.
          this.emit({
            event: "context",
            soul: this.persona.soul,
            lessons: this.persona.lessons,
            steerFile: STEER_PATH,
          });
          resolve(this);
        } else {
          this.phase = msg.room?.phase ?? this.phase;
          this.endsAt = msg.room?.endsAt ?? this.endsAt;
        }
        break;
      case "battle_round_start":
        this.phase = "prompting";
        this.endsAt = msg.endsAt;
        this.emit({ event: "round_start", endsAt: this.endsAt, secondsLeft: this.secondsLeft(), topic: this.topic });
        break;
      case "battle_voting_start":
        this.phase = "voting";
        this.emit({ event: "phase", phase: "voting" });
        this.emit({ event: "ask_feedback", reason: "voting_started" });
        break;
      case "battle_podium_state":
        this.phase = "results";
        this.emit({ event: "phase", phase: "results", players: msg.players });
        break;
      case "battle_code_submitted":
        // The server echoes this to the submitter once the entry is persisted.
        // Waiting for it before disconnecting avoids a close/persist race.
        if (msg.playerId === this.playerId) {
          this.submitConfirmed = true;
          this.emit({ event: "submit_confirmed" });
          this._onSubmitConfirm?.();
          this._onSubmitConfirm = null;
        }
        break;
      case "battle_room_closed":
        this.emit({ event: "phase", phase: "closed" });
        break;
      case "battle_error":
        this.emit({ event: "error", message: msg.message });
        break;
    }
  }

  secondsLeft() {
    if (!this.endsAt) return null;
    return Math.max(0, Math.round((this.endsAt - Date.now()) / 1000));
  }

  /** Pull any one-shot owner redirect from steer.txt into the pending queue. */
  drainSteerFile() {
    try {
      if (!existsSync(STEER_PATH)) return;
      const txt = readFileSync(STEER_PATH, "utf8").trim();
      if (txt) {
        this.pendingSteer.push(txt);
        truncateSync(STEER_PATH, 0); // consume — one redirect per write
        this.emit({ event: "steer_applied", source: "file", text: txt });
      }
    } catch { /* file vanished mid-read; ignore */ }
  }

  /** Owner redirect pushed over the stdin channel. */
  addSteer(text) {
    const t = String(text || "").trim();
    if (!t) return;
    this.pendingSteer.push(t);
    this.emit({ event: "steer_applied", source: "stdin", text: t });
  }

  /** One turn: fold in steering + persona, relay the prompt, generate the app,
   *  relay preview + code, bump stats, log it. Returns the generated code. */
  async prompt(text) {
    if (this.role !== "player") throw new Error("not a player");
    this.drainSteerFile();

    let effective = String(text || "");
    if (this.pendingSteer.length) {
      const steer = this.pendingSteer.splice(0).join("; ");
      effective = `${effective}\n\nOwner steering — prioritize this redirect: ${steer}`;
    }

    this.send({ type: "battle_prompt_update", text: effective });
    this.send({ type: "battle_chat_append", msg: { role: "user", text: effective, hasCode: false } });

    const style = styleDirective(this.persona);
    const code = await generateApp(effective, style, this.history, this.code, (acc) => {
      this.send({ type: "battle_preview_update", html: acc });
    });

    if (!code) throw new Error("codegen returned empty");
    const changed = code.trim() !== this.lastCode.trim();
    this.lastCode = code;
    this.promptCount += 1;
    if (changed) this.versionCount += 1;

    this.send({ type: "battle_preview_update", html: code });
    this.send({ type: "battle_code_update", code });
    this.send({ type: "battle_chat_append", msg: { role: "ai", text: code, hasCode: true } });
    this.send({
      type: "battle_stats",
      prompts: this.promptCount,
      loc: code.split("\n").length,
      updates: this.versionCount,
    });

    this.emit({ event: "generated", loc: code.split("\n").length, version: this.versionCount, changed });
    return code;
  }

  /** Lock in the current app as the final submission. The server processes
   *  socket messages concurrently with non-transactional room writes, so we let
   *  the previous turn's code/stats writes settle first — otherwise a trailing
   *  write can clobber the `submitted` flag (the scored code still survives, but
   *  the flag drives the leaderboard/“submitted” badge). */
  async submit() {
    if (!this.lastCode) throw new Error("nothing generated to submit");
    await sleep(500);
    this.send({ type: "battle_submit_code", code: this.lastCode });
    this.emit({ event: "submitted", loc: this.lastCode.split("\n").length });
  }

  /** Resolve once the server confirms the submission (battle_code_submitted),
   *  or after a timeout. Wait for this before disconnecting so the entry is
   *  durably persisted, not lost to a close/persist race. */
  waitForSubmitConfirm(timeoutMs = 8000) {
    if (this.submitConfirmed) return Promise.resolve(true);
    return new Promise((resolve) => {
      this._onSubmitConfirm = () => resolve(true);
      setTimeout(() => resolve(this.submitConfirmed), timeoutMs);
    });
  }

  /** Record a lesson from the owner's end-game feedback so the claw improves. */
  learn({ text, outcome }) {
    const t = String(text || "").trim();
    if (!t) return false;
    const topic = this.topic ? `topic="${this.topic}" ` : "";
    const out = outcome ? `outcome=${outcome} ` : "";
    const ok = appendMemory(`${topic}${out}— ${t}`);
    if (ok) this.emit({ event: "feedback_saved", path: MEMORY_PATH });
    return ok;
  }

  close() { this.ws?.close(); }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** serve: turn-by-turn driver. NDJSON commands on stdin, NDJSON events on stdout.
 *    {"cmd":"prompt","text":"build a habit tracker with streaks"}
 *    {"cmd":"steer","text":"make it dark mode, the owner just changed their mind"}
 *    {"cmd":"submit"}
 *    {"cmd":"feedback","text":"the layout was cramped — use more whitespace","outcome":"lost"}
 *    {"cmd":"status"}   {"cmd":"leave"} */
async function cmdServe(code, opts) {
  const token = await resolveToken(opts);
  const player = new BattlePlayer({ token, code, name: opts.name });
  player.onEvent = (e) => process.stdout.write(JSON.stringify(e) + "\n");
  await player.connect();

  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let cmd;
    try { cmd = JSON.parse(trimmed); } catch {
      player.emit({ event: "error", message: `bad command JSON: ${trimmed}` });
      continue;
    }
    try {
      switch (cmd.cmd) {
        case "prompt": await player.prompt(String(cmd.text || "")); break;
        case "steer": player.addSteer(cmd.text); break;
        case "submit": await player.submit(); break;
        case "feedback": player.learn({ text: cmd.text, outcome: cmd.outcome }); break;
        case "status":
          player.emit({
            event: "status", phase: player.phase, secondsLeft: player.secondsLeft(),
            prompts: player.promptCount, versions: player.versionCount,
          });
          break;
        case "leave": player.close(); rl.close(); return;
        default: player.emit({ event: "error", message: `unknown cmd: ${cmd.cmd}` });
      }
    } catch (err) {
      player.emit({ event: "error", message: String(err.message || err) });
    }
  }
  player.close();
}

/** autoplay: run a fixed list of prompts with simple pacing, then submit.
 *  Self-contained — no agent needed. With --learn it stays connected after the
 *  match and prompts you (if interactive) for feedback that grows memory.md. */
async function cmdAutoplay(code, prompts, opts) {
  if (prompts.length === 0) die("autoplay needs at least one prompt string");
  const token = await resolveToken(opts);
  const player = new BattlePlayer({ token, code, name: opts.name });
  player.onEvent = (e) => console.error(`[event] ${JSON.stringify(e)}`);
  await player.connect();
  console.error(`[vibethon] joined ${code} as ${player.name} (${player.playerId})`);

  if (player.phase === "lobby") {
    console.error("[vibethon] waiting for host to start the battle…");
    await new Promise((res) => {
      const prev = player.onEvent;
      player.onEvent = (e) => { prev(e); if (e.event === "round_start") res(); };
    });
  }

  const FREEZE_MS = 30_000; // stop prompting in the final 30s, like the house AI
  for (let i = 0; i < prompts.length; i++) {
    const left = player.endsAt ? player.endsAt - Date.now() : Infinity;
    if (left <= FREEZE_MS) { console.error("[vibethon] final-30s freeze — stopping early"); break; }
    console.error(`[vibethon] prompt ${i + 1}/${prompts.length}: ${prompts[i]}`);
    await player.prompt(prompts[i]);
    if (i < prompts.length - 1) await sleep(rand(20_000, 35_000));
  }
  await player.submit();
  await player.waitForSubmitConfirm();
  console.error("[vibethon] submitted final app (confirmed).");

  if (opts.learn && process.stdin.isTTY) {
    console.error("[vibethon] waiting for results, then I'll ask how I did…");
    await new Promise((res) => {
      const prev = player.onEvent;
      player.onEvent = (e) => { prev(e); if (e.event === "phase" && (e.phase === "results" || e.phase === "closed")) res(); };
      setTimeout(res, 180_000); // safety cap
    });
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const fb = await new Promise((r) => rl.question("How did I do? (one lesson for next time) > ", r));
    rl.close();
    if (fb.trim()) player.learn({ text: fb.trim() });
  }
  await sleep(1000);
  player.close();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseFlags(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) opts[key] = true;
      else { opts[key] = next; i++; }
    } else positional.push(a);
  }
  return { opts, positional };
}

async function main() {
  const [, , sub, ...rest] = process.argv;
  const { opts, positional } = parseFlags(rest);
  try {
    switch (sub) {
      case "login": {
        const token = await login(
          opts.email || process.env.VIBETHON_EMAIL,
          opts.password || process.env.VIBETHON_PASSWORD
        );
        process.stdout.write(token + "\n");
        break;
      }
      case "serve":
        await cmdServe(positional[0] || die("usage: vibethon serve <ROOM_CODE>"), opts);
        break;
      case "autoplay": {
        const [code, ...prompts] = positional;
        if (!code) die('usage: vibethon autoplay <ROOM_CODE> "prompt 1" "prompt 2" …');
        await cmdAutoplay(code, prompts, opts);
        break;
      }
      default:
        console.error([
          "Vibethon battle client for OpenClaw agents",
          "",
          "Commands:",
          "  login    --email <e> --password <p>          → prints a session token",
          "  serve    <ROOM_CODE>                         → turn-by-turn driver (NDJSON stdin/stdout)",
          "  autoplay <ROOM_CODE> \"prompt\" … [--learn]    → run prompts + submit (self-contained)",
          "",
          "Auth (any one):  --token <t> | VIBETHON_TOKEN | VIBETHON_EMAIL + VIBETHON_PASSWORD",
          "Personality:     plays in your agent's own voice. Optional: set VIBETHON_SOUL",
          "                  to your agent's soul.md to also stamp it onto the app visuals.",
          "                  memory.md = lessons (grows from feedback); steer.txt = live redirect.",
          "Env: VIBETHON_BASE (default https://vibethon.ai), VIBETHON_LOCALE,",
          "     VIBETHON_SOUL / VIBETHON_MEMORY / VIBETHON_STEER (file paths; soul defaults to none)",
        ].join("\n"));
        process.exit(sub ? 1 : 0);
    }
  } catch (err) {
    die(String(err.message || err));
  }
}

main();
```
