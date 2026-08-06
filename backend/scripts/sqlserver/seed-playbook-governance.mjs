import { closeStore } from "../../src/store.mjs";
import { seedManagedPlaybookFromFile, getPlaybookGovernanceStatus } from "../../src/playbook-governance.mjs";

try {
  const result = await seedManagedPlaybookFromFile({ sub: "seed", name: "Baseline Seeder", role: "admin" });
  console.log(`[OK] Baseline seed completed: inserted=${result.inserted}; skipped=${result.skipped}; total=${result.total}`);
  console.log(JSON.stringify(await getPlaybookGovernanceStatus(), null, 2));
} finally {
  await closeStore();
}
