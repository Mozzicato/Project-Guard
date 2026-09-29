# Project Compiler

**From idea to defensible research.** We don't write your project — we make sure you can defend it.

An MVP of the product described in [prd.md](prd.md): a research workspace that models a final-year project as a graph of linked components (problem → gap → objectives → questions → methods → evidence → results → conclusions) and continuously checks that the chain holds.

## Run it

Requires Node 20+.

```bash
npm install
cp .env.example .env      # add at least one AI key (GEMINI_API_KEY or GROQ_API_KEY)
npm run seed              # optional: research + hardware demo projects with deliberate flaws
                          # sign in as demo@projectcompiler.local / demo-password, or click "Explore the demo project"
npm run dev               # API on :3001, app on http://localhost:5173
```

Production: `npm run build && npm start` → http://localhost:3001.

## Deploy to Vercel

1. Create a Turso database: `turso db create project-compiler`, then `turso db show --url project-compiler` and `turso db tokens create project-compiler`.
2. Import the GitHub repo in Vercel. The settings come from [vercel.json](vercel.json): Vite builds the frontend, and [api/index.ts](api/index.ts) serves the API as one function with a 60s limit, because AI calls take 10–30s.
3. Add these environment variables in Vercel:
   - `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
   - `SESSION_SECRET` (generate one with `openssl rand -hex 32`)
   - at least one AI key: `GEMINI_API_KEY` or `GROQ_API_KEY`
4. Deploy. The schema is created automatically on the first request.

Uploads are capped at 4 MB, because Vercel rejects larger request bodies.

Other scripts: `npm test` (integrity engine unit tests), `npm run typecheck`.

## Two guided tracks

Every project follows a guided path. Each step has a short checklist of tasks that tick themselves off from the project's real data, a Continue bar, and a celebration when the step is completed. Home shows the whole path.

| Research / software / study (6 steps) | Hardware / engineering build (7 steps) |
| --- | --- |
| 1. Shape your idea | 1. Shape your idea |
| 2. Build the blueprint (problem, gap, objectives, questions, methods) | 2. Define requirements (measurable engineering specs, each with a target and verification method) |
| 3. Gather research | 3. Review related work |
| 4. Back your claims | 4. Design the system (block diagram, calculations, components, bill of materials and cost) |
| 5. Check your project | 5. Build & test (a test per requirement, measured value, pass/fail; build log) |
| 6. Rehearse your defense | 6. Check your project (includes requirement → design → test traceability) |
| | 7. Rehearse your defense |

The hardware track follows engineering capstone practice: customer needs become verifiable engineering specifications, each realised in the design and proven by a test (a requirements traceability matrix). Its report compiles to *System Design and Methodology* and *Construction, Testing and Results* chapters. `npm run seed:hardware` adds just the hardware demo to an existing demo account.

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
| Accounts | Local email + password sign-in; each student sees only their own projects |
| NFR-02 User control — AI output is a suggestion until accepted | Blueprint, Research, Writing |
| NFR-03 Versioning with diffs and restore | "vN" button on every component |
| Report as an output of the model | Report (+ Markdown export) |

## Architecture

```
server/
  app.ts         Express app with all API routes (shared by the local server and the Vercel function)
  db.ts          libSQL data access: Turso when TURSO_DATABASE_URL is set, otherwise a local SQLite file
  graph.ts       In-memory project graph: traversal, impact analysis, LLM context serialisation
  integrity.ts   Deterministic rule checks + AI checks (B, D, G, H) + metrics
  ai.ts          AI reasoning layer — structured JSON prompts, all output validated against the graph
  llm.ts         OpenAI-compatible client with provider fallback (Gemini → Groq → Mistral → OpenRouter)
  auth.ts        Local accounts: scrypt password hashing, HMAC-signed session cookie, login throttling
  report.ts      Compiles the report from the graph (research or engineering chapters), keeping per-paragraph provenance
  seed*.ts       Demo data: a research project and a hardware project, each with planted flaws
  extract.ts     PDF / URL / text extraction
shared/model.ts  Domain model shared by client and server (node types, allowed relations, provenance)
src/             React client (Vite); pages/ holds one file per workspace section; journey.tsx defines the guided steps
```

Key design choices:

- **The graph is the product.** Every component is a typed node; relationships are typed edges restricted to `ALLOWED_RELATIONS` in [shared/model.ts](shared/model.ts).
- **Hybrid integrity engine.** Structural questions (does every objective reach a conclusion? does every claim have evidence?) are answered by rules, which are fast, deterministic and tested. The LLM is used only for semantic checks: methodology fit, gap support, scope drift and contradictions. AI findings that restate a rule finding are dropped.
- **Track-aware.** Hardware projects are checked on requirement traceability (checks R and V): every requirement measurable, realised in the design and verified by a passing test; parts costed and justified.
- **Stage-aware.** Missing results or conclusions are informational during ideation, proposal, literature review and methodology, and become warnings once implementation starts.
- **No silent changes.** AI-generated components and links are stored with `status = 'suggested'` and are excluded from checks until the student accepts them.
- **Traceable AI output.** Prompts reference components by id. Model-returned ids are validated against the graph, and a statement that claims project backing without a valid reference is downgraded to `ai_inference`.

## Configuration

| Variable | Default |
| --- | --- |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY` | at least one required for AI features |
| `LLM_PROVIDERS` | `gemini,groq,mistral,openrouter` (order tried) |
| `GEMINI_MODEL` / `GROQ_MODEL` / `MISTRAL_MODEL` / `OPENROUTER_MODEL` | `gemini-2.5-flash` / `openai/gpt-oss-120b` / `mistral-small-latest` / `meta-llama/llama-3.3-70b-instruct` |
| `SESSION_SECRET` | random value stored in the DB — **set it explicitly in production** (e.g. `openssl rand -hex 32`) |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | unset → local file |
| `DB_PATH` | `data/projguard.db` (local file, used only when Turso isn't configured) |
| `PORT` | `3001` |

Without any key, the structural checks, graph, ledger, feedback tracking and report all still work.

## Not yet built

- Password reset and email verification (accounts are local email + password only).
- Supervisor, department and university views (PRD §28).
- Collaborative editing, and syncing with citation managers.
