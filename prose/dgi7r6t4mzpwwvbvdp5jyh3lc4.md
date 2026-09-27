# vortx.ai, in its own words

> The glossary of vortx.ai: what each term and each verb on the site means, once, for the whole site: one word, one meaning. Terms come first, then the verbs of the story, of proving it, of using it, and of the record. It is named by its own hash, base32 of the first 16 bytes of its blake3, the way emem names a note, and a page checks that name before it shows a meaning.

## terms

### token
A short string, a few dozen bytes, that names one signed thing: emem:kind:id. Not the unit a model counts; that is a context token.

### context tokens
also: context token
The unit a language model reads and is billed by, about four characters of text each. An emem token costs a few dozen of them; the file it names would cost millions.

### note
A small text file that describes a big file: where it lives, its chunks and their hashes. The note travels; the file stays.

### row
One chunk of a file, as its note lists it: where it starts, how long it is, and its blake3.

### root
One hash over every row's hash, in order. Change any chunk and the root changes.

### cell
also: cell64
A square on Earth about ten metres across (9.55 m at the equator), named by its 64-bit cell64 address. A reading at a place is the reading of one cell, never an average over the area the place's name covers.

### fact
One signed observation: a value, at a cell, for a band, at a time, with its sources.

### band
What was measured: greenness (NDVI, from −1 to 1: the higher, the greener), heat, elevation, water and so on.

### receipt
emem's signed statement of what it served, checked with ed25519.

### blake3
A fast cryptographic hash. The same bytes always give the same 32 bytes out; different bytes, different out.

### ed25519
A signature scheme: a private key signs, anyone with the public key checks.

### cid
also: cid26, fact_cid
A content id: a name made from the bytes' own hash. A cid26 is 26 characters, base32 of the first 16 bytes of the blake3, the way emem names a note; a fact_cid is all 32 bytes, 52 characters, never shortened.

### log head
also: sth
The transparency log's latest signed size and root, its signed tree head.

### drift
A number that does not match the signed value it cites. Echo says which: rounded, or wrong. A rounding passes the guard; a wrong number is denied.

### verdict
The result of a check: allow, deny, or which step failed.

### range
A slice of a file read by offset and length, so only the needed bytes move.

### tiles
The squares a large image is stored in; each one is read and hashed on its own.

### stats
The note's own summary of a chunk's pixels, compared with what was decoded here.

### bytes
How much was read or moved.

### state
One stage of an answer's reasoning, chained to the stage before.

### tokenised context
Tokens in an agent's context instead of files: each a few dozen bytes that name signed facts the agent can check, then read only the parts it needs.

### @emem
The connector that decodes tokens inside ChatGPT, Claude, Agentforce, Dify or any MCP client.

### MCP
Model Context Protocol: how an agent calls tools on a server.

### A2A
Agent to agent: how one agent hands a task to another, starting from an agent card.

### tslot
The time slot a fact is filed under, with its cell and band. For the facts this site cites it is the capture day, counted in days since 1 January 1970: 20620 is 16 June 2026.

### confidence
How sure the source is of a fact's value, from 0 to 1. It travels with the value and never changes it.

### bundle
A signed set of facts cited as one token, emem:bundle:<id>, hashed over its list of citations.

### entity
A shared name for one thing, a place, a device or a galaxy: emem:entity:<id>. Agents agree on what they mean by it, but it names no signed bytes of its own.

### raster
One band over an area as a signed image, emem:raster:…, re-derivable from its source.

### cube
A field over time: a manifest over raster slices, emem:cube:….

### rasterset
Several fields bound into one citeable set, emem:rasterset:…, so a whole scene is one token.

### pointer.v1
The note schema for one large file: where it lives, its rows (offset, length, blake3) and the Merkle root over them.

### attester
The ed25519 key a write is signed with. /memories/by_attester/<its first eight characters>/ is that key's own namespace.

### preimage
The exact bytes a hash or a signature is computed over. A checker rebuilds the preimage before it verifies.

## the story

### keep
The file stays where the device made it. Nothing is uploaded, copied or moved.

### encode
Write the file's note: where it lives, its size, a blake3 hash for each chunk, and one Merkle root over them all. The file itself does not move.

### send
Pass the token, a few dozen bytes, instead of the file.
also: sent

### decode
@emem turns a token back into what it names, inside an agent's context, and proves it belongs to its note.

### check
Work something out again yourself, in this browser: a hash, a signature, a proof path, a value. A check says where it ran.

## proving it

### hash
Compute blake3 over the exact bytes. In emem the result is the thing's name, so different bytes get a different name.

### name
Give a thing its emem name, emem:kind:id, where the id comes from the bytes themselves or from an anchor.

### sign
Attach an ed25519 signature, so anyone holding the public key can see who vouched for these exact bytes.

### verify
Check a signature against a published key, offline, trusting no server.

### prove
Show that a claim holds with checks anyone can rerun; when one fails, say which.

### cite
Quote a reading with its token, so every reader resolves it to the same signed bytes.

### resolve
Turn a token into the record it names: the fact, its receipt, its sources.

### mint
Make the token for a fact, place or thing. The same thing always mints the same token.

### recall
Ask emem for the signed facts at a place and band; new ones are measured from the source archive first.

### locate
Turn a place's name or coordinates into its cell, a ten-metre address.

### anchor
Tie a subject to an address: a place to its cell; a planet, a galaxy or a device to an identity.

### bind
What a token binds is exactly what citing it proves: which bytes, which place, which time.
also: binds, bound

### attest
Tie a device's key to the hardware root of trust that vouched for it.

### trace
Record how a machine ran (scheduler, memory, storage, network counters), signed by the device itself.

### admit
Accept a class of device under a written profile before its writes count.

### enrol
Register a device's key as attested, so its writes tie back to its hardware.

### log
Append every write to emem's transparency log, where any later change would show.

### witness
Let outside keys co-sign the log's head, so no single party can rewrite it.

### stamp
Add emem's current signed log head to a note, so its time can be checked later.

### chain
Link checks so each one rests on the one before, and a stranger can walk the whole way.

### guard
Give a signed allow or deny for a cited claim, with the fix an agent can apply.

### echo
Compare the number an agent wrote with the signed value it cites. emem answers verbatim, rounded or wrong, with a receipt signed ed25519.

### catch
Spot a number that has drifted from the signed value it cites, before anyone relies on it.

### score
Rate each value against the open archive, and publish the result, losses included.

### measure
Work a number out here, now, and show how.

### count
Add up what exists or what moved, from the actual record, not an estimate.

### compare
Put two things side by side, at the same scale.

### find
What a check turned up.

### caution
A limit to read before relying on a result.

### say
State plainly, every time, what was checked and what was not.

### claim
What we assert, and what we deliberately do not.

### trust
Which source wins when two disagree.

### skip
A step that did not run, and the reason.

### stop
A step that could not finish, and why. A source that does not answer is not a failed check.

## using it

### ask
Put a question to @emem about a place. The answer is built from signed readings, under one receipt.

### answer
Reply from observations of that place, not from text about it.

### run
Carry out a sample or a check from start to end, live, in this browser.

### open
Show a sample or a record here, without leaving the page.

### see
Look at the result, drawn here from bytes that checked out.
also: look

### watch
Follow a run as it happens.

### read
Load something to use it: a note, a page, a range of bytes, a spec.

### fetch
Get one record or one range of bytes from where it lives.
also: pull

### pick
Choose one of the options shown.

### copy
Put the text on your clipboard.

### get
Download a tool or a file.

### install
Add a package or a connector with one command or one click.

### add
Add emem to a client you already use.

### connect
Point a client or a platform at emem's MCP endpoint.

### mention
Call @emem by name in a chat.

### plug
Add emem as a plugin to a platform.

### govern
Manage emem as an approved asset in an enterprise catalogue.

### point
Direct a client or a note at an address: an endpoint, a source file.

### call
Make an HTTP request to emem's REST API.

### hand off
Give another agent the token, so it reads the same signed bytes.
also: hand

### share
Use one memory across agents, vendors or teams, without a shared backend.

### publish
Put a note where any agent can read it, in your own signed namespace.

### define
Say what a term means.

### take
Use a picture or a fact from the press kit, crediting Vortx AI.

### quote
Use these facts word for word.

### follow
Keep up with what shipped, dated.

### list
Appear in a registry or marketplace where agents and developers find tools.
also: listed

### rank
Appear in a public ranking.

### fork
Take the open source and change it.

### return
Go back.

### start
Begin here, then go further only as far as you need.

### miss
Nothing lives at this address.

### join
Take part: a cohort, a waiting list, a federation.

### deploy
Run the same memory privately, in a private tenancy.

### fuse
Combine several sensors into one memory.

### bring
Add your own sensors or data.

### build
Make something from signed parts.

### enforce
Hold a boundary in code, on every read and every write.

### secure
Protect: a security fix, or a private, reviewed setup.

### pair
Work together on your codebase until signed facts flow.

### observe
Collect observations: telescopes, satellites, rovers, drones, robots, machines.

### capture
Record an observation on the device, at the moment it happens.

### fly
A drone writes readings along its path.

### land
Place each reading at the cell it describes.

### lift
Every tracked object carries its launch in its orbital elements.

### map
Chart terrain.

### hold
Keep the whole file at its archive, where it already is.

### reason
What an agent's context receives: facts, not imagery.

### route
Choose which topics a question needs.

### source
Where the data comes from.

### stand
Sit at a height above sea level.

### light
Where the Sun is overhead now.

### load
Where the orbital elements came from.

### launch
The launch record a tracked object carries.

### pass
A satellite's pass over a place.

### address
Give a place its ten-metre cell, so it can be cited like anything else.

### carry
Keep the proof with the fact, so nobody has to trust whoever served it.

### combine
Join a public reading and a private one under one receipt, without the private data leaving.

### prepare
Assemble a document from signed parts, ready for a human to file.

### span
The range a set of readings covers, lowest to highest.

### test
Try an early build, live, before it is finished.

### try
Run it once yourself, here, with nothing to set up.

### tier
How far a write reaches: writes are tiered by reach, and reads are never gated. A tier is not a price; the protocol is free.

### use
Put a press picture or fact to work, crediting Vortx AI.

### wait
Held until something outside happens first.

### write
Send us a message.

### fix
Tell us what broke; a person answers and puts it right.

### book
Reserve time with the team: office hours are free; integration and sovereign sessions are paid.

### pitch
Present Vortx AI to investors and the world.

### tell
Explain the work in our own voice: a talk, a podcast.

## the record

### ship
Release a product or a feature.
also: shipped

### release
Publish a version or a model.

### open-source
Publish the code under an open licence.

### relaunch
Rebuild and republish.

### demo
Show it working.

### decide
Return a typed decision.

### settle
Freeze a format so it stays stable.

### scale
Extend to more data or more area.

### seal
Hash every served file into one manifest, so any change shows.

### attribute
Explain why a number moved, term by term.

### found
Start the company.

### federate
Let independent parties run witnesses.

### plan
Written down, not yet built; dated only when real.
also: planned

### in design
Being designed now.

### next
The step after this one.

### gated, not dated
Starts when the checks say ready, not on a calendar date.

### part of
A programme Vortx AI belongs to.

### moved
This page lives somewhere else now.

### like
For example.

### on
The example this refers to.

### plus
Also.
