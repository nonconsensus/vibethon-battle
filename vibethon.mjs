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
