"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/date";

interface UserNote {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string };
}

interface MemberSummary {
  userId: string;
  name: string;
  pontosDev: number;
  tasksDev: number;
  tasksSuporte: number;
  slaAvg: number;
  mttrHoras: number | null;
  mttaHoras: number | null;
  wipAtual: number;
  retornosExecucao: number;
  metasBatidas: number;
  marcosBatidos: number;
  scoreEvolucao: number;
  deltaEvolucao: {
    pontosDev: number;
    tasksDev: number;
    slaAvg: number;
    avgResolutionHours: number | null;
  };
}

/**
 * Modal "Preparar 1:1": mostra KPIs recentes do colaborador no período,
 * destaques automáticos de evolução e permite o admin anotar observações
 * privadas sobre o colaborador.
 */
export function OneOnOneModal({
  open,
  onClose,
  member,
}: {
  open: boolean;
  onClose: () => void;
  member: MemberSummary | null;
}) {
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !member) return;
    setDraft("");
    setLoading(true);
    fetch(`/api/admin/users/${member.userId}/notes`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setNotes(d.notes ?? []))
      .finally(() => setLoading(false));
  }, [open, member]);

  async function save() {
    if (!member || !draft.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/users/${member.userId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      if (r.ok) {
        const d = await r.json();
        setNotes((prev) => [d.note, ...prev]);
        setDraft("");
      }
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!member) return;
    if (!confirm("Excluir esta anotação?")) return;
    const r = await fetch(`/api/admin/users/${member.userId}/notes/${id}`, {
      method: "DELETE",
    });
    if (r.ok) setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  if (!member) return null;

  // Destaques automáticos baseados no delta
  const destaques: string[] = [];
  const d = member.deltaEvolucao;
  if (d.pontosDev > 0) destaques.push(`Entregou ${d.pontosDev} pontos a mais que o período anterior.`);
  else if (d.pontosDev < 0) destaques.push(`Entregou ${Math.abs(d.pontosDev)} pontos a menos que o período anterior.`);
  if (d.tasksDev > 0) destaques.push(`Fechou ${d.tasksDev} tasks de dev a mais.`);
  else if (d.tasksDev < 0) destaques.push(`Fechou ${Math.abs(d.tasksDev)} tasks de dev a menos.`);
  if (d.slaAvg >= 0.1) destaques.push(`SLA subiu ${d.slaAvg.toFixed(2)} pontos percentuais.`);
  else if (d.slaAvg <= -0.1) destaques.push(`SLA caiu ${Math.abs(d.slaAvg).toFixed(2)} pontos percentuais.`);
  if (d.avgResolutionHours != null) {
    if (d.avgResolutionHours < 0)
      destaques.push(
        `MTTR melhorou: tempo médio caiu ${Math.abs(d.avgResolutionHours).toFixed(1)}h.`,
      );
    else if (d.avgResolutionHours > 0)
      destaques.push(
        `MTTR piorou: tempo médio subiu ${d.avgResolutionHours.toFixed(1)}h.`,
      );
  }
  if (member.retornosExecucao > 0)
    destaques.push(`${member.retornosExecucao} tasks voltaram à execução no período.`);
  if (member.wipAtual >= 5)
    destaques.push(`WIP alto: ${member.wipAtual} tasks em andamento simultâneas.`);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Preparar 1:1 — {member.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* KPIs do período */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              KPIs do período
            </h3>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Stat label="Pontos (dev)" value={String(member.pontosDev)} />
              <Stat label="Tasks dev" value={String(member.tasksDev)} />
              <Stat label="Tasks suporte" value={String(member.tasksSuporte)} />
              <Stat label="SLA médio" value={`${member.slaAvg.toFixed(2)}%`} />
              <Stat
                label="MTTR"
                value={member.mttrHoras != null ? `${member.mttrHoras.toFixed(1)}h` : "—"}
              />
              <Stat
                label="MTTA"
                value={member.mttaHoras != null ? `${member.mttaHoras.toFixed(1)}h` : "—"}
              />
              <Stat label="WIP atual" value={String(member.wipAtual)} />
              <Stat label="Retornos" value={String(member.retornosExecucao)} />
              <Stat
                label="Metas batidas"
                value={`${member.metasBatidas} / ${member.marcosBatidos} marcos`}
              />
            </div>
          </section>

          {/* Destaques */}
          {destaques.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Destaques do período
              </h3>
              <ul className="space-y-1.5">
                {destaques.map((d, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Anotações anteriores */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Anotações privadas ({notes.length})
            </h3>
            {loading && notes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            ) : notes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma anotação ainda.</p>
            ) : (
              <div className="space-y-2">
                {notes.map((n) => (
                  <div key={n.id} className="rounded-md border bg-card/50 p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px]">
                        {n.author.name}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDateTime(n.createdAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(n.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="excluir anotação"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Nova anotação */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Nova anotação
            </h3>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Observações, combinados, pontos a desenvolver..."
              rows={4}
            />
            <div className="flex justify-end mt-2">
              <Button onClick={save} disabled={!draft.trim() || loading} size="sm">
                <Plus className="h-4 w-4" />
                Adicionar anotação
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card/50 p-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
