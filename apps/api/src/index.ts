import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(
    JSON.stringify({
      level: "info",
      msg: `LearnTrack API server listening on http://localhost:${env.PORT}`,
      env: env.NODE_ENV,
      mlMode: env.ML_MODE,
    })
  );
});

async function shutdown(signal: string) {
  console.log(
    JSON.stringify({
      level: "info",
      msg: `Received ${signal}. Shutting down gracefully...`,
    })
  );
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

