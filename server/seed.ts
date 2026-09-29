// Seeds a demo project with a realistic — and deliberately flawed — research graph,
// so the Integrity Engine has something to find.  Run: npm run seed
import type { NodeType, Provenance, Relation } from '../shared/model.js';
import * as db from './db.js';
import { hashPassword } from './auth.js';
import { seedHardwareProject } from './seed-hardware.js';

const DEMO_EMAIL = 'demo@projectcompiler.local';
const DEMO_PASSWORD = 'demo-password';
const demo = (await db.getUserByEmail(DEMO_EMAIL)) ?? (await db.createUser(DEMO_EMAIL, 'Demo Student', await hashPassword(DEMO_PASSWORD)));

const p = await db.createProject(demo.id, {
  title: 'Detecting Fake News in Nigerian Pidgin on WhatsApp',
  discipline: 'Computer Science',
  department: 'Computer Sciences',
  institution: 'University of Lagos',
  project_type: 'software_system',
  stage: 'implementation',
  idea: 'I want to build a system that detects fake news shared on WhatsApp in Nigerian Pidgin, because most misinformation tools only work for English.',
});

const n = (type: NodeType, title: string, content = '', provenance: Provenance = 'user', data: Record<string, any> = {}) =>
  db.createNode({ project_id: p.id, type, title, content, provenance, data });
const e = (a: { id: number }, b: { id: number }, relation: Relation) => db.createEdge({ project_id: p.id, from_id: a.id, to_id: b.id, relation });

const problem = await n('problem', 'Pidgin misinformation spreads unchecked on WhatsApp', 'Misinformation in Nigerian Pidgin circulates widely on WhatsApp, but automated fact-checking tools are built for English and do not handle Pidgin. This is a binary classification problem: is a message fake or genuine?');
const gap = await n('research_gap', 'No fake-news classifier for Nigerian Pidgin', 'Existing fake-news detection models target high-resource languages; no published model or labelled dataset targets Nigerian Pidgin messaging content.');
const aim = await n('aim', 'Build and evaluate a Pidgin fake-news detector', 'To design, build and evaluate a machine-learning system that classifies Nigerian Pidgin WhatsApp messages as fake or genuine.');
const scope = await n('scope', 'Text-only Pidgin messages', 'Text messages in Nigerian Pidgin forwarded on WhatsApp; images, audio and other Nigerian languages are out of scope.');
const lim = await n('limitation', 'Small labelled dataset', 'Only ~2,400 messages can be labelled within the project timeline.');
const o1 = await n('objective', 'Build a labelled Pidgin misinformation dataset', 'Collect and label at least 2,000 Pidgin WhatsApp messages as fake or genuine using fact-checker verdicts.');
const o2 = await n('objective', 'Train and evaluate a Pidgin fake-news classifier', 'Fine-tune a multilingual transformer and compare it to a TF-IDF baseline using F1-score.');
const o3 = await n('objective', 'Deploy the classifier as a WhatsApp bot and assess usability', 'Deploy the model behind a WhatsApp chatbot and evaluate usability with 30 users.');
const q1 = await n('research_question', 'Can fact-checker verdicts provide reliable labels for Pidgin messages?');
const q2 = await n('research_question', 'How accurately can a fine-tuned multilingual transformer classify fake Pidgin news?');
const q3 = await n('research_question', 'How usable do WhatsApp users find an automated fact-checking bot?');
const m1 = await n('method', 'Data collection from fact-checking archives', 'Scrape Dubawa and Africa Check verdicts, match to forwarded Pidgin messages, and double-label a 20% sample to measure inter-annotator agreement.');
const m2 = await n('method', 'Regression model of message credibility', 'Fine-tune AfroXLMR as a regression model that predicts a continuous credibility score between 0 and 1; evaluate with mean squared error.');
const m3 = await n('method', 'Usability survey', 'System Usability Scale questionnaire administered to participants after using the bot for one week.');
const evl = await n('evaluation', 'F1-score and SUS', 'Classifier: macro F1 on a held-out 20% test set. Bot: System Usability Scale score.');
const exp1 = await n('experiment', 'Annotation run', '2,412 messages labelled; 480 double-labelled.', 'verified');
const exp2 = await n('experiment', 'Classifier training run', 'AfroXLMR-base fine-tuned for 5 epochs; TF-IDF + logistic regression baseline.', 'verified');
const r1 = await n('result', "Cohen's kappa = 0.78", 'Inter-annotator agreement on the double-labelled subset was substantial (κ = 0.78).', 'verified');
const r2 = await n('result', 'Transformer F1 = 0.81 vs baseline 0.69', 'The fine-tuned model reached macro F1 of 0.81, against 0.69 for the TF-IDF baseline.', 'verified');
const r3 = await n('result', 'Model is 3x faster on GPU', 'Inference time dropped from 120ms to 40ms per message on a T4 GPU.', 'verified');
const c1 = await n('conclusion', 'Fact-checker verdicts yield reliable labels', 'Labels derived from fact-checker verdicts are reliable enough for supervised training.');
const c2 = await n('conclusion', 'Transformers outperform classical baselines for Pidgin', 'A fine-tuned multilingual transformer substantially outperforms a classical baseline, and the system is ready for national deployment.');
const contrib = await n('contribution', 'First Pidgin fake-news dataset and baseline models');

const s1 = await n('source', 'AfroXLMR: Adapting multilingual models to African languages', '', 'verified', {
  kind: 'paper', authors: 'Alabi, Adelani, Mosbach, Klakow', year: '2022',
  summary: 'Adapts XLM-R to 17 African languages including Nigerian Pidgin via multilingual adaptive fine-tuning, improving NER and sentiment results for low-resource African languages.',
  key_claims: ['Multilingual models underperform on African languages absent from pre-training', 'Adaptive fine-tuning improves downstream performance on Nigerian Pidgin'],
  limitations: ['Evaluated on NER and sentiment, not misinformation'],
});
const s2 = await n('source', 'NaijaSenti: A Nigerian Twitter sentiment corpus', '', 'verified', {
  kind: 'paper', authors: 'Muhammad, Adelani, Ruder, et al.', year: '2022',
  summary: 'Introduces a sentiment corpus for Hausa, Igbo, Nigerian Pidgin and Yorùbá tweets; shows code-mixing and informal orthography reduce model accuracy.',
  key_claims: ['Pidgin text is heavily code-mixed with English'],
});
const s3 = await n('source', 'Multilingual misinformation detection across 40 languages', '', 'verified', {
  kind: 'paper', authors: 'Example et al.', year: '2024',
  summary: 'Reports a multilingual misinformation classifier evaluated on 40 languages including a small Nigerian Pidgin test set.',
});

const cl1 = await n('claim', 'Existing models perform poorly on low-resource Nigerian languages', '', 'user', { important: true });
const cl2 = await n('claim', 'Over 60% of Nigerians share news on WhatsApp without verifying it', '', 'user', { important: true });
const ev1 = await n('evidence', 'XLM-R drops sharply on unseen African languages (Alabi et al., Table 2)', '', 'verified', { kind: 'academic paper' });

await e(problem, gap, 'motivates'); await e(problem, aim, 'framed_as'); await e(aim, o1, 'decomposes_into'); await e(aim, o2, 'decomposes_into'); await e(aim, o3, 'decomposes_into');
await e(gap, o1, 'addressed_by'); await e(gap, o2, 'addressed_by'); await e(gap, contrib, 'enables'); await e(scope, o1, 'bounds'); await e(scope, o2, 'bounds'); await e(lim, m2, 'constrains');
await e(o1, q1, 'refined_into'); await e(o2, q2, 'refined_into'); await e(o3, q3, 'refined_into');
await e(q1, m1, 'investigated_by'); await e(q2, m2, 'investigated_by'); await e(q3, m3, 'investigated_by');
await e(m1, exp1, 'operationalized_as'); await e(m2, exp2, 'operationalized_as'); await e(m2, evl, 'measured_by'); await e(m3, evl, 'measured_by');
await e(exp1, r1, 'produces'); await e(exp2, r2, 'produces');
await e(r1, c1, 'supports'); await e(r2, c2, 'supports'); await e(c2, contrib, 'demonstrates');
await e(s1, gap, 'supports_gap'); await e(s2, gap, 'supports_gap'); await e(s3, gap, 'challenges_gap');
await e(cl1, ev1, 'backed_by'); await e(ev1, s1, 'derived_from'); await e(cl1, s1, 'cites');
void r3; void cl2;

await db.createFeedback({
  project_id: p.id,
  raw_text: 'Your sampling methodology needs justification.',
  summary: 'Sampling methodology requires justification',
  location: 'Chapter 3 → Section 3.4',
  affected: [m1.id, m3.id],
  actions: [
    { text: 'Define population', done: true },
    { text: 'Explain sampling method', done: false },
    { text: 'Justify selection', done: false },
    { text: 'Explain sample size', done: false },
    { text: 'Add supporting source', done: false },
  ],
  status: 'in_progress',
  supervisor: 'Dr. Supervisor',
});

console.log(`Seeded demo project #${p.id}: "${p.title}"`);
const hw = await seedHardwareProject(demo.id);
console.log(`Seeded hardware demo project #${hw.id}: "${hw.title}"`);
console.log(`Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
