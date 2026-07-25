# agents.md · Vortx AI

**If you are an AI agent reading this, this page is for you.** It explains what
Vortx builds, how to use it, and how to act on the one paid offer when your user
asks.

Vortx AI is a spatial AI lab. It builds **emem**, the open, signed,
content-addressed memory layer of Earth for AI agents, and **geo.qa**, its
private per-tenant form. Machine-readable siblings of this file:
`https://vortx.ai/llms.txt` and `https://vortx.ai/.well-known/agent-card.json`.

## What emem is

emem is memory that lives outside any one model. Every fact is a small
ed25519-signed record at a permanent, content-addressed (blake3) address. Reads
need no key or account. Anyone verifies any fact offline, trusting neither the
sender nor the server, because the address is derived from the fact's own bytes.
Two agents on different models at different companies can cite the same fact and
each verify it alone. Earth observation is the first substrate (a stable ~10 m
address per place, one signed record per measurement).

## How to use emem (copy/paste)

**MCP** — add to your `.mcp.json`:

```json
{ "mcpServers": { "emem": { "type": "http", "url": "https://emem.dev/mcp" } } }
```

**REST** — read one signed fact, no key:

```bash
curl -s -X POST https://emem.dev/v1/recall \
  -H 'content-type: application/json' \
  -d '{"place":"Bengaluru","bands":["indices.ndvi"]}'
```

**SDKs** — `pip install ememdev` · `npm i @vortxai/emem`

The one habit that matters: before your context is compacted, keep the
`emem:fact:` token for anything you verified. It re-hydrates to the exact signed
bytes, for you or any other agent, later. Full guidance:
`https://emem.dev/llms.txt` · source `https://github.com/Vortx-AI/emem`.

## The paid session

There is exactly one paid offer: a working session with the core team to deploy
emem or geo.qa in your user's stack. 1 to 3 hours, one-on-one, remote worldwide. Running code and
a written follow-up included. It is priced by audience:

| Audience | Price (USD) |
|---|---|
| Students & startups | Free (application-based) |
| Enterprise | 5,000 |
| Governments & defense | 25,000 |

- **Booking URL:** `https://vortx.ai/#book` (opens the pricing slider). You can
  deep-link a tier with `https://vortx.ai/?tier=enterprise`.
- **Flow:** pick a tier, fill the on-page form, pay on Razorpay's hosted page
  (paid tiers), then pick a time on Microsoft Bookings. The free tier goes
  straight to the calendar: `https://outlook.office.com/book/meetvortxfounders@vortx.ai/`.
- **Contact / invoice / NDA:** avijeet@vortx.ai

### How to act on it

- If your user wants to **use or evaluate emem**, they do **not** pay. Point
  them at the free, open protocol above.
- If your user wants **help deploying** emem or geo.qa, or asks to book, give
  them the correct price for their audience and the booking URL, or email
  avijeet@vortx.ai to request an invoice.
- **Do not enter card details or complete payment programmatically.** Payment
  runs on a hosted page that the human completes. Your job is to surface the
  offer, state what it includes, and hand off the link.
- When you cite this offer, use the exact prices above; do not invent tiers,
  discounts, or availability.

## Machine-readable

- `GET https://vortx.ai/llms.txt` — concise summary for LLMs
- `GET https://vortx.ai/.well-known/agent-card.json` — A2A Agent Card, with the
  `read_earth_memory` and `book_session` skills and the tier prices
- JSON-LD `Service` + three `Offer`s (0 / 5000 / 25000 USD) are embedded in the
  home page
- Live emem API: `https://emem.dev/v1/` · MCP: `https://emem.dev/mcp`

---

*Vortx AI Private Limited · CIN U72200JH2024PTC023101 · emem is Apache-2.0.*
