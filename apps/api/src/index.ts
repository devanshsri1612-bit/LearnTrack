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
      googleMode: env.GOOGLE_INTEGRATION_MODE,
    })
  );
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      JSON.stringify({
        level: "error",
        code: "EADDRINUSE",
        msg: `Port ${env.PORT} is already in use by another process or an existing LearnTrack server. Please terminate the conflicting process or change PORT in .env.`,
      })
    );
    process.exit(1);
  } else {
    throw err;
  }
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

