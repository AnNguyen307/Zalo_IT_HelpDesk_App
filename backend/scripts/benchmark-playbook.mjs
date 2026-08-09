import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchPlaybook } from "../src/playbook.mjs";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureFile = path.join(backendRoot, "test", "fixtures", "playbook-retrieval-cases.json");
const cases = JSON.parse(await fs.readFile(fixtureFile, "utf8"));
let hitAt1 = 0;
let hitAt5 = 0;
let reciprocalRank = 0;
const rows = [];

for (const item of cases) {
  const results = await searchPlaybook(item.query, {
    audience: item.audience,
    semantic: false,
    minScore: 0.05,
    limit: 5,
  });
  const ids = results.map((entry) => entry.id);
  const rank = ids.findIndex((id) => item.expectedIds.includes(id)) + 1;
  if (rank === 1) hitAt1 += 1;
  if (rank > 0) {
    hitAt5 += 1;
    reciprocalRank += 1 / rank;
  }
  rows.push({ query: item.query, expected: item.expectedIds.join("|"), top1: ids[0] || "—", rank: rank || "miss" });
}

const total = cases.length;
const metrics = {
  cases: total,
  hitAt1: Number((hitAt1 / total).toFixed(3)),
  hitAt5: Number((hitAt5 / total).toFixed(3)),
  mrr: Number((reciprocalRank / total).toFixed(3)),
};
console.table(rows);
console.log(JSON.stringify(metrics));
if (metrics.hitAt5 < 0.9 || metrics.mrr < 0.65) {
  throw new Error(`Playbook retrieval benchmark dưới ngưỡng: ${JSON.stringify(metrics)}`);
}
