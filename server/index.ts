// Local server entry. On Vercel, api/index.ts exposes the same app as a serverless function.
import { app } from './app.js';
import { init } from './db.js';
import { llmAvailable } from './llm.js';

await init();
const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Project Compiler API on http://localhost:${port} (LLM ${llmAvailable() ? 'enabled' : 'NOT configured'})`));
