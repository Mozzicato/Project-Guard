# Project Compiler — Demo Script

The demo tells one story in about 8 minutes:

1. A rough idea becomes a structured project.
2. The system catches the flaws an examiner would find.
3. The student fixes one flaw, and the score rises.
4. The defense simulator exposes a weak answer.

Show the product doing things, and keep explanation to a minimum.

---

## 1. Before you present

**Demo account (already set up on the live database)**

| | |
| --- | --- |
| Email | `demo@projectcompiler.local` |
| Password | `demo-password` |
| Project | "Detecting Fake News in Nigerian Pidgin on WhatsApp" — 29 components, 32 links, 1 open feedback item |
| Starting state | Health 68 · 1 critical · 5 warnings |

Only the demo account can see this project. **Don't re-run the seed:** each run adds another copy of the project.

Judges don't need the password: the sign-in page has an **Explore the demo project** button that signs straight into this account. Everyone who uses it shares the same project, so one judge's edits show up for the others.

**The day before**

- [x] Turso database connected (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` in `.env`).
- [x] Demo account and flawed demo project seeded into the live database.
- [ ] **Vercel environment variables** (Settings → Environment Variables): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`. Redeploy after any change.
- [ ] **Open the live site's production domain in a private window.** You should see the Project Compiler sign-in page, not a Vercel login. If you see a Vercel login, turn off Deployment Protection (Settings → Deployment Protection → Vercel Authentication).
- [ ] **Click Explore the demo project** and confirm the demo project's Overview shows health 68.
- [ ] **Run one Project Check** on the demo project, so the "Integrity over time" chart already has a starting point.
- [ ] **Rehearse the full run once on the live site.** Your edits change the demo project, so read "Resetting the demo" below before the real presentation.
- [ ] **Record a backup video** of the full run, in case the Wi-Fi or an AI provider fails on the day.

**30 minutes before**

- [ ] Use **Chrome or Edge**, because voice answers don't work in Firefox or Safari. Allow microphone access and test it once.
- [ ] Set browser zoom to **110–125%**, so the back row can read it.
- [ ] Open **one tab** on the live site, **signed out**, so the sign-in page is showing. (If you're signed in, use **Sign out** at the bottom of the sidebar.)
- [ ] Copy the idea text below to your clipboard.
- [ ] Close notifications, Slack and email.

**Idea text for Scene 1:**
> I want to study why smallholder farmers in Kano are not adopting solar-powered irrigation pumps even though they are cheaper in the long run.

---

## 2. Run of show (8 minutes)

| Time | Screen | What you do | What you say |
| --- | --- | --- | --- |
| 0:00 | **Sign-in page** | Point at the chain on the left panel: Problem → Gap → Objectives → **Method ⚠** → … → Defense | "Final-year students treat their project as a document. Examiners treat it as a system — this chain. When one link breaks, like a method that can't answer its objective, it shows up at the defense. We don't write the project. We make sure the student can defend it." |
| 0:30 | Sign-in page | Click **Explore the demo project** | "Anyone can try this with one click — no sign-up needed." |
| 0:40 | **Projects** → **Idea Lab** | **+ New project** → title "Solar irrigation adoption in Kano", discipline "Agricultural Economics" → paste the idea → **Create** → **Analyse my idea** | While it loads (~12s): "Notice this is not computer science. The Lab interrogates the idea instead of writing a report. Each part of the workspace has its own color — violet is the Idea Lab — so students always know where they are." |
| 1:15 | Idea Lab results | Point at the problem-clarity score, the provenance labels and the questions list | "Every field says where it came from: the student, an AI inference, an AI suggestion, or unknown. And it asks the questions the supervisor would ask." |
| 1:45 | **Blueprint** | **Suggest a blueprint** → wait ~15s → scroll the dashed cards → **Accept all** → **Objective chains** tab | "Suggestions are dashed. Nothing enters the project until the student accepts it. The chain view shows the problem immediately: no evidence, results or conclusions yet — normal at this stage." |
| 2:30 | **Projects** (click the **Project Compiler** logo, top left) → demo project → **Overview** | Open "Detecting Fake News in Nigerian Pidgin". Point at the red **1** badge on **Evidence Ledger** in the sidebar | "Now a project six weeks in. Health 68. The sidebar already flags one claim with no evidence. Let's see what an examiner would see." |
| 2:50 | **Project Check** (red) | Tick **Include AI reasoning** → **Re-run check** (~20s) | While it runs: "Structural checks are instant and deterministic. AI only handles what rules can't see — does the method actually answer the question?" |
| 3:15 | Check results | Expand the top **Critical** issue | **Moment 1** (see section 3): regression method for a classification problem. Scroll to show the contested gap and the "national deployment" scope drift. |
| 4:15 | **Knowledge Graph** | Click the objective **"Train and evaluate a Pidgin fake-news classifier"** | "The whole chain lights up — everything that depends on this objective. Colors match component types everywhere in the app: blue objectives, violet methods, green evidence." |
| 4:45 | **Blueprint** | On that objective, click **✕** (delete) → show the warning → **Cancel** | "Every change has consequences. Before you delete, it tells you what breaks." |
| 5:00 | **Blueprint → Method "Regression model of message credibility"** | **Edit** → change the text to *"Fine-tune AfroXLMR as a binary classifier (fake / genuine); evaluate with macro F1."* → Save → **Project Check** → **Re-run check** | **Moment 2** (see section 3): the critical issue disappears and the score goes up. Click the **v2** button to show the version diff. |
| 6:00 | **Defense Simulator** | **Generate questions** (~15s) → pick a **high-risk** methodology question → **Answer by voice** and say the weak answer below → **Submit** | **Moment 3** (see section 3): the examiner flags unsupported claims and contradictions, and gives follow-up questions. |
| 7:00 | **Writing Assistant** | Ask: *"Where does the claim that existing models perform poorly on Nigerian languages come from?"* | "Every statement is traced back to a component or source. Anything without a reference is labelled as AI reasoning, not presented as fact." |
| 7:30 | **Report** | Scroll to a `[MISSING: …]` marker | "The report is compiled from the project model. Where content is missing, it says MISSING instead of inventing it." |
| 7:45 | Overview | — | "Idea, evidence, project, validation, defense. The student does the research. Project Compiler makes it harder for the research to fall apart." |

**Weak answer to speak in the Defense Simulator:**
> "I chose a regression model because it gives a credibility score. It performed well with an F1 of 0.81, and the system is ready for national deployment."

(Use this even after fixing the method in the previous scene. The answer then contradicts the project, which the examiner catches.)

---

## 3. The three moments to land

Slow down at these three moments and let the screen speak before you explain.

**Moment 1: it catches what a human examiner would.**
> "The problem statement says binary classification. The method says regression with mean squared error. A panel would catch this in the first five minutes. The system caught it, told the student why it matters, pointed at the exact components, and said what to do next."

**Moment 2: fix, re-run, score goes up.**
> "The student fixed it. Re-run. The critical issue is gone and the health score went up. The previous version is kept in history. This is the loop: the product measures whether real weaknesses get fixed."

**Moment 3: the defense simulator knows the project.**
> "These questions aren't generic. They come from this project's graph and its weak spots. The student gave a vague answer. The examiner flagged the claim that isn't backed by the project, the contradiction with the fixed method, and the follow-up the panel would ask."

---

## 4. Likely questions

| Question | Short answer |
| --- | --- |
| Isn't this just ChatGPT? | No. The project is a graph of linked components. Structural checks are deterministic rules with unit tests. The AI only runs semantic checks, cites the exact components, and everything it suggests needs the student's approval. |
| Does it write the project for students? | No. Drafting inserts `[MISSING: …]` where the project lacks content instead of inventing it. The report is compiled from what the student actually built. |
| How reliable are the AI findings? | They're labelled "AI reasoning" and always point at specific components the student can check. Rule findings and AI findings are kept separate, and AI findings that repeat a rule finding are dropped. |
| Does it work outside computer science? | Yes. The Idea Lab demo was agricultural economics, and it suggested surveys, focus groups and interviews rather than software methods. |
| What is the health score? | Not a grade. It's the system's view of completeness and internal consistency: 100 minus 12 per critical issue, 4 per warning and 1 per info item. The headline metric is the Defensibility Rate: the share of critical components with valid supporting links. |
| Where does student data go? | Each student has their own account and sees only their own projects. Passwords are hashed, and AI keys stay on the server. |
| How can we try it ourselves? | Open the site and click **Explore the demo project** — no sign-up needed. Or create an account in 10 seconds and start from your own idea; your projects are private to your account. |
| What's next? | Supervisor and department views (supervisors see their students' project health), password reset, and larger uploads. |

---

## 5. If something breaks

| Problem | What to do |
| --- | --- |
| An AI step is slow (over 30s) | Keep talking through the "What you say" line. Gemini is tried first, then Groq. If it still hangs, switch to the backup video for that scene. |
| An AI step fails with an error | Say "the AI provider is rate-limited — this is why the structural checks don't depend on it", and re-run with **Include AI reasoning** unticked to show the rule checks. |
| Voice input doesn't work | Type the weak answer instead. It's the same text. |
| "Explore the demo project" says the demo isn't available | The demo account is missing from the live database. Create an account to continue, and re-seed afterwards (section 6). |
| Judges see a Vercel login page instead of the app | You shared a preview URL, or Deployment Protection is on. Share the production domain, or turn protection off (Settings → Deployment Protection). |
| Live site is down or can't sign in | Run it locally: `npm run build && npm start` → http://localhost:3001. Your `.env` points at the live Turso database, so the demo account works locally too. If Turso itself is down, comment out the two `TURSO_` lines, run `npm run seed`, and use the local copy. |
| No internet at all | Play the backup video, narrating over it with this script. |
| AI output differs from this script | That's expected, because the AI rephrases each time. The planted flaws (regression vs classification, the contested gap, "national deployment") are caught consistently. Point at whichever one shows first. |

---

## 6. Resetting the demo

A rehearsal changes the demo project: the fixed method, new check runs, generated defense questions, and the Idea Lab project you create in Scene 1. Judges who click **Explore the demo project** can change it too. To get back to the planted flaws before the real presentation:

1. Signed in as the demo account, open each project (the **demo project** and the **Solar irrigation** one) → **Overview** → **Delete project** (under the Stage selector).
2. Re-seed once:
   ```bash
   node --env-file=.env --import tsx server/seed.ts
   ```
3. Run one Project Check so the chart has a starting point again.

Or, to reset just the key flaw without re-seeding, open the method **"Regression model of message credibility"** → click **v2** → **Restore** version 1.
