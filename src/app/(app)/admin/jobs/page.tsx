import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const runs = await prisma.jobRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Últimas execuções</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Job</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Início</th>
                  <th className="py-2">Fim</th>
                  <th className="py-2">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 font-mono">{r.job}</td>
                    <td className="py-2">
                      <Badge variant={r.status === "ok" ? "success" : "default"}>{r.status}</Badge>
                    </td>
                    <td className="py-2 text-xs tabular-nums">{formatDateTime(r.startedAt)}</td>
                    <td className="py-2 text-xs tabular-nums">
                      {r.finishedAt ? formatDateTime(r.finishedAt) : "—"}
                    </td>
                    <td className="py-2 text-xs">{r.message ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
