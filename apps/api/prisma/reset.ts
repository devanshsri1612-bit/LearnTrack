import { execSync } from "child_process";
import { env } from "../src/config/env.js";
import { seedDatabase } from "./seed.js";
import { prisma } from "../src/db.js";

async function runReset() {
  if (env.NODE_ENV === "production") {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "Refusing to run db:reset because NODE_ENV=production.",
      })
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      level: "info",
      msg: "Backing up dev.db and pushing Prisma schema...",
    })
  );

  const fs = await import("fs");
  const path = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dbPath = path.resolve(__dirname, "dev.db");
  const bakPath = path.resolve(__dirname, "dev.db.bak");
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, bakPath);
  }

  execSync("npx prisma db push --force-reset --skip-generate", {
    stdio: "inherit",
  });

  await seedDatabase();
  await prisma.$disconnect();

  console.log(
    JSON.stringify({
      level: "info",
      msg: "db:reset complete.",
    })
  );
}

void runReset();

