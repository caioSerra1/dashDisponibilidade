import "dotenv/config";
import { testClickUp } from "../src/lib/clickup";
import { testZabbix, listHosts } from "../src/lib/zabbix";

async function main() {
  console.log("==> ClickUp");
  const cu = await testClickUp();
  console.log(cu);

  console.log("==> Zabbix");
  const zb = await testZabbix();
  console.log(zb);

  if (zb.ok) {
    console.log("==> Zabbix listHosts()");
    try {
      const hosts = await listHosts();
      console.log(`hosts=${hosts.length}`);
      hosts.slice(0, 10).forEach((h) => console.log(`  ${h.hostId} ${h.name}`));
    } catch (e) {
      console.error("listHosts erro:", (e as Error).message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
