import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(), 
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

const parsed = envSchema.safeParse(process.env);


if (!parsed.success) {
  console.error(parsed.error.message);
  process.exit(1);
}

export const env = parsed.data;