# Project Compiler

**From idea to defensible research.** We don't write your project — we make sure you can defend it.

An MVP of the product described in [prd.md](prd.md): a research workspace that models a final-year project as a graph of linked components (problem → gap → objectives → questions → methods → evidence → results → conclusions) and continuously checks that the chain holds.

## Run it

Requires Node 22.5+ (uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env      # add at least one AI key (GEMINI_API_KEY or GROQ_API_KEY)
npm run seed              # optional: a demo project with deliberate flaws for the engine to find
npm run dev               # API on :3001, app on http://localhost:5173
```

Production: `npm run build && npm start` → http://localhost:3001.

Other scripts: `npm test` (integrity engine unit tests), `npm run typecheck`.

## What's in the MVP

| PRD | Where |
| --- | --- |
| FR-01 Project creation | Projects page |
| FR-02 Idea Lab — interrogates the idea, editable Opportunity Brief, questions to answer | Idea Lab |
| FR-03 Blueprint — linked components, objective-chain matrix | Blueprint |
| FR-04 Research workspace — PDF, URL, notes, manual refs, datasets; AI extraction | Research |
| FR-05 Evidence Ledger — assertion vs evidence-backed claim | Evidence Ledger |
| FR-06 Knowledge graph + impact warnings before deletion | Knowledge Graph, delete dialogs |
| FR-07 Integrity Engine (checks A–H), health score, structured report | Project Check, Overview |
| FR-08 Writing assistant with per-statement traceability | Writing Assistant |
| FR-09 Supervisor feedback → tracked actions | Supervisor Feedback |
| FR-10 Defense simulator (text or voice), readiness | Defense Simulator |
| NFR-01/05 Traceability & provenance labels | Everywhere (`verified` / `user` / `ai_inference` / `ai_suggestion` / `unknown`) |
| NFR-02 User control — AI output is a suggestion until accepted | Blueprint, Research, Writing |
| NFR-03 Versioning with diffs and restore | "vN" button on every component |
| Report as an output of the model | Report (+ Markdown export) |

## Architecture

```
server/
  db.ts          SQLite schema + data access (nodes, edges, versions, runs, feedback, defense)
  graph.ts       In-memory project graph: traversal, impact analysis, LLM context serialisation
  integrity.ts   Deterministic rule checks + AI checks (B, D, G, H) + metrics
  ai.ts          AI reasoning layer — structured JSON prompts, all output validated against the graph
  llm.ts         OpenAI-compatible client with provider fallback (Gemini → Groq → Mistral → OpenRouter)
  report.ts      Compiles the report from the graph, keeping per-paragraph provenance
  extract.ts     PDF / URL / text extraction
shared/model.ts  Domain model shared by client and server (node types, allowed relations, provenance)
src/             React client (Vite); pages/ holds one file per workspace section
```

Key design choices:

- **The graph is the product.** Every component is a typed node; relationships are typed edges restricted to `ALLOWED_RELATIONS` in [shared/model.ts](shared/model.ts).
- **Hybrid integrity engine.** Structural questions (does every objective reach a conclusion? does every claim have evidence?) are answered by rules, which are fast, deterministic and tested. The LLM is used only for semantic checks: methodology fit, gap support, scope drift and contradictions. AI findings that restate a rule finding are dropped.
- **Stage-aware.** Missing results or conclusions are informational during ideation, proposal, literature review and methodology, and become warnings once implementation starts.
- **No silent changes.** AI-generated components and links are stored with `status = 'suggested'` and are excluded from checks until the student accepts them.
- **Traceable AI output.** Prompts reference components by id. Model-returned ids are validated against the graph, and a statement that claims project backing without a valid reference is downgraded to `ai_inference`.

## Configuration

| Variable | Default |
| --- | --- |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` | at least one required for AI features |
| `LLM_PROVIDERS` | `gemini,groq,mistral,openrouter` (order tried) |
| `GEMINI_MODEL` / `GROQ_MODEL` / `MISTRAL_MODEL` / `OPENROUTER_MODEL` | `gemini-2.5-flash` / `openai/gpt-oss-120b` / `mistral-small-latest` / `meta-llama/llama-3.3-70b-instruct` |
| `DB_PATH` | `data/projguard.db` |
| `PORT` | `3001` |

Without any key, the structural checks, graph, ledger, feedback tracking and report all still work.

## Not yet built

- Accounts / sign-up. The MVP is single-user and local; the data model is per-project, so users can be added on top.
- Supervisor, department and university views (PRD §28).
- Collaborative editing, and syncing with citation managers.
