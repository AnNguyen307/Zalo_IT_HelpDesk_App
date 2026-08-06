import { config } from "../../src/config.mjs";
import { closeStore, getStoreStatus } from "../../src/store.mjs";

try {
  const status = await getStoreStatus();
  console.log(JSON.stringify(status, null, 2));
  if (!status.ready) process.exitCode = 1;
  if (status.provider !== config.dbProvider) process.exitCode = 1;
} finally {
  await closeStore();
}
