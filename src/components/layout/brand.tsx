"use client";
import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";

interface BrandProps {
  /** Altura em pixels. A largura é proporcional ao aspect ratio do logo. */
  height?: number;
  className?: string;
}

const CANDIDATES = ["/logo.svg"] as const;

// O SVG do logo é 465x122 (incluindo o texto "Portal Concursos"),
// então definimos uma largura proporcional pela altura desejada.
const ASPECT = 465 / 122;

export function Brand({ height = 36, className }: BrandProps) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = CANDIDATES[idx];
  const width = Math.round(height * ASPECT);

  if (failed || !src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm",
          className,
        )}
        style={{ width: height, height }}
        aria-hidden
      >
        PC
      </div>
    );
  }

  return (
    <Image
      key={src}
      src={src}
      alt="Portal Concursos"
      width={width}
      height={height}
      className={cn("object-contain", className)}
      style={{ height, width: "auto", maxWidth: "100%" }}
      unoptimized
      priority
      onError={() => {
        if (idx + 1 < CANDIDATES.length) setIdx(idx + 1);
        else setFailed(true);
      }}
    />
  );
}
