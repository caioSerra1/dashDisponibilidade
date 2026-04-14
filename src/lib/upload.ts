import fs from "node:fs/promises";
import path from "node:path";

const UPLOAD_ROOT = process.env.UPLOAD_ROOT ?? "/app/uploads";
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export class UploadError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "UploadError";
  }
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "bin";
}

function resolveRoot(): string {
  // Em dev (Windows), cai em ./uploads/ na raiz do projeto.
  if (process.env.NODE_ENV !== "production" && !path.isAbsolute(UPLOAD_ROOT)) {
    return path.resolve(process.cwd(), "uploads");
  }
  if (process.platform === "win32" && UPLOAD_ROOT.startsWith("/app")) {
    return path.resolve(process.cwd(), "uploads");
  }
  return UPLOAD_ROOT;
}

export async function saveAvatar(userId: string, file: File): Promise<string> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new UploadError(`Tipo não permitido: ${file.type}`, "BAD_MIME");
  }
  if (file.size > MAX_BYTES) {
    throw new UploadError("Arquivo acima de 2 MB", "TOO_LARGE");
  }

  const root = resolveRoot();
  const dir = path.join(root, "avatars");
  await fs.mkdir(dir, { recursive: true });

  const ext = extFromMime(file.type);
  // Remove versões anteriores (outros extensions)
  for (const e of ["png", "jpg", "webp"]) {
    await fs.rm(path.join(dir, `${userId}.${e}`), { force: true });
  }
  const filePath = path.join(dir, `${userId}.${ext}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return path.relative(root, filePath).replace(/\\/g, "/");
}

export async function readAvatar(relPath: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const root = resolveRoot();
  const safe = path.normalize(relPath).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(root, safe);
  if (!full.startsWith(root)) return null;
  try {
    const buffer = await fs.readFile(full);
    const ext = path.extname(full).slice(1);
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "webp"
            ? "image/webp"
            : "application/octet-stream";
    return { buffer, mime };
  } catch {
    return null;
  }
}
