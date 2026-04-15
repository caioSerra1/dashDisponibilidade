import { cn } from "@/lib/cn";

/**
 * Label padrão pros KPIs do app. Sempre com sigla + significado em PT
 * (convenção da reformulação: nenhuma sigla deve aparecer sem glossário).
 *
 * Uso:
 *   <MetricLabel sigla="MTTA" nome="Tempo até assumir uma demanda" />
 *
 * O `nome` é o tooltip/explicativo em português, aparece como subtítulo
 * no layout padrão ou via `title` no elemento quando compacto.
 */
export function MetricLabel({
  sigla,
  nome,
  compacto = false,
  className,
}: {
  sigla: string;
  nome: string;
  /** Se true, renderiza só a sigla + tooltip. Se false, renderiza sigla por cima e o nome como subtítulo. */
  compacto?: boolean;
  className?: string;
}) {
  if (compacto) {
    return (
      <span
        title={`${sigla} — ${nome}`}
        className={cn(
          "text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-help",
          className,
        )}
      >
        {sigla}
      </span>
    );
  }
  return (
    <div className={cn("space-y-0.5", className)} title={`${sigla} — ${nome}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {sigla}
      </p>
      <p className="text-[11px] text-muted-foreground/80 leading-tight">{nome}</p>
    </div>
  );
}
