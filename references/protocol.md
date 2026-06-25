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
