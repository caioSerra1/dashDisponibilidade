import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16),
  CRON_SECRET: z.string().min(16),
  CLICKUP_API_TOKEN: z.string().optional().default(""),
  CLICKUP_TEAM_ID: z.string().optional().default(""),
  ZABBIX_URL: z.string().optional().default(""),
  ZABBIX_USER: z.string().optional().default(""),
  ZABBIX_PASSWORD: z.string().optional().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment");
  }
  cached = parsed.data;
  return cached;
}
