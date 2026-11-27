import "dotenv/config";

import {
  startIngestionWorker,
  stopIngestionWorker,
} from "../src/modules/ingestion/workers/ingestion.worker";

async function main() {
  const shutdown = () => {
    console.log("Stopping ingestion worker...");
    stopIngestionWorker();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await startIngestionWorker();
}

main().catch((error) => {
  console.error("Ingestion worker stopped unexpectedly:", error);
  process.exitCode = 1;
});