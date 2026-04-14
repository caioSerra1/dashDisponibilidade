"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";

interface AvatarProps {
  userId?: string;
  name?: string;
  size?: number;
  className?: string;
  src?: string;
}

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ userId, name, size = 36, className, src }: AvatarProps) {
  const url = src ?? (userId ? `/api/avatars/${userId}` : undefined);
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center rounded-full bg-primary/10 text-primary font-semibold overflow-hidden shrink-0",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size / 2.6) }}
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name ?? ""}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </div>
  );
}
