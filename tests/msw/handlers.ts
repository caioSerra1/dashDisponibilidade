import { http, HttpResponse } from "msw";

export const clickupFixture = {
  tasks: [
    { id: "TASK-1", points: 5, date_closed: "1712966400000", assignees: [{ id: 111 }] },
    { id: "TASK-2", points: 8, date_closed: "1713052800000", assignees: [{ id: 111 }] },
    { id: "TASK-3", points: 3, date_closed: "1713139200000", assignees: [{ id: 222 }] },
  ],
};

export const handlers = [
  http.get("https://api.clickup.com/api/v2/team/:teamId/task", () =>
    HttpResponse.json(clickupFixture),
  ),

  http.post("https://zabbix.example.com/api_jsonrpc.php", async ({ request }) => {
    const body = (await request.json()) as { method: string; id: number };
    switch (body.method) {
      case "user.login":
        return HttpResponse.json({ jsonrpc: "2.0", result: "fake-token", id: body.id });
      case "host.get":
        return HttpResponse.json({
          jsonrpc: "2.0",
          id: body.id,
          result: [
            { hostid: "10001", host: "plataforma", name: "Plataforma" },
            { hostid: "10002", host: "hostinger", name: "HostingerAI" },
            { hostid: "10003", host: "whm", name: "WHM" },
          ],
        });
      case "service.getsla":
      case "trigger.get":
        return HttpResponse.json({
          jsonrpc: "2.0",
          id: body.id,
          result: [{ hostid: "10001", sla: 99.5 }],
        });
      case "user.logout":
        return HttpResponse.json({ jsonrpc: "2.0", result: true, id: body.id });
      default:
        return HttpResponse.json({ jsonrpc: "2.0", error: { message: "unknown" }, id: body.id });
    }
  }),
];
