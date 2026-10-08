// Puts the demo account back to its starting state: deletes ONLY the demo account's projects
// (other users are never touched), then recreates the research and hardware demo projects.
// Run: npm run reset-demo   (uses TURSO_DATABASE_URL from .env when set)
import * as db from './db.js';

const DEMO_EMAIL = 'demo@projectcompiler.local';
const demo = await db.getUserByEmail(DEMO_EMAIL);
if (demo) {
  const projects = await db.listProjects(demo.id);
  for (const p of projects) {
    await db.deleteProject(p.id);
    console.log(`Deleted demo project #${p.id}: "${p.title}"`);
  }
}
// seed.ts creates the demo account if needed and both demo projects.
await import('./seed.js');
