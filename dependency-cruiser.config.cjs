module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Ciclos de dependência são proibidos.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: { orphan: true, pathNot: ["\\.d\\.ts$", "next\\.config", "tailwind\\.config", "postcss\\.config"] },
      to: {},
    },
    {
      name: "ui-not-importing-services",
      severity: "error",
      comment: "Componentes UI não devem importar clientes externos diretamente.",
      from: { path: "^src/components/ui" },
      to: { path: "^src/lib/(clickup|zabbix|orchestrator)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
