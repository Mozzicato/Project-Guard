# PROJECT COMPILER

### From idea to defensible research.

**Product Type:** AI-powered research development and integrity platform
**Primary Users:** Final-year undergraduate students
**Secondary Users:** Project supervisors, departments, institutions
**MVP Goal:** Help a student transform an initial project idea into a structured, evidence-backed, internally consistent project and identify weaknesses before supervisor review or final defense.

---

# 1. Product Vision

Project Compiler is a structured research workspace that continuously evaluates a student's final-year project for:

* logical inconsistencies
* missing evidence
* unsupported claims
* objective/result mismatches
* methodology problems
* research-gap weaknesses
* incomplete project components
* supervisor feedback that has not been addressed
* defense vulnerabilities

The product should **assist the student in doing the research**, rather than simply generating a project for them.

### Core promise

> **We don't write your project. We make sure you can defend it.**

---

# 2. Problem Statement

Final-year students typically treat their project as a document-writing exercise.

In reality, a project is a connected research system:

```text
Problem
   ↓
Research Gap
   ↓
Objectives
   ↓
Research Questions
   ↓
Methodology
   ↓
Evidence
   ↓
Results
   ↓
Conclusions
   ↓
Defense
```

An error introduced at one stage can propagate into later stages.

For example:

```text
Poor Objective
      ↓
Wrong Methodology
      ↓
Wrong Data
      ↓
Irrelevant Results
      ↓
Weak Conclusion
      ↓
Defense Vulnerability
```

Most existing student tools address isolated activities such as writing, citation management, document editing, or project tracking.

Project Compiler focuses on the **relationships between those activities**.

---

# 3. Product Thesis

The fundamental unit of the product should NOT be the document.

It should be the:

> **Research relationship.**

Examples:

```text
Objective → Method
Objective → Result
Claim → Evidence
Research Gap → Contribution
Result → Conclusion
Supervisor Feedback → Revision
Defense Question → Project Evidence
```

The system's job is to continuously validate these relationships.

---

# 4. Target User

## Primary Persona

### Final-Year Undergraduate Student

Typical characteristics:

* has an assigned or self-selected project topic
* works under a supervisor
* must produce a formal project/research report
* has limited research experience
* struggles with structuring and narrowing the project
* receives fragmented supervisor feedback
* may use multiple disconnected tools
* needs to eventually defend the project orally

The product should support multiple disciplines without assuming that every project follows the same methodology.

---

# 5. Core Product Architecture

```text
                    PROJECT COMPILER
                           │
                           ↓
                  PROJECT KNOWLEDGE GRAPH
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
   PROJECT DATA        EVIDENCE            FEEDBACK
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ↓
                  INTEGRITY ENGINE
                           │
       ┌───────────────────┼───────────────────┐
       ↓                   ↓                   ↓
  Consistency          Evidence            Coverage
   Analysis             Analysis            Analysis
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ↓
                    AI REASONING LAYER
                           │
              ┌────────────┼────────────┐
              ↓            ↓            ↓
          Research      Writing      Defense
```

---

# 6. MVP Scope

The MVP consists of six major capabilities:

1. Project Creation
2. Project Blueprint
3. Research & Evidence Workspace
4. Project Knowledge Graph
5. Project Integrity Engine
6. Defense Simulator

The MVP should **not** attempt to build the complete university workflow.

---

# 7. Feature Requirements

## FR-01 — Project Creation

The student can create a project.

### Inputs

* Project title
* Discipline
* Department
* Institution
* Project type
* Current project stage
* Initial project idea

### System output

A project workspace containing:

```text
Project
├── Overview
├── Problem
├── Objectives
├── Research Questions
├── Literature
├── Methodology
├── Evidence
├── Results
├── Report
├── Feedback
└── Defense
```

---

# 8. FR-02 — Idea Lab

The student enters an unstructured project idea.

Example:

> "I want to build a system that detects fake news."

The system should NOT immediately generate a project report.

Instead, it should interrogate the idea.

### Required analysis

The system should investigate:

* Problem clarity
* Target population
* Context
* Existing alternatives
* Research gap
* Feasibility
* Required resources
* Data availability
* Scope
* Evaluation strategy
* Potential contribution

### Output

```text
PROJECT OPPORTUNITY BRIEF

Problem:
...

Target:
...

Existing approaches:
...

Potential gap:
...

Proposed contribution:
...

Required resources:
...

Major risks:
...

Suggested scope:
...

Possible evaluation:
...
```

The student must be able to modify the generated assumptions.

---

# 9. FR-03 — Project Blueprint

The system helps establish the project's foundational structure.

Required entities:

```text
Problem Statement
Aim
Objectives
Research Questions
Research Gap
Scope
Limitations
Methodology
Expected Contribution
Evaluation Strategy
```

### Critical requirement

These must not exist as isolated text fields.

The system must establish relationships.

Example:

```text
Objective 1
      ↓
Research Question 1
      ↓
Method 1
      ↓
Evidence 1
      ↓
Result 1
      ↓
Conclusion 1
```

---

# 10. FR-04 — Research Workspace

Students can add research materials.

Supported MVP inputs:

* PDF
* URL
* notes
* manually entered sources
* uploaded documents
* datasets/experiment artifacts

For every source, the system should extract:

* title
* authors
* publication date
* abstract/summary
* key claims
* relevant findings
* limitations
* relevance to project
* potential relationship to research gap

---

# 11. FR-05 — Evidence Ledger

The Evidence Ledger is a first-class product component.

Students should be able to create:

### Claim

> "Existing models perform poorly on low-resource Nigerian languages."

Then associate:

```text
Claim
 ↓
Source
 ↓
Evidence
 ↓
Research Gap
```

Evidence can include:

* academic paper
* dataset
* experiment
* survey
* interview
* measurement
* screenshot
* observation

### Requirement

The system must distinguish between:

**Student assertion**

and

**Evidence-backed claim.**

---

# 12. FR-06 — Project Knowledge Graph

The system maintains a structured representation of the project.

Example:

```text
[Problem]
     │
     ↓
[Research Gap]
     │
     ↓
[Objective 1]
     │
     ├────→ [Research Question]
     │
     ├────→ [Method]
     │
     ├────→ [Evidence]
     │
     └────→ [Result]
                  │
                  ↓
             [Conclusion]
```

The graph should update when the student changes project components.

### Example

If the student deletes Objective 2:

The system should identify:

* associated research question
* methodology dependency
* evidence dependency
* results dependency
* conclusion dependency

and warn the student.

---

# 13. FR-07 — Project Integrity Engine

This is the primary differentiating feature.

The system should perform multiple validation checks.

## Check A — Objective Coverage

Does every objective have:

* research question
* methodology
* evidence/result
* conclusion?

---

## Check B — Methodology Consistency

Does the selected methodology actually support the stated objectives/research questions?

---

## Check C — Claim-Evidence Coverage

Which important claims lack supporting evidence?

---

## Check D — Research Gap Integrity

Does the literature actually support the stated research gap?

---

## Check E — Result-Objective Alignment

Does every major result answer a defined objective/research question?

---

## Check F — Conclusion Coverage

Does the conclusion address the project's objectives?

---

## Check G — Scope Drift

Has the project expanded beyond its original scope?

---

## Check H — Internal Contradiction

Detect contradictions between different project sections.

Example:

Chapter 1:

> Classification problem.

Chapter 3:

> Regression methodology.

System:

> **Critical inconsistency detected.**

---

# 14. Project Health Score

The system should provide an overall project-health indicator.

Example:

```text
PROJECT HEALTH

86 / 100

Critical Issues       1
Warnings               4
Missing Evidence      3
Objectives Covered   4/5
Defense Readiness    78%
```

The score should NOT be presented as an academic grade.

It represents the system's current assessment of project completeness and internal consistency.

---

# 15. Integrity Report

Every Project Check should produce a structured report.

```text
PROJECT CHECK

🔴 CRITICAL

Objective 3 has no corresponding result.

🟠 WARNING

Research gap may be weakened by recently added literature.

🟠 WARNING

3 major claims have no evidence.

🟢 PASSED

All objectives have corresponding research questions.

🟢 PASSED

All reported experiments map to an objective.
```

Every issue must include:

1. Problem
2. Why it matters
3. Affected components
4. Evidence
5. Recommended next action

---

# 16. FR-08 — AI Writing Assistant

The writing assistant operates on the structured project context.

It should support:

* outlining
* restructuring
* explanation
* rewriting
* summarization
* academic tone
* section drafting
* transitions
* critique

### Critical rule

The AI should prioritize **project evidence** over generic generation.

The system should be able to answer:

> "Where did this statement come from?"

with a traceable source.

---

# 17. FR-09 — Supervisor Feedback

Students can record or upload supervisor feedback.

Example:

> "Your sampling methodology needs justification."

The system converts this into:

```text
FEEDBACK

Sampling methodology requires justification.

Affected:
Chapter 3 → Section 3.4

Actions:

☐ Define population
☐ Explain sampling method
☐ Justify selection
☐ Explain sample size
☐ Add supporting source

Status: Open
```

Students can mark feedback:

* Open
* In Progress
* Resolved
* Rejected/Not Applicable

The student remains the final decision-maker.

---

# 18. FR-10 — Defense Simulator

The system uses the project graph to generate project-specific questions.

Question categories:

### Fundamentals

> What problem are you solving?

### Methodology

> Why did you choose this methodology?

### Technical

> Why did you choose this algorithm?

### Evidence

> What evidence supports this conclusion?

### Limitations

> What are the limitations of your study?

### Challenge

> Why should your proposed approach be preferred over the existing approach?

The student can answer through:

* text
* voice

The system analyzes:

* relevance
* consistency with project
* missing evidence
* unsupported claims
* contradictions
* likely follow-up questions

---

# 19. Defense Readiness

Output:

```text
DEFENSE READINESS

Overall: 81%

Strong:
✓ Problem definition
✓ System architecture
✓ Results

Needs work:
⚠ Methodology justification
⚠ Research gap
⚠ Limitations

High-risk questions:
1. Why this methodology?
2. Why this dataset?
3. What is your contribution?
```

---

# 20. Non-Functional Requirements

## NFR-01 — Traceability

Important AI-generated claims should be traceable to:

* project data
* source
* evidence
* user-provided information

---

## NFR-02 — User Control

The system must never silently modify the student's project.

AI suggestions require student acceptance.

---

## NFR-03 — Versioning

Important project changes should be tracked.

Example:

```text
Objective 2

Version 1
↓
Version 2
↓
Version 3
```

The student should be able to understand what changed.

---

## NFR-04 — Privacy

Project documents, unpublished research, student data and supervisor feedback should be treated as private project information.

---

## NFR-05 — Reliability

The system should clearly distinguish:

```text
Verified evidence
User-provided information
AI inference
AI suggestion
Unknown
```

The AI must not present an inference as established fact.

---

# 21. Core Data Model

A simplified backend model:

```text
User
 └── Project
      ├── Problem
      ├── Objective
      ├── ResearchQuestion
      ├── ResearchGap
      ├── Method
      ├── Source
      ├── Claim
      ├── Evidence
      ├── Experiment
      ├── Result
      ├── Conclusion
      ├── Feedback
      ├── Document
      └── DefenseQuestion
```

Relationships:

```text
Objective → ResearchQuestion
Objective → Method
Method → Evidence
Evidence → Result
Claim → Source
Claim → Evidence
ResearchGap → Objective
Result → Conclusion
Feedback → ProjectComponent
DefenseQuestion → ProjectComponent
```

---

# 22. Integrity Engine Architecture

The engine should not rely entirely on an LLM.

Use deterministic checks wherever possible.

```text
PROJECT GRAPH
      ↓
RULE ENGINE
      ↓
STRUCTURAL CHECKS
      ↓
LLM REASONING
      ↓
EVIDENCE ANALYSIS
      ↓
ISSUE GENERATION
```

### Deterministic checks

Examples:

```text
Does Objective 1 have a result?
Does every citation have a source?
Does every result map to an objective?
Are required sections present?
```

### AI checks

Examples:

```text
Does the methodology actually answer the research question?

Does the literature support the claimed research gap?

Do two sections contradict one another semantically?
```

This hybrid architecture is critical.

---

# 23. MVP User Flow

```text
SIGN UP
   ↓
CREATE PROJECT
   ↓
ENTER IDEA
   ↓
IDEA ANALYSIS
   ↓
CREATE PROJECT BLUEPRINT
   ↓
ADD RESEARCH
   ↓
BUILD PROJECT GRAPH
   ↓
ADD EVIDENCE
   ↓
RUN PROJECT CHECK
   ↓
FIX ISSUES
   ↓
GENERATE/EDIT REPORT
   ↓
RUN FINAL CHECK
   ↓
DEFENSE SIMULATOR
```

---

# 24. MVP Acceptance Criteria

The MVP is successful if a student can:

### AC-01

Create a project from an unstructured idea.

### AC-02

Generate and edit a structured project blueprint.

### AC-03

Upload and organize research sources.

### AC-04

Associate claims with evidence.

### AC-05

See relationships between objectives, methodology, evidence and results.

### AC-06

Run an integrity check.

### AC-07

Receive actionable inconsistencies rather than generic AI advice.

### AC-08

Modify the project and rerun validation.

### AC-09

Receive traceability for important AI-generated statements.

### AC-10

Run a project-specific defense simulation.

---

# 25. What We Explicitly Do NOT Build in V1

```text
❌ University ERP
❌ Full LMS
❌ Social network
❌ Generic ChatGPT clone
❌ Automatic project generator
❌ Plagiarism detection platform
❌ Citation-management replacement
❌ Supervisor marketplace
❌ University-wide analytics
❌ Automated academic grading
```

These may become future integrations, but they are not the MVP.

---

# 26. Success Metrics

### Primary

**Project Integrity Improvement**

$$
PII =
Integrity_{after}
-
Integrity_{before}
$$

Measure whether students resolve real project weaknesses.

### Secondary

* % of objectives with complete evidence chains
* issues detected per project
* issues resolved per project
* evidence-backed claim percentage
* time from idea → validated blueprint
* supervisor feedback resolution rate
* defense readiness improvement
* student project completion rate

### North Star

# Defensibility Rate

$$
DR =
\frac{
\text{critical project components with valid supporting relationships}
}{
\text{total critical project components}
}
$$

---

# 27. Product Principles

### Principle 1 — Evidence over eloquence

A beautifully written unsupported claim is still a weak claim.

### Principle 2 — Structure before generation

Understand the project before generating text.

### Principle 3 — Student owns the research

AI assists; the student decides.

### Principle 4 — Detect problems early

A problem discovered during ideation is cheaper than a problem discovered during defense.

### Principle 5 — Every change has consequences

The system should show what a change affects.

### Principle 6 — Discipline-aware, not discipline-locked

Different fields use different research methods.

### Principle 7 — The document is an output

The underlying project model is the actual product.

---

# 28. Long-Term Product

Once the MVP proves the core thesis:

```text
                 PROJECT COMPILER
                        │
        ┌───────────────┼────────────────┐
        ↓               ↓                ↓
      STUDENT        SUPERVISOR       DEPARTMENT
        │               │                │
   Project OS      Review System    Project Analytics
        │               │                │
        └───────────────┼────────────────┘
                        ↓
               UNIVERSITY RESEARCH
                  INFRASTRUCTURE
```

The eventual product becomes an operating layer for undergraduate research supervision.

---

# 29. One-Sentence Product Definition

> **Project Compiler is a research integrity platform that continuously maps, validates and stress-tests a final-year student's project—from initial idea through evidence, methodology, results and final defense.**

# 30. The Product in One Line

> **Idea → Evidence → Project → Validation → Defense.**

**The student does the research. Project Compiler makes it harder for the research to fall apart.**
