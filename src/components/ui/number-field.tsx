"use client";
import * as React from "react";
import { Input } from "./input";

interface NumberFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number;
  onChange: (value: number) => void;
  allowDecimals?: boolean;
}

/**
 * Campo numérico que mantém estado local em string para permitir
 * apagar o conteúdo sem manter um "0" residual irritante.
 * Só propaga o valor numérico quando o input for válido.
 */
export const NumberField = React.forwardRef<HTMLInputElement, NumberFieldProps>(
  ({ value, onChange, allowDecimals = true, onBlur, ...props }, ref) => {
    const [text, setText] = React.useState<string>(() => formatOut(value));

    // Sincroniza quando o valor externo muda (ex: reload do form).
    React.useEffect(() => {
      const parsed = parseLocale(text);
      if (parsed !== value) setText(formatOut(value));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
      <Input
        ref={ref}
        inputMode={allowDecimals ? "decimal" : "numeric"}
        type="text"
        value={text}
        onChange={(e) => {
          let raw = e.target.value;
          raw = allowDecimals ? raw.replace(/[^\d,.\-]/g, "") : raw.replace(/[^\d\-]/g, "");
          setText(raw);
          const parsed = parseLocale(raw);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        onBlur={(e) => {
          // Normaliza ao sair: se vazio, volta para 0; senão, reformata.
          const parsed = parseLocale(text);
          const next = Number.isFinite(parsed) ? parsed : 0;
          setText(formatOut(next));
          if (next !== value) onChange(next);
          onBlur?.(e);
        }}
        {...props}
      />
    );
  },
);
NumberField.displayName = "NumberField";

function formatOut(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(n);
}

function parseLocale(raw: string): number {
  if (raw.trim() === "" || raw === "-") return NaN;
  const normalized = raw.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}
