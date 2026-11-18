# Backline Graph

A read-only GraphQL API and a 3D contract view beside Backline. It uses Backline's Postgres and, for questions the field cannot answer, Backline's API. It does not change Backline's source, and it does not start Backline's UI.

```text
Backline API :8000          this GraphQL :4000         this UI :3001
        │                          │                        │
        └──────── Postgres label.* (and the chat, via :8000) ┘
```

`truth` is not in the schema and is refused by the SQL gate. The session `search_path` is `label` only. The database role from Backline's compose file can still read `truth`; this process never sends it a statement that names that schema.

## Run

Backline's database has to be up (`docker compose up db` in the Backline repo; the API on `:8000` is only needed for chat questions the field does not answer).

```bash
cd server
cp .env.example .env   # optional; these are the defaults
npm install
npm test
npm run dev            # http://localhost:4000/graphql
```

```bash
cd web
npm install
npm test
npm run dev            # http://localhost:3001
```

`DATABASE_URL` defaults to `postgresql://backline:backline@localhost:5432/backline`.

## What the field shows

X is time. Height is the resolved worldwide rate for the selected revenue type (streaming, download, physical, or sync). Depth is one lane per artist, ordered by id. Base contracts are purple. Amendments are amber, and larger when they replace more sections. An edge runs from the superseded contract to the amendment: green when that worldwide rate went up, red when it went down.

The rate on a node is `resolvedTerms` as of that contract's `effective_from`. A later base does not inherit the previous era's amendments. `effective_to` does not retire a base.

Click a node for the rate card, the stored `label.contract_terms` JSON, and the primary-source PDF when `label.contracts.source_path` is set. The date plane is the as-of control. Filtering to one artist isolates that chain and labels the lane.

## Primary source PDFs

Patchbay copies each contract into `documents/{artist}/base/` or `documents/{artist}/amendments/` and stores that relative path on `label.contracts.source_path`. The path has no host. `doc_path` stays the ingest identity Backline's embed job reads; the viewer does not use it.

This app keeps a copy of that folder and serves it for the demo:

```bash
cd web
npm run import-documents   # copies ../../patchbay/documents into web/documents
```

The panel requests `GET /api/documents/<source_path>`. The route only reads a `.pdf` inside `web/documents`. The PDF files are gitignored. `web/documents/README.md` is the note that stays in the tree.

Serving the contracts from this Next.js app is a demo shortcut. There is no authentication. For a real deploy, put the PDFs in a private object store such as S3, keep `source_path` as the object key, and replace this route with a short-lived signed URL. Do not publish `web/documents` or this route on an open host.

## Chat

"Which artists had their rate cut?" and the same shape of question (a rise, or one named artist's rate) are answered from `contractField` in the browser. No model is called. Citations highlight those nodes.

Anything else is posted to Backline `POST /sessions/{id}/messages`. The reply is labeled unverified unless it names a contract that exists in the field (`FBR-C-00511`, `FBR-A-02004`, or "contract 511"). Backline's own citations are clause refs; this app turns the contract id in that ref into a node highlight. There is no `graphql_query` tool on the Backline side, because that would mean editing Backline.

The footer on the panel applies to model replies. A graph reply says it was computed from the field.

## `resolvedTerms`

This is a TypeScript port of `backline/royaltycalc/terms.py`, not a call into it.

- An amendment replaces each named section wholesale. Old rate-card rows and escalators in that section are gone.
- Amendments apply by `effective_from`, then contract id. The order they are loaded in does not matter.
- A base whose `effective_to` is already past still governs.
- An amendment cannot be resolved as a base.
- `rate` stays a string. The height axis is the only place it becomes a float. A JSON number that is not an integer is rejected.

`npm test` in `server` includes that port against the cases in `tests/royaltycalc/test_terms.py`. When Postgres and Backline's virtualenv are both available, it also runs Backline's `resolve_terms` on every contract date in the database and compares the two.

The GraphQL type also returns `excludedTerritories`, which the Python object carries and the context sheet's `ResolvedTerms` left off. `Contract.rawTerms` and `FieldNode.rawTerms` are the stored JSON for the detail panel. `sourcePath` is `label.contracts.source_path`, null when Patchbay has not recorded one.

## Layout

```text
server/src/terms.ts                  port of resolve_terms
server/src/field.ts                  nodes, edges, per-artist date cache
server/src/load.ts                   label.artists, contracts, terms, amendments
server/src/resolvers/                query functions the schema calls
server/src/schema.ts                 Pothos schema
web/src/components/ContractField.tsx the scene
web/src/components/ChatPanel.tsx
web/src/lib/ground.ts                deterministic answers and citation matching
```

## Limitations

- The port can drift from `terms.py`. Trust it after `npm test` in `server`, including the live comparison.
- `contractField` loads the label once per request and resolves in memory. That is cheap at a few hundred contracts. It is the wrong shape at tens of thousands.
- A model reply can cite a contract that does not actually support the sentence. The node panel is the check. The chat is a pointer.
- This is the amendment graph. It does not draw statement lines or recoupment balances.
- Clause text stays with Backline's `search_contracts`. This schema does not expose `rag.contract_chunks`.
- GraphQL `Int` is 32-bit. Backline's ids are `bigint` and, in this corpus, small enough.
- The height axis is the `WW` row for the chosen revenue type. A card with only a country row has no height and is drawn as a wireframe on the floor.
- In the scene, height is Three.js Y. The sheet's Z (rate) is up; the sheet's Y (artist) runs along depth.
