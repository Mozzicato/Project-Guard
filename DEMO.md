# Project Compiler — Demo Script

The demo tells one story in about 10 minutes:

1. A student opens the app and always knows the next step, on a guided path.
2. A rough idea becomes a structured project in under a minute.
3. The system catches the flaws an examiner would find, and the student fixes one live.
4. **Hardware projects get their own path**: requirements → design → build & test, with every spec traced to a measured test.
5. The defense simulator exposes a weak answer.

Show the product doing things, and keep explanation to a minimum.

---

## 1. Before you present

**Demo account**

| | |
| --- | --- |
| Email | `demo@projectcompiler.local` |
| Password | `demo-password` |
| Research demo | "Detecting Fake News in Nigerian Pidgin on WhatsApp": health 68, 1 critical, 5 warnings |
| Hardware demo | "Solar-Powered Automatic Irrigation Controller for Smallholder Farms": 5 requirements, 9 components (₦51,300 total), 1 failed test |

Judges don't need the password: the sign-in page has an **Explore the demo project** button that signs straight into this account. Everyone who uses it shares the same two projects, so one judge's edits show up for the others.

**Planted flaws the engine will find**

| Project | Flaw | Caught by |
| --- | --- | --- |
| Research | Method is regression, but the problem is classification | AI check (critical) |
| Research | A source challenges the research gap; conclusion claims "national deployment" | AI checks |
| Research | "Over 60% of Nigerians share news without verifying" has no evidence | Rule check (critical) |
| Hardware | "Detect dry soil" has no target value, so it can't be measured | Rule check |
| Hardware | "SMS alert within 60 s" and "Detect dry soil" have no test | Rule check (critical) |
| Hardware | Battery runtime test **failed** (5.5 h measured vs ≥ 8 h) | Rule check |
| Hardware | Relay contacts rated 2 A, but the pump draws 3 A | AI check |
| Hardware | Buzzer not traced to any requirement; LCD has no price | Rule check |

**The day before**

- [x] Turso database connected; demo account seeded.
- [ ] **Add the hardware demo to the live database** (once): `npm run seed:hardware`. It adds only the hardware project to the existing demo account.
- [ ] **Vercel environment variables** (Settings → Environment Variables): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`. Redeploy after any change.
- [ ] **Open the production domain in a private window.** You should see the sign-in page, not a Vercel login. If you see a Vercel login, turn off Deployment Protection (Settings → Deployment Protection → Vercel Authentication).
- [ ] **Click Explore the demo project** and open both projects.
- [ ] **Rehearse the full run once.** It changes the demo projects, so reset afterwards (section 6).
- [ ] **Record a backup video** of the full run, in case the Wi-Fi or an AI provider fails on the day.

**30 minutes before**

- [ ] Use **Chrome or Edge** (voice answers need them). Allow microphone access and test it once.
- [ ] Browser zoom **110–125%**.
- [ ] One tab on the live site, **signed out**, showing the sign-in page.
- [ ] Copy the idea text below. Close notifications, Slack and email.

**Idea text for Scene 1:**
> I want to study why smallholder farmers in Kano are not adopting solar-powered irrigation pumps even though they are cheaper in the long run.

---

## 2. Run of show (10 minutes)

### Part A: the guided path (0:00–2:30)

| Time | Screen | What you do | What you say |
| --- | --- | --- | --- |
| 0:00 | **Sign-in page** | Point at the chain on the left: Problem → Gap → Objectives → **Method ⚠** → … → Defense | "Final-year students treat their project as a document. Examiners treat it as a system: this chain. When one link breaks, it shows up at the defense. We don't write the project. We make sure the student can defend it." |
| 0:30 | Sign-in page | Click **Explore the demo project** | "Anyone can try it in one click." |
| 0:40 | **Projects** → **+ New project** | Keep **Research, software or study** selected → paste the idea → discipline "Agricultural Economics" → leave the title blank → **Create & analyse my idea** | "Two kinds of project: research, and hardware builds. More on hardware later." While it loads (~15s): "All a student needs is their idea. The analysis starts by itself." |
| 1:15 | **Step 1 — Shape your idea** | Point at the gradient banner, then the **Your tasks** checklist, then the brief's provenance labels and questions | "Every step looks like this: what the step is, why it matters, and a checklist of tasks that tick themselves off from the student's real work. It proposed an academic title, labels where every point came from, and asks the questions a supervisor would." |
| 1:50 | **Home** (sidebar) | Point at the purple greeting card and the **path**: the pulsing *Next* node, the ticked steps | "Home is a path, like a learning app. The student never has to wonder what to do next: one big button, one next step." |

### Part B: the examiner's eye (2:30–5:30)

| Time | Screen | What you do | What you say |
| --- | --- | --- | --- |
| 2:30 | **Projects** (logo, top left) → **Detecting Fake News…** | Point at the red **1** badge on *Back your claims* in the sidebar | "A project six weeks in. The path already flags a claim with no evidence." |
| 2:45 | **Check your project** (step 5) | Tick **Include AI reasoning** → **Re-run check** (~20s) | "Structural rules run instantly. AI only handles what rules can't see: does the method actually answer the question?" |
| 3:10 | Check results | Expand the top **Critical** issue | **Moment 1** (section 3). Scroll to the contested gap and the "national deployment" scope drift. |
| 4:00 | **Blueprint** → method *"Regression model of message credibility"* | **Edit** → *"Fine-tune AfroXLMR as a binary classifier (fake / genuine); evaluate with macro F1."* → Save → **Check your project** → **Re-run check** | **Moment 2** (section 3): the critical issue disappears and the score rises. Click **v2** on the method to show the version diff. |
| 5:00 | **Knowledge Graph** (Tools) | Click the objective *"Train and evaluate a Pidgin fake-news classifier"* | "Everything that depends on this objective lights up. Every change has consequences." |

### Part C: hardware projects (5:30–8:00)

| Time | Screen | What you do | What you say |
| --- | --- | --- | --- |
| 5:30 | **Projects** → **Solar-Powered Automatic Irrigation Controller** → **Home** | Point at the 7-step path: *Define requirements → Review related work → Design the system → Build & test* | "Engineering students don't have research questions; they build things. So hardware projects get their own path, the one used in engineering capstones: requirements, design, build, test." |
| 5:50 | **Step 2 — Define requirements** | Point at **Measurable 4/5**. In the *"Detect dry soil"* row, type target **≤ 30** and unit **% moisture**, then press Enter | **Moment 3** (section 3): the last task ticks, the step completes and the celebration appears. Click **Stay here**. |
| 6:40 | **Step 4 — Design the system** | Point at the block diagram (drawn from text), the **bill of materials** total (₦51,300) and the requirement-coverage chips | "Every part is costed and justified against a requirement. The block diagram is written as plain lines and drawn automatically." |
| 7:10 | **Step 5 — Build & test** | Point at the **traceability matrix**: the red *fail* on the battery test, the *+ Add a test* rows | "This is what engineering examiners look for: requirement, then design, then test, then measured result. The battery test failed at 5.5 hours against 8, and it's flagged, not hidden." |
| 7:40 | **Check your project** | **Re-run check** with AI reasoning | "Rules catch the untested requirements. The AI catches what a lecturer would: a relay rated 2 amps driving a 3-amp pump." |

### Part D: the defense (8:00–10:00)

| Time | Screen | What you do | What you say |
| --- | --- | --- | --- |
| 8:00 | Research project → **Rehearse your defense** (step 6) | **Generate questions** (~15s) → pick a **high-risk** methodology question → **Answer by voice** with the weak answer below → **Submit** | **Moment 4** (section 3): unsupported claims, the contradiction, and follow-up questions. |
| 9:10 | **Report** (Tools) | Scroll to a `[MISSING: …]` marker | "The report is compiled from the project model. Where content is missing it says MISSING instead of inventing it." |
| 9:30 | **Home** | Point at the path | "Idea, evidence, design, validation, defense. The student does the work. Project Compiler makes it harder for it to fall apart." |

**Weak answer to speak in the Defense Simulator:**
> "I chose a regression model because it gives a credibility score. It performed well with an F1 of 0.81, and the system is ready for national deployment."

---

## 3. The moments to land

Slow down and let the screen speak before you explain.

**Moment 1: it catches what a human examiner would.**
> "The problem statement says binary classification. The method says regression with mean squared error. A panel would catch this in five minutes. The system caught it, said why it matters, pointed at the exact components, and said what to do next."

**Moment 2: fix, re-run, score goes up.**
> "The student fixed it. Re-run. The critical issue is gone and the score went up. The old version is kept in history. That's the loop: the product measures whether real weaknesses get fixed."

**Moment 3: small wins keep students moving.**
> "One measurable target was missing. Watch the checklist. Step complete. Like a learning app, every finished step is celebrated, and the next one is one click away."

**Moment 4: the defense simulator knows the project.**
> "These questions come from this project's graph and its weak spots. The student gave a vague answer. The examiner flagged the unbacked claim, the contradiction with the fixed method, and the follow-up the panel would ask."

---

## 4. Likely questions

| Question | Short answer |
| --- | --- |
| Isn't this just ChatGPT? | No. The project is a graph of linked components. Structural checks are deterministic rules with unit tests. The AI only runs semantic checks, cites exact components, and everything it suggests needs the student's approval. |
| Does it write the project for students? | No. It drafts structure as suggestions, and the report shows `[MISSING: …]` where the student hasn't done the work. |
| Why a separate hardware path? | Engineering capstones are judged on requirements traceability: measurable specs, a justified design, and a test proving each spec. That is a different journey from a research project, so we built it as one. |
| Where do component prices come from? | The student enters them. AI-suggested prices are labelled "est." and must be confirmed. |
| Does it work outside computer science? | Yes: agricultural economics in Part A, electrical engineering in Part C. |
| What is the health score? | Not a grade. It's 100 minus 12 per critical issue, 4 per warning and 1 per info item. The headline metric is the Defensibility Rate: the share of critical components with valid supporting links. |
| Where does student data go? | Each student has their own account and only sees their own projects. Passwords are hashed; AI keys stay on the server. |
| How can we try it? | Click **Explore the demo project** on the sign-in page, or create an account and start from your own idea. |
| What's next? | Supervisor and department views, password reset, larger uploads, and schematic image uploads for hardware. |

---

## 5. If something breaks

| Problem | What to do |
| --- | --- |
| An AI step is slow (over 30s) | Keep talking. Gemini is tried first, then Groq. If it still hangs, switch to the backup video for that scene. |
| An AI step fails | Say "the AI provider is rate-limited — this is why the rule checks don't depend on it", and re-run with **Include AI reasoning** unticked. |
| The celebration doesn't appear in Part C | The requirement already had a target (someone edited the demo). Clear its target first, or just show the task checklist ticking. Reset before presenting (section 6). |
| The hardware project is missing | Run `npm run seed:hardware` with the live `TURSO_` values in `.env`. |
| Voice input doesn't work | Type the weak answer instead. |
| Judges see a Vercel login page | Share the production domain, or turn Deployment Protection off. |
| Live site is down | Run locally: `npm run build && npm start` → http://localhost:3001. Your `.env` points at the live database, so the demo account works locally too. |
| AI output differs from this script | Expected: the AI rephrases each time. The planted flaws are caught consistently; point at whichever shows first. |

---

## 6. Resetting the demo

A rehearsal changes the demo projects (the fixed method, the filled-in target, new check runs, generated questions, and the project you create in Scene 1). Judges using **Explore the demo project** can change them too. Before the real presentation:

1. Signed in as the demo account, open each project → **Home** → **Delete project** (right-hand panel).
2. Re-seed once, with the live `TURSO_` values in `.env`:
   ```bash
   npm run seed
   ```
   This recreates both demo projects.

Quick partial reset without re-seeding:
- Research: open the method *"Regression model of message credibility"* → **v2** → **Restore** version 1.
- Hardware: on **Define requirements**, clear the target and unit of *"Detect dry soil"*.
