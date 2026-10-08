/**
 * Architecture rules (AUTOSAR-style layering). `npm run lint:arch` fails the build on any violation.
 *
 *   app/        composition root ("ECU configuration")   → may use everything
 *   swc/ui/     application components (views)            → swc/logic, rte
 *   swc/logic/  pure runnables (rules, maths, types)       → nothing outside swc/logic
 *   rte/        ports + hooks (the runtime environment)   → swc/logic
 *   bsw/        basic software (Supabase, workers)         → swc/logic, rte (to implement its ports)
 */
const layer = (name) => `^src/${name}/`;

module.exports = {
  forbidden: [
    {
      name: "no-cycles",
      severity: "error",
      comment: "Modules must not depend on each other in a circle.",
      from: {},
      to: { circular: true },
    },
    {
      name: "logic-is-pure",
      severity: "error",
      comment: "swc/logic holds pure rules: no UI, no RTE, no infrastructure, no React, no Supabase.",
      from: { path: layer("swc/logic") },
      to: { path: ["^src/(swc/ui|rte|bsw|app)/", "node_modules/(react|react-dom|@supabase)/"] },
    },
    {
      name: "ui-only-through-rte",
      severity: "error",
      comment: "Application components reach infrastructure only through RTE ports (useRte / hooks).",
      from: { path: layer("swc/ui") },
      to: { path: ["^src/(bsw|app)/", "node_modules/@supabase/"] },
    },
    {
      name: "rte-independent-of-bsw",
      severity: "error",
      comment: "The RTE defines ports; it never imports their implementations or the UI.",
      from: { path: layer("rte") },
      to: { path: ["^src/(bsw|swc/ui|app)/", "node_modules/@supabase/"] },
    },
    {
      name: "bsw-below-application",
      severity: "error",
      comment: "Basic software implements ports; it never depends on application components or the app.",
      from: { path: layer("bsw") },
      to: { path: ["^src/(swc/ui|app)/"] },
    },
    {
      name: "supabase-only-in-bsw",
      severity: "error",
      comment: "Only the basic software talks to the database SDK.",
      from: { pathNot: "^src/bsw/" },
      to: { path: "node_modules/@supabase/" },
    },
    {
      name: "no-orphans",
      severity: "error",
      comment: "Every module must be used (tests, type declarations and the entry point excepted).",
      from: { orphan: true, pathNot: ["\.test\.tsx?$", "\.d\.ts$", "^src/main\.tsx$", "Worker\.ts$"] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    exclude: { path: "\.gen\.json$" },
  },
};
