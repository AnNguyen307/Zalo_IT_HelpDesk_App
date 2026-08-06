import { buildPlaybookIndex, getPlaybookStatus } from "../src/playbook.mjs";

const force = process.argv.includes("--force");
try {
  const index = await buildPlaybookIndex({ force });
  const status = await getPlaybookStatus({ force: true });
  console.log(JSON.stringify({ ok: true, index: { model: index.model, entries: index.records.length, generatedAt: index.generatedAt }, status }, null, 2));
} catch (error) {
  console.error(`[Playbook] Index failed: ${error.message}`);
  process.exitCode = 1;
}
