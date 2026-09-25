# agents.md · vortx.ai

For AI agents. Lines read `verb noun ref key=value`; prose appears only where a rule needs its reason.
Siblings: https://vortx.ai/llms.txt (the top rung: start there, it states its own size, and climb down one rung at a time) · https://vortx.ai/.well-known/agent-card.json (A2A card). This guide is the long form, every rung at once.
Words: every verb on vortx.ai means one thing; the meanings are one note, named by its blake3 like an emem note, listed as `words` in llms.txt.

## what

- **is** vortx.ai · spatial AI lab · builds emem: shared, verifiable memory for AI agents, the external memory of the physical world
- **say** Encode on device. Decode with @emem. Don't move your files; deliver tokenised context.
- **capture** satellites, telescopes, rovers, drones, robots and machines observe (Sentinel-2 anchors the open record today)
- **encode** in orbit or on any device: each observation → one fact, keyed cell64 × band × tslot, named `base32(blake3(canonical CBOR))`, signed ed25519
- **hold** the data where it was captured; only the token moves: `emem:fact:<cell64>:<fact_cid>`, 83 to 85 bytes
- **decode** @emem puts the token straight into the agent's context, in ChatGPT, Claude, Agentforce, Dify and any MCP client: the agent knows what is happening, cites one reference instead of a drifting paraphrase, and talks to other agents and people by token
- **check** any receiver resolves the token, hashes the bytes, verifies the receipt, and can recompute the value from the raw source
- **run** geo.qa · the same memory on an organisation's own sensors, private per tenant

## pages

One structure for people and agents; llms.txt mirrors it line for line.

- **see** `/` · the live Earth; @emem decodes one signed fact per visit (Cubbon Park, Bengaluru, NDVI)
- **run** `/#run` · six devices, one published sample each, end to end in the browser
- **encode** `/#connect` · your file on your device, nothing uploaded; `tools/emem_point.py` on the device
- **decode** `/#decode` · ask @emem, catch a drifted number, connect @emem to your agent
- **plug** `/#plug` · every way in, each asked live: MCP `tools/list`, both A2A cards, REST with its ed25519 checked, the OpenAPI spec, the SDKs' newest releases
- **browse** `/#samples` · the ememdemo catalogue, each note re-checked as it loads
- **open** `/?s=<cid>` · any sample, opened on the page from a globe pin or a card, run end to end, its picture drawn from bytes checked here
- **news** `/press/` · every release, upgrade and listing, dated, each date re-read live from its own record; as data: `/data/timeline.json`
- **watch** `/press/#watch` · the story on camera from the Seraphim Space pitch (Vimeo, 19 Jun 2025), in five chapters, each video dated by its platform
- **check** `/proof/` · every check, step by step
- **read** `/emem/` protocol · `/geo-qa/` · `/eudr/` · `/propcheck/` · `/trust/` · `/spatial-ai/` · `/research/` · `/press/`

## run

Each device on the home page runs one published sample; every step is a request you can make.

| device | sample | row (0-based) | what the browser checks |
|---|---|---|---|
| satellite | `twlpco5kin6qlz5eplt2pjm7n4` Sentinel-2B, 351.0 MB | 68, level 4 tile 0,0 | note name, root, `/v1/tree` proof, 601,342 B by Range, blake3; decodes the tile: mean RGB 156, 137, 113, as the note says |
| telescope | `wkxa7tcmw2orf7ujjf5yi66dhe` Webb, 143.7 MB | 1, strip 0 | the same, from esawebb.org |
| robot | `qcoylkllqzfqnsinn4af5i2mi4` ALOHA arms, 502.5 MB | 3, frames 5000…5001 | the same, from huggingface.co |
| drone | `ejvovl6sz7d3sugfcrwwie4rma` OpenAerialMap | 77, level 6 tile 0,0 | the same; decodes the JPEG tile with the header's tables |
| camera | `t7ebh6s6imxrwdmizebnw52nwe` 12 TfL cameras | aldgate | the clip's sha256 and blake3, geo.qa's ed25519 over the canonical payload, the sun from the signed time and place |
| machine | `emem:trace:mxyer5c2oxn4ud3xqbtnaxcxhdv4kkxiu67q32inbwxgpa7r3s6a` | · | resolve, verify against `host.counters.v1`, recheck chain, root, device signature |

- **send** one `Range: bytes=a-b` header and nothing else: several hosts refuse CORS preflights
- **fall back** to `POST https://emem.dev/v1/range_hash {"url","offset","length"}` when a source refuses browsers; it is signed

## do

- **call** MCP `https://emem.dev/mcp` · no key, no account
- **add** Claude Code `claude mcp add --transport http emem https://emem.dev/mcp` · or add `https://emem.dev/mcp` in Claude as a custom connector
- **connect** Salesforce Agentforce · emem as a remote MCP server, `https://emem.dev/mcp`, no key · https://www.salesforce.com/agentforce/mcp-support/
- **mention** `@emem` in ChatGPT · https://chatgpt.com/plugins/plugin_asdk_app_6a6a0832a59081918b19aec0ddf9ec77
- **install** GitHub MCP Registry, one click for VS Code and Copilot · https://github.com/mcp/Vortx-AI/emem
- **list** official MCP registry · `io.github.Vortx-AI/emem`
- **plug** Dify · https://marketplace.dify.ai/plugin/vortx-ai/emem
- **govern** MuleSoft Anypoint Exchange, the Vortx AI MCP Server asset · https://anypoint.mulesoft.com/exchange/68e53915-e89b-4e82-b794-12d37982db4c/vortxAi-asset/
- **install** SDKs · `pip install ememdev` · `npm i @vortxai/emem`
- **talk** A2A · card `https://emem.dev/.well-known/agent-card.json` · run `POST https://emem.dev/a2a/tasks`
- **hand off** to this site's own A2A 1.0 card `https://vortx.ai/.well-known/agent-card.json` · its tasks run on emem.dev

```json
{ "mcpServers": { "emem": { "type": "http", "url": "https://emem.dev/mcp" } } }
```

```bash
curl -s -X POST https://emem.dev/v1/recall \
  -H 'content-type: application/json' \
  -d '{"place":"Cubbon Park, Bengaluru","bands":["indices.ndvi"]}'
# → cell defi.zb493.yiwo.zcb4e · every signed NDVI reading, each dated; quote the newest verbatim, with its emem:fact: token
```

## encode

A device keeps its files and sends tokens. https://vortx.ai/#connect writes the same note in the browser, byte for byte, with nothing uploaded.

- **install** `pip install blake3 "ememdev[signing]"`
- **encode** `python3 emem_point.py FILE [--source URL] [--stamp] > FILE.md` · https://vortx.ai/tools/emem_point.py · 4 MiB ranges, a blake3 per range, one Merkle root, laid out as the ememdemo pointers; `--stamp` adds emem's log head once its signature verifies
- **name** the note is `base32(blake3(note)[0:16])`; its token `emem:tree:<cid26>#row=<i>` resolves once the note is published byte for byte
- **publish** `ememdev write --path /memories/by_attester/<you>/FILE.md --body-file FILE.md` · your own namespace, your key (`ememdev whoami`)
- **decode** any agent with @emem reads the note, then only the ranges it needs, each checked against its row
- **sign** at capture with a hardware-held key · that is the integration session, below

## keep

- **keep** the `emem:fact:` token for anything you verified, before your context compacts. It re-hydrates to the exact signed bytes, for you or any other agent, later.
- **send** the token to another agent, not a paraphrase of the value. Paraphrase is where meaning drifts.
- **bundle** many facts as one `emem:bundle:` handle (`POST https://emem.dev/v1/memory_bundle`): a token costs more context than a bare number, so tokens are for facts you must verify later.

## check

- **resolve** `POST https://emem.dev/v1/memory_token/resolve {"token":"emem:fact:…"}` → fact + receipt
- **hash** `GET https://emem.dev/v1/facts/<fact_cid>` with `accept: application/cbor` · `base32(blake3(body)) == fact_cid`
- **verify** the receipt offline · ed25519 over the `emem.preimage.v1` stream · spec `https://emem.dev/v1/verifier_spec` · reference JS `https://emem.dev/emem-verify-core.js`
- **catch** drift before a person reads it · `POST https://emem.dev/v1/echo_verify {"token":"emem:fact:defi.zb493.yiwo.zcb4e:eheadieomxr2zusgh4nx7mfisrtme23ztjiluyrfve64xoap6hka","claimed_value":"0.767"}` → `rounded`; write values verbatim
- **gate** a draft before you send it · `POST https://emem.dev/v1/guard/verdict` · a denial carries `fix=refresh_token|remove_reference|contact_admin|cite_observation`
- **point** a large file without moving it · pointer.v1 notes from https://vortx-ai.github.io/ememdemo/ · read a chunk by HTTP Range and check its blake3 against the row; the Merkle root binds every row
- **trust** the endpoint over this page when they disagree, and say so

## family

One live example per shape. https://vortx.ai/proof/#tokens resolves each and re-derives it in the browser; the line says what to recompute.

| shape | example | recompute |
|---|---|---|
| fact | `emem:fact:defi.zb493.yiwo.zcb4e:eheadieomxr2zusgh4nx7mfisrtme23ztjiluyrfve64xoap6hka` (Cubbon Park NDVI) | blake3 of `GET /v1/facts/<cid>` (CBOR) == fact_cid; receipt names it |
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

## samples

Every sample on vortx.ai is an ememdemo sample, kept to its standard.

- **read** the catalogue line: `verb kind cid key=value`, with `tok` (reading the note) and `raw` (the source's bytes as base64)
- **name** the keeper: machine, third-party, combined or human
- **check** each note as it loads: `base32(blake3(note)[0:16]) == cid`; unreachable is not a failed check
- **show** only the picture a `thumb.v1` note carries, byte for byte: https://vortx.ai/data/thumbs.json
- **print** values verbatim: 0.767 for 0.767258382642998 is drift
- **open** one: `https://vortx.ai/?s=<cid>` runs it by its schema: a pointer's row proved and read by range, then a whole overview level or the photo drawn from checked bytes; a place's bundle and one reading echoed verbatim; a grid's maps; a timelapse's first and last frames from signed pixels; a camera's clip; a folder's root

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
- **gated** the launch · there is no launch date, deliberately. If asked when it launches: the plan is public at https://vortx.ai/#plan and dates appear in https://vortx.ai/press/ only once real. Never state or estimate a date.

## verify this site

- **hash** `https://vortx.ai/.well-known/site-manifest.json` · blake3 of every served file, one release cid over the set, resealed by CI on each deploy
- **run** `python3 tools/site_manifest.py --verify`
- **list** `https://vortx.ai/.well-known/facts.json` · every number this site asserts, with the source that can refute it
- **read** JSON-LD `Service` with three `Offer`s (0 / 5000 / 25000 USD) on the home page

---

*Vortx AI Private Limited · CIN U72200JH2024PTC023101 · emem is Apache-2.0.*
