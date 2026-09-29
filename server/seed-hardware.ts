// A realistic hardware (engineering-build) demo project with planted flaws:
//   - a requirement with no target value (not measurable)
//   - a requirement with no test (critical once building)
//   - a failed battery-life test
//   - a relay rated below the pump's current draw (for the AI design check)
//   - an untraced part and an unpriced part in the bill of materials
import type { NodeType, Provenance, Relation } from '../shared/model.js';
import * as db from './db.js';

export async function seedHardwareProject(userId: number) {
  const p = await db.createProject(userId, {
    title: 'Solar-Powered Automatic Irrigation Controller for Smallholder Farms',
    discipline: 'Electrical & Electronics Engineering',
    department: 'Electrical & Electronics Engineering',
    institution: 'University of Lagos',
    project_type: 'design_and_build',
    track: 'hardware',
    stage: 'implementation',
    idea: 'I want to build a solar-powered controller that waters crops automatically when the soil is dry, and sends the farmer an SMS alert.',
  });
  const n = (type: NodeType, title: string, content = '', data: Record<string, any> = {}, provenance: Provenance = 'user') =>
    db.createNode({ project_id: p.id, type, title, content, provenance, data });
  const e = (a: { id: number }, b: { id: number }, relation: Relation) => db.createEdge({ project_id: p.id, from_id: a.id, to_id: b.id, relation });

  const problem = await n('problem', 'Manual irrigation wastes water and labour', 'Smallholder farmers in Kano water crops by hand or with petrol pumps on fixed schedules, over- or under-watering and spending hours daily; grid power is unavailable on most farms.');
  const gap = await n('research_gap', 'Commercial controllers are grid-powered and costly', 'Available automatic irrigation controllers assume grid power or cost over ₦250,000, and none send SMS alerts over 2G networks common in rural Kano.');
  const aim = await n('aim', 'Design and build a low-cost solar irrigation controller', 'To design, build and test a solar-powered controller that irrigates automatically based on soil moisture and alerts the farmer by SMS.');
  const scope = await n('scope', 'One 12 V pump, one plot', 'A single 12 V DC pump irrigating a plot of up to 500 m²; crop-specific watering schedules are out of scope.');
  const lim = await n('limitation', 'Single moisture probe', 'One capacitive probe represents the whole plot; soil variability is not captured.');
  const contrib = await n('contribution', 'Open, low-cost design under ₦60,000', 'A documented, reproducible controller that local technicians can build for under ₦60,000.');
  const o1 = await n('objective', 'Automate watering from soil moisture', 'Switch the pump on when soil is dry and off when it is wet enough, without the farmer present.');
  const o2 = await n('objective', 'Run entirely on solar power', 'Operate day and night from a solar panel and battery with no grid connection.');
  const o3 = await n('objective', 'Alert the farmer remotely', 'Notify the farmer by SMS when watering starts, stops, or the tank runs dry.');

  const r1 = await n('requirement', 'Detect dry soil', 'The controller must detect when the soil is too dry.', { verification: 'test' });
  const r2 = await n('requirement', 'Pump switches on within 5 s of dry reading', '', { target: '≤ 5', unit: 's', verification: 'test' });
  const r3 = await n('requirement', 'Battery runtime without sun', 'The system keeps working overnight and on cloudy days.', { target: '≥ 8', unit: 'h', verification: 'test' });
  const r4 = await n('requirement', 'SMS alert delivered within 60 s', '', { target: '≤ 60', unit: 's', verification: 'demonstration' });
  const r5 = await n('requirement', 'Total component cost', '', { target: '≤ 60,000', unit: '₦', verification: 'analysis' });

  const d1 = await n('design', 'System block diagram', 'Solar panel → Charge controller → 12 V battery\n12 V battery → Buck converter → ESP32\nSoil moisture sensor → ESP32 ADC\nESP32 → Relay module → 12 V pump\nESP32 → SIM800L → Farmer phone', { kind: 'block_diagram' });
  const d2 = await n('design', 'Power budget calculation', 'Pump 12 V × 3 A for 30 min/day = 18 Wh; ESP32 + SIM800L average 0.9 W × 24 h = 21.6 Wh; total ≈ 40 Wh/day. A 20 W panel at 5 peak sun hours gives 100 Wh/day; a 12 V 7 Ah battery stores 84 Wh.', { kind: 'calculation' });
  const d3 = await n('design', 'Control firmware', 'Reads moisture every 10 s; hysteresis between 35 % (on) and 55 % (off); sends SMS on state change.', { kind: 'firmware' });

  const c1 = await n('component', 'Microcontroller', 'Built-in ADC and Wi-Fi, low sleep current, widely available in Lagos markets.', { part: 'ESP32-WROOM-32', qty: 1, unit_cost: 6500 });
  const c2 = await n('component', 'Soil moisture sensor', 'Capacitive probe does not corrode like resistive probes.', { part: 'Capacitive v1.2', qty: 1, unit_cost: 2500 });
  const c3 = await n('component', 'Relay module', 'Switches the pump from a 3.3 V GPIO.', { part: '1-channel 5 V relay (2 A contacts)', qty: 1, unit_cost: 1500 });
  const c4 = await n('component', '12 V DC water pump', 'Draws 3 A; enough head for a 500 m² plot.', { part: '12 V 3 A diaphragm pump', qty: 1, unit_cost: 12000 });
  const c5 = await n('component', 'Solar panel', 'Sized from the power budget.', { part: '20 W mono panel', qty: 1, unit_cost: 15000 });
  const c6 = await n('component', 'Battery', 'Stores 84 Wh for night operation.', { part: '12 V 7 Ah SLA', qty: 1, unit_cost: 9000 });
  const c7 = await n('component', 'GSM module', 'Sends SMS over 2G, which covers rural Kano.', { part: 'SIM800L', qty: 1, unit_cost: 4500 });
  const c8 = await n('component', 'LCD display', 'Shows moisture reading on site.', { part: '16x2 I2C LCD', qty: 1 });
  const c9 = await n('component', 'Buzzer', '', { part: 'Piezo buzzer', qty: 1, unit_cost: 300 });

  const t2 = await n('test', 'Pump response time test', '1. Place probe in dry soil\n2. Start stopwatch when reading crosses 35 %\n3. Stop when pump runs\n4. Repeat 10 times', { expected: '≤ 5 s in 10/10 trials', measured: '2.1 s average, max 3.4 s', status: 'pass', equipment: 'stopwatch' });
  const t3 = await n('test', 'Overnight battery runtime test', '1. Fully charge battery\n2. Disconnect panel at 18:00\n3. Log when system browns out', { expected: '≥ 8 h', measured: '5.5 h', status: 'fail', equipment: 'data logger, multimeter' });
  const t5 = await n('test', 'Cost analysis', 'Sum of the bill of materials.', { expected: '≤ ₦60,000', measured: '', status: 'planned' });
  const build = await n('experiment', 'Breadboard prototype', 'Assembled on breadboard in week 6; replaced resistive probe with capacitive after corrosion in 3 days.', {}, 'verified');
  const res = await n('result', 'Pump responds in 2.1 s on average', 'Response time well within the 5 s specification; battery runtime fell short at 5.5 h.', {}, 'verified');
  const concl = await n('conclusion', 'Automatic watering works; power system is undersized', 'The control loop meets its specification, but the battery must be resized to meet overnight operation.');
  const s1 = await n('source', 'IoT-based smart irrigation systems: a review', '', { kind: 'paper', authors: 'Obaideen, Yousef, et al.', year: '2022', summary: 'Reviews sensor-based irrigation controllers; most rely on grid power and Wi-Fi connectivity.' }, 'verified');
  const s2 = await n('source', 'SIM800L GSM module datasheet', '', { kind: 'document', authors: 'SIMCom', year: '2013', summary: 'Quad-band GSM/GPRS module; peak current up to 2 A during transmission bursts.' }, 'verified');

  const links: [any, any, Relation][] = [
    [problem, gap, 'motivates'], [problem, aim, 'framed_as'], [aim, o1, 'decomposes_into'], [aim, o2, 'decomposes_into'], [aim, o3, 'decomposes_into'],
    [gap, o1, 'addressed_by'], [gap, o3, 'addressed_by'], [gap, contrib, 'enables'], [scope, o1, 'bounds'], [lim, r1, 'constrains'],
    [o1, r1, 'specified_by'], [o1, r2, 'specified_by'], [o2, r3, 'specified_by'], [o3, r4, 'specified_by'], [o2, r5, 'specified_by'],
    [r1, c2, 'realized_by'], [r2, d3, 'realized_by'], [r2, c3, 'realized_by'], [r3, d2, 'realized_by'], [r3, c6, 'realized_by'], [r3, c5, 'realized_by'], [r4, c7, 'realized_by'],
    [d1, c1, 'uses'], [d1, c2, 'uses'], [d1, c3, 'uses'], [d1, c4, 'uses'], [d1, c5, 'uses'], [d1, c6, 'uses'], [d1, c7, 'uses'], [d1, c8, 'uses'],
    [r2, t2, 'verified_by'], [r3, t3, 'verified_by'], [r5, t5, 'verified_by'], [t2, res, 'produces'], [res, concl, 'supports'], [concl, contrib, 'demonstrates'],
    [s1, gap, 'supports_gap'], [s2, d2, 'supports'],
  ];
  for (const [a, b, r] of links) await e(a, b, r);
  void build; void c9;

  await db.createFeedback({
    project_id: p.id,
    raw_text: 'Show how you sized the battery and panel, and justify the relay rating.',
    summary: 'Justify power sizing and relay rating',
    location: 'Chapter 3 → Design Calculations',
    affected: [d2.id, c3.id, c6.id],
    actions: [
      { text: 'Show daily energy budget', done: true },
      { text: 'Size battery for 8 h autonomy', done: false },
      { text: 'Check relay contact rating against pump current', done: false },
    ],
    status: 'open',
    supervisor: 'Engr. Supervisor',
  });
  return p;
}
