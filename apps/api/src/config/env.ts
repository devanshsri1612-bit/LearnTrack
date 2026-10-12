import "dotenv/config";
import { z } from "zod";

const isTestEnv =
  process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be at least 16 characters")
    .default("dev-only-session-signing-secret-learntrack-2026"),
  SESSION_EXPIRY_HOURS: z.coerce.number().positive().default(24),
  DEMO_PASSWORD: z.string().min(4).default("demo-password"),
  ML_MODE: z.enum(["MOCK", "LIVE"]).default("MOCK"),
  ML_SERVICE_URL: z.string().url().default("http://127.0.0.1:8000"),
  ML_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),
});

const rawEnv = {
  ...process.env,
  // Keep MOCK mode as the default for automated tests unless explicitly overridden via ML_TEST_LIVE=true
  ML_MODE:
    isTestEnv && process.env.ML_TEST_LIVE !== "true"
      ? "MOCK"
      : process.env.ML_MODE,
};

const parsed = EnvSchema.safeParse(rawEnv);
if (!parsed.success) {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "Invalid environment configuration",
      issues: parsed.error.issues,
    })
  );
  process.exit(1);
}

export const env = parsed.data;
