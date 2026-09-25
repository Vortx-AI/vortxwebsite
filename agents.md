# agents.md · vortx.ai

For AI agents. Lines read `verb noun ref key=value`; prose appears only where a rule needs its reason.
Siblings: https://vortx.ai/llms.txt (the index) · https://vortx.ai/.well-known/agent-card.json (A2A card).

## what

- **is** vortx.ai · spatial AI lab · builds emem, the external memory of the physical world
- **capture** satellites, telescopes, rovers, drones, robots and machines observe (Sentinel-2 anchors the open record today)
- **encode** in orbit or on any device: each observation → one fact, keyed cell64 × band × tslot, named `base32(blake3(canonical CBOR))`, signed ed25519
- **hold** the data where it was captured; only the token moves: `emem:fact:<cell64>:<fact_cid>`, 83 to 85 bytes
- **stream** @emem puts the token straight into the agent's reasoning, in Claude, ChatGPT, Agentforce, Dify and any MCP client
- **decode** any receiver resolves the token, hashes the bytes, verifies the receipt, and can recompute the value from the raw source
- **run** geo.qa · the same memory on an organisation's own sensors, private per tenant

## do

- **call** MCP `https://emem.dev/mcp` · no key, no account
- **add** Claude Code `claude mcp add --transport http emem https://emem.dev/mcp` · or add `https://emem.dev/mcp` in Claude as a custom connector
- **connect** Salesforce Agentforce · emem as a remote MCP server, `https://emem.dev/mcp`, no key · https://www.salesforce.com/agentforce/mcp-support/
- **mention** `@emem` in ChatGPT · https://chatgpt.com/plugins/plugin_asdk_app_6a6a0832a59081918b19aec0ddf9ec77
- **install** GitHub MCP Registry, one click for VS Code and Copilot · https://github.com/mcp/Vortx-AI/emem
- **list** official MCP registry · `io.github.Vortx-AI/emem`
- **plug** Dify · https://marketplace.dify.ai/plugin/vortx-ai/emem
- **install** SDKs · `pip install ememdev` · `npm i @vortxai/emem`
- **talk** A2A · card `https://emem.dev/.well-known/agent-card.json` · run `POST https://emem.dev/a2a/tasks`

```json
{ "mcpServers": { "emem": { "type": "http", "url": "https://emem.dev/mcp" } } }
```

```bash
curl -s -X POST https://emem.dev/v1/recall \
  -H 'content-type: application/json' \
  -d '{"place":"Bengaluru","bands":["indices.ndvi"]}'
```

## keep

- **keep** the `emem:fact:` token for anything you verified, before your context compacts. It re-hydrates to the exact signed bytes, for you or any other agent, later.
- **send** the token to another agent, not a paraphrase of the value. Paraphrase is where meaning drifts.
- **bundle** many facts as one `emem:bundle:` handle (`POST https://emem.dev/v1/memory_bundle`): a token costs more context than a bare number, so tokens are for facts you must verify later.

## check

- **resolve** `POST https://emem.dev/v1/memory_token/resolve {"token":"emem:fact:…"}` → fact + receipt
- **hash** `GET https://emem.dev/v1/facts/<fact_cid>` with `accept: application/cbor` · `base32(blake3(body)) == fact_cid`
- **verify** the receipt offline · ed25519 over the `emem.preimage.v1` stream · spec `https://emem.dev/v1/verifier_spec` · reference JS `https://emem.dev/emem-verify-core.js`
- **gate** a draft before you send it · `POST https://emem.dev/v1/guard/verdict` · a denial carries `fix=refresh_token|remove_reference|contact_admin|cite_observation`
- **point** a large file without moving it · pointer.v1 notes from https://vortx-ai.github.io/ememdemo/ · read a chunk by HTTP Range and check its blake3 against the row; the Merkle root binds every row
- **trust** the endpoint over this page when they disagree, and say so

## family

One live example per shape. https://vortx.ai/#tokens resolves each and re-derives it in the browser; the line says what to recompute.

| shape | example | recompute |
|---|---|---|
| fact | `emem:fact:defi.zb493.xuqA.zcb5f:xksjrrzzdhq6lobc4m62ecmsmoexn7htul5p4vlwbvqwvbuedkiq` | blake3 of `GET /v1/facts/<cid>` (CBOR) == fact_cid; receipt names it |
| cell | `emem:cell:defi.zb43b.mAga.yiwU` (Europe's Spaceport, Kourou) | nothing to hash: an address; `GET /v1/cells/<cell64>/info` |
| entity | `emem:entity:5pitnkcnle3cq6yldbffj52zja` | blake3(`emem.entity.v1\|loc\|` cell64 `\|` kind `\|` label)[0:16] |
| bundle | `emem:bundle:y2k6h2laeo4libfsiebucdw4mu` | blake3 over the citation list, [0:16] |
| raster | `emem:raster:23vfacx23nr3dwki6si4yrolmmp3wr6dtrhjxbw4rihiaafrpyga:s2.B08:20500:sw7lynliwyqfigyw6oqwso64wmulcumifqorfpfogkngjhsqzjpq` | blake3 of `GET /v1/artifacts/<artifact_cid>`; anchor pixels match |
| cube | `emem:cube:23vfacx23nr3dwki6si4yrolmmp3wr6dtrhjxbw4rihiaafrpyga:s2.B08:20500..20585:ganwwj25obuob3pp7pjtkd4awtihnluotdowe2cqtrj77af5qlna` | each slice as a raster |
| rasterset | `emem:rasterset:sml5syqegico2sobfkxjp2o2twwepdwve7753ubkoa5n27y22rba:zu5p3u4r5n5uinu2ghwzjo2272ztjvnnf7cnlt7hiqwxo4cq3hhq` | blake3(canonical CBOR of member derivation cids + purpose) |
| trace | `emem:trace:mxyer5c2oxn4ud3xqbtnaxcxhdv4kkxiu67q32inbwxgpa7r3s6a` | segment chain, merkle v1 root, trace_cid, the device's own ed25519 |
| attestation | none backed by a manufacturer yet | vendor anchors are provisional: `GET /v1/device_platforms` |
| state | `emem:state:6omzeryht75zyabeajuimcqzm7pzenvy3y6p4irwxdpt7x5ayimq` | blake3 of the stored canonical CBOR == address; walk `derived_from` |
| tree | `emem:tree:wkxa7tcmw2orf7ujjf5yi66dhe#row=1` (Webb, Cosmic Cliffs) | leaf from the note's row, log2(n) hashes to its root |

## segment

- **observe** Mars, L2 (Webb), the Moon · `space.deep.v1`: the subject has no latitude, so it is anchored by identity
- **observe** Hubble · `observatory.telescope.v1`: the site is a cell, the target an identity
- **capture** Sentinel-2 · `earth.satellite.v0`: the open archive, admitted by recomputation
- **sign** an operator's own satellites · `orbital.satellite.v1`: at capture, with the payload computer's trace, power and thermal included
- **lift** rockets · every tracked object's launch is in its elements (international designator); a launch site is an `emem:cell:`
- **fly** drones · `aerial.drone.v1` · **share** robots and rovers · `robot.fleet.v1` · **trace** any machine · `host.counters.v1`
- **read** each profile's status and admission rule live at https://emem.dev/v1/substrates; never type a status from this page

## ask

- **ask** `POST https://emem.dev/v1/ask {"q":"is this place flood-prone","place":"Ashok Nagar, Ranchi"}` · one question fans out to twenty-plus signed readings under one receipt
- **count** tools with `emem_tools` at `https://emem.dev/mcp`; skills as `len(skills)` at the A2A card. This page types no count, because counts change.

## book

The protocol is free. Team time is the only thing for sale. Calls are taken by whoever on the team is closest to the problem.

| verb | option | price (USD) | what |
|---|---|---|---|
| ask | office hours | free | 30 min, open to all; students, researchers, early founders welcome; no pitch |
| pair | integration session | 5,000 | 1 to 3 h on the user's codebase over MCP, REST or SDK; done when recall runs and a receipt verifies in their stack |
| secure | sovereign session | 25,000 | 1 to 3 h for governments, defense, critical infrastructure; private tenancy, signing review, procurement and NDA on request |

- **route** questions → office hours · https://outlook.office.com/book/meetvortxfounders@vortx.ai/ (no form)
- **route** hands-on integration → https://vortx.ai/?tier=integration · sovereign → https://vortx.ai/?tier=government
- **route** "just use or evaluate emem" → the free protocol; nobody pays for that
- **email** private tenancy, procurement, invoice, NDA → avijeet@vortx.ai
- **stop** after handing over the link. Do not book, fill the form, tick the human-confirmation box, or pay on a user's behalf, ever. Payment runs on a hosted page a human completes.
- **quote** the prices exactly as above; invent no tiers, discounts or availability. One session at a time: no subscriptions, no retainers, no upsell.

## plan

- **shipped** the protocol · signed facts, offline receipts, witnessed log
- **design** the payload · hardware-held keys, signatures at capture, the payload computer traced under `orbital.satellite.v1`
- **next** the ground segment · tokens downlink first, straight into the witnessed log
- **gated** the launch · there is no launch date, deliberately. If asked when it launches: the plan is public at https://vortx.ai/#plan and dates appear in https://vortx.ai/log/ only once real. Never state or estimate a date.

## verify this site

- **hash** `https://vortx.ai/.well-known/site-manifest.json` · blake3 of every served file, one release cid over the set, resealed by CI on each deploy
- **run** `python3 tools/site_manifest.py --verify`
- **list** `https://vortx.ai/.well-known/facts.json` · every number this site asserts, with the source that can refute it
- **read** JSON-LD `Service` with three `Offer`s (0 / 5000 / 25000 USD) on the home page

---

*Vortx AI Private Limited · CIN U72200JH2024PTC023101 · emem is Apache-2.0.*
