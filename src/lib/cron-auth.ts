import { env } from "./env";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function assertCronAuth(request: Request): void {
  const header = request.headers.get("x-cron-secret") ?? "";
  const expected = env().CRON_SECRET;
  if (!timingSafeEqual(header, expected)) {
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  }
}
