// Adds only the hardware demo project to the existing demo account (e.g. on the live database).
// Run: npm run seed:hardware
import * as db from './db.js';
import { seedHardwareProject } from './seed-hardware.js';

const demo = await db.getUserByEmail('demo@projectcompiler.local');
if (!demo) {
  console.error('No demo account found. Run `npm run seed` first.');
  process.exit(1);
}
const p = await seedHardwareProject(demo.id);
console.log(`Seeded hardware demo project #${p.id}: "${p.title}" for ${demo.email}`);
