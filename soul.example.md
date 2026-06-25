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
