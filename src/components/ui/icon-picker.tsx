"use client";
import { useState } from "react";
import { LUCIDE_ICONS, EMOJIS, parseIconValue } from "@/lib/goal-icons";
import { cn } from "@/lib/cn";

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const parsed = parseIconValue(value);
  const [tab, setTab] = useState<"lucide" | "emoji">(parsed.kind);

  return (
    <div className="rounded-md border bg-card">
      <div className="flex border-b">
        <TabButton active={tab === "lucide"} onClick={() => setTab("lucide")}>
          Ícones
        </TabButton>
        <TabButton active={tab === "emoji"} onClick={() => setTab("emoji")}>
          Emojis
        </TabButton>
      </div>
      <div className="p-3 max-h-60 overflow-y-auto">
        {tab === "lucide" ? (
          <div className="grid grid-cols-8 gap-2">
            {Object.entries(LUCIDE_ICONS).map(([name, Icon]) => {
              const storedValue = `lucide:${name}`;
              const selected = value === storedValue || value === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange(storedValue)}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-md border transition-colors",
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent hover:bg-accent",
                  )}
                  title={name}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-10 gap-1.5">
            {EMOJIS.map((emoji) => {
              const storedValue = `emoji:${emoji}`;
              const selected = value === storedValue;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onChange(storedValue)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md border text-xl transition-colors",
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:bg-accent",
                  )}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "text-primary border-b-2 border-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Renderiza o ícone/emoji escolhido no valor guardado.
 * Use `className` pra ajustar tamanho.
 */
export function RenderIcon({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const parsed = parseIconValue(value);
  if (parsed.kind === "emoji") {
    return <span className={cn("inline-block leading-none", className)}>{parsed.value}</span>;
  }
  const Icon = LUCIDE_ICONS[parsed.value] ?? LUCIDE_ICONS.trophy!;
  return <Icon className={className} />;
}
