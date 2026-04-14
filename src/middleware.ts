// Protection is enforced at the layout level via `auth()` server calls
// and at API routes via explicit role checks. No edge middleware is used
// because Prisma (used inside `auth()`) is not Edge-compatible.
export function middleware() {}
export const config = { matcher: [] };
