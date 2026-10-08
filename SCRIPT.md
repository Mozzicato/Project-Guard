# Project Compiler: 5-Minute Live Demo Script (Finals)

**The story in one line:** a student starts with a rough idea, the app guides them step by step, catches the flaws an examiner would, handles engineering projects too, and rehearses the defense with them.

**The rule for a live demo:** anything that makes the AI think for 15–20 seconds is done **before** you go on stage, except one live moment you choose on purpose (creating a project). On stage, you mostly open results that are already there.

---

## 1. What you're using

**One account for the whole demo: the demo account.** You never create an account on stage. On the sign-in page, click **Explore the demo project**. (Backup login: `demo@projectcompiler.local` / `demo-password`.)

Inside it you use **three projects**:

| | Project | Already exists? | What it shows |
| --- | --- | --- | --- |
| **A** | A new project you create live | No, you create it at 0:40 | How a student starts from a rough idea |
| **B** | **Detecting Fake News in Nigerian Pidgin on WhatsApp** | Yes | A research project with flaws an examiner would catch |
| **C** | **Solar-Powered Automatic Irrigation Controller for Smallholder Farms** | Yes | A hardware (engineering) project with its own path |

**Getting around:** the **Project Compiler** logo (top left) always takes you back to the list of projects. Inside a project, the **left sidebar** lists its steps.

---

## 2. Prepare (the day before and 1 hour before)

### The day before

1. Open the live site's **main address** in a private/incognito window. You must see the Project Compiler sign-in page (purple panel on the left), **not** a Vercel login. If you see Vercel, go to Vercel → project → Settings → Deployment Protection → turn off Vercel Authentication.
2. Rehearse the full script **twice**, with a timer.
3. **Record a backup video** of one full run (screen recording). If the internet fails on the day, you play this and narrate.

### 1 hour before

Open the live site in **Chrome or Edge** → **Explore the demo project**, then:

1. **Delete any old practice projects.** On the Projects page, any project other than B and C: open it → **Home** → **Delete project** (right-hand panel).
2. **Project B, run the check:** open **Detecting Fake News…** → sidebar **Check your project** → tick **Include AI reasoning** → **Run project check** (or **Re-run check**). Wait ~20 s. Make sure the top issue is **Critical** and mentions **regression** and **classification**. If not, run it again.
3. **Project B, prepare the defense answer:** sidebar **Rehearse your defense** → **Generate questions** (~15 s) → click a **high risk** question about the method → type:
   > I chose a regression model because it gives a credibility score. It performed well with an F1 of 0.81, and the system is ready for national deployment.

   → **Submit answer** (~10 s).
4. **Project C, run the check:** logo → **Solar-Powered Automatic Irrigation…** → **Check your project** → tick **Include AI reasoning** → **Run project check**. Wait ~20 s.
5. **Project C, set up the live moment:** sidebar **Define requirements** → row **"Detect dry soil"** → make sure **Target** and **Unit** are **empty** (clear them if not). The tile should say **Measurable 4/5**.
6. **Sign out** (bottom of the sidebar) so the sign-in page is showing.
7. Copy the idea text (below) so it's ready to paste. Set browser zoom to **125%**. Turn off notifications. Close every other tab.

**Idea text (for 0:40):**
> I want to study why smallholder farmers in Kano are not adopting solar-powered irrigation pumps even though they are cheaper in the long run.

---

## 3. The script (5:00)

### 0:00–0:40: the problem
**Screen:** sign-in page.

- **Say:** "Every year, thousands of final-year students lose marks, or fail their defense, because of a flaw they never saw: a method that can't answer the objective, a research gap that's already been filled, a claim with no evidence."
- Point at the coloured chain on the left (*Problem → Gap → Objectives → Method ⚠ → … → Defense*).
- **Say:** "Students treat their project as a document. Examiners treat it as a system: this chain. Project Compiler checks every link, like an examiner would. And it never writes the project for the student."
- Click **Explore the demo project**.

### 0:40–1:40: a student starts from a rough idea (live: Project A)

1. Click **+ New project** (top right). Leave **Research, software or study** selected.
2. Paste the idea into **"What is your project about?"**. In **Discipline**, type **Agricultural Economics**. Leave **Working title** empty.
3. Click **Create & analyse my idea**.
   - While it loads (~15 s), **say:** "A student starts with nothing but a rough idea, not even a title. It works for any discipline. This one is agricultural economics."
4. When the results appear, point at:
   - **The new title in the left sidebar.** "It proposed a proper academic title."
   - **The coloured banner and its "Your tasks" checklist.** "Every step tells the student what to do, and ticks itself off as they work."
   - **The small labels** on the brief ("AI inference", "AI suggestion", "Unknown"). "It separates what the student said from what the AI inferred, and never passes a guess off as fact."
   - **The questions list.** "And it asks the hard questions a supervisor would, on day one."

> **If it takes more than 25 seconds:** say "it's thinking about the idea, so let me show you a project that's further along", and go straight to the next scene.

### 1:40–2:00: the guided path (Project B)

1. Click the **Project Compiler** logo → **Detecting Fake News in Nigerian Pidgin on WhatsApp**. You land on its **Home**.
2. Point at the **path** of big circles and the purple card's button.
   - **Say:** "Six weeks later, a student sees their project as a path, like a learning app: what's done, and the one next step. The red badge in the sidebar already warns about a claim with no evidence."

### 2:00–2:50: it catches what an examiner would (Project B)

1. Sidebar → **Check your project**. Results are already there.
2. Click the top **Critical** issue to open it.
   - **Say:** "The problem statement says this is a classification problem. The method uses regression. A panel would catch this in five minutes. We caught it, explained why it matters, pointed at the exact parts of the project, and said what to do next."
3. Point at the **health score**, and quickly at one more issue (a source that **challenges the research gap**, or the **"national deployment"** claim).
   - **Say:** "Fixed rules check the structure instantly. The AI judges the meaning. And nothing the AI suggests goes into the project until the student accepts it."

### 2:50–3:20: rehearse the defense (Project B)

1. Sidebar → **Rehearse your defense**. Click the question you answered during preparation.
2. Point at the scores, then the red **Contradicts your project** and **Unsupported claims** sections, then **Likely follow-up questions**.
   - **Say:** "The questions come from this project's own weak spots. This student gave a vague answer. The examiner caught the unsupported claim and the contradiction, and shows the follow-up questions a real panel would ask."

### 3:20–4:30: engineering projects (Project C)

1. Click the **Project Compiler** logo → **Solar-Powered Automatic Irrigation Controller…**.
   - **Say:** "Engineering students don't write research questions; they build things. So hardware projects get their own path, the one engineering departments use: requirements, design, build, test."
2. Sidebar → **Define requirements**. Point at **Measurable 4/5**.
3. In the **"Detect dry soil"** row, type **≤ 30** in **Target** and **% moisture** in **Unit**, then press **Enter**.
   - The checklist completes and **"Step 2 complete!"** pops up with confetti.
   - **Say:** "Every requirement must be measurable. One wasn't. Now it is, and the step is complete. Small wins keep students moving."
4. Click **Stay here** → sidebar **Build & test**. Point at the **Traceability matrix** and the red **fail** on the battery test.
   - **Say:** "Every requirement is traced to its design and a measured test. The battery lasted 5.5 hours against a target of 8. It's flagged, not hidden."
5. Sidebar → **Check your project** (results already there). Point at the **relay** issue if it's there, otherwise a **"has no test"** critical issue.
   - **Say:** "And it spots what a lecturer would: a relay rated 2 amps driving a 3-amp pump."

### 4:30–5:00: close

1. Sidebar → **Home**.
2. **Say:** "Project Compiler is a guided path from idea to defense, for research and engineering projects. It checks every link like an examiner, keeps AI honest, and rehearses the defense. The student does the work. We make sure they can defend it. Next, we're piloting with final-year students and supervisors. Thank you."

---

## 4. If something goes wrong on stage

Stay calm and keep talking. Judges care more about how you handle it than the glitch itself.

| Problem | What to do |
| --- | --- |
| The idea analysis is slow | After 25 s, say "it's still thinking, so let me show a project that's further along" and move to Project B. Come back to Project A at the end if there's time. |
| A page shows an AI error | "The AI provider is busy, but the core checks don't depend on it." Point at the issues marked **rule**. |
| No confetti in Project C | The target was already filled. Point at the ticked checklist and move on. |
| The check results look different | The AI words things differently each time. Point at whichever **Critical** issue is on top. |
| Project B or C is missing | Play the backup video for that part. |
| No internet / site won't load | Play the backup video and narrate with this script. |

---

## 5. Questions the judges will probably ask

Keep answers short: one or two sentences, then stop.

| Question | Answer |
| --- | --- |
| Isn't this just ChatGPT? | No. ChatGPT writes text; it doesn't know your whole project. We map the project as linked parts, check them with fixed rules plus AI, and the AI never writes the project. |
| Won't students use it to cheat? | It can't write their project. It checks and questions their work, and the report even marks what they haven't done as `[MISSING]`. It makes ghost-written projects harder to defend, not easier. |
| How accurate is the AI? | The structural checks are fixed rules, not AI. The AI's findings are labelled, point at exact parts of the project, and the student decides. In testing it consistently caught the flaws we planted. |
| Who pays? | Students individually at a low price, and universities or departments for all their final-year students, with supervisor dashboards next. |
| Who are your competitors? | Chatbots, writing tools (Grammarly, QuillBot, Jenni AI), research tools (Elicit, SciSpace) and project-material websites. They help produce text; none checks that the project holds together, and none supports hardware projects. |
| What's next? | Pilot with final-year students and supervisors, a supervisor dashboard, and uploading schematics and photos for hardware projects. |
| What did you use to build it? | React and TypeScript, Node.js, a Turso database, hosted on Vercel. The AI is Google Gemini, with Groq as a backup. |
| Does it work offline / on phones? | It runs in any modern browser and is designed for laptops, which is where students write their projects; a fuller phone layout is on our roadmap. It needs internet for the AI features. |

---

## 6. After the demo

Reset for the next time, either way:

- **Full reset (recommended):** on the computer with the project code, run `npm run reset-demo`. It deletes only the demo account's projects (other users are never touched) and recreates Projects B and C fresh. Then redo the "1 hour before" steps in Section 2.
- **Quick reset in the app:** delete **Project A** (open it → **Home** → **Delete project**), then Project C → **Define requirements** → "Detect dry soil" → clear **Target** and **Unit**.
