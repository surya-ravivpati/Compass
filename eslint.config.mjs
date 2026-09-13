import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * Architectural invariant (ARCHITECTURE.md): /lib/solver is pure TypeScript.
 *
 * The solver takes plain data and returns plain data. It must not reach for
 * React, Next, Supabase, Drizzle, db code, or any Node/browser API -- that
 * purity is what makes it deterministic, unit-testable in isolation, and
 * reusable from both the server and the client.
 *
 * This is expressed as an allow-list: inside /lib/solver the only legal import
 * is a relative one, which means the solver carries zero runtime dependencies.
 * An allow-list is used deliberately over a deny-list of known offenders,
 * because a deny-list silently permits whatever nobody thought to list.
 *
 * `no-restricted-imports` cannot express this -- its `!` negations do not
 * exempt relative specifiers -- so the rule is defined inline here. It is a
 * local rule, not a dependency.
 */
const solverPurity = {
  rules: {
    "no-external-imports": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Forbid non-relative imports inside /lib/solver so it stays pure TypeScript.",
        },
        schema: [],
        messages: {
          external:
            "/lib/solver must stay pure TypeScript -- '{{name}}' is not a relative import. No React, Next, Supabase, Drizzle, db code, or Node/browser APIs. See ARCHITECTURE.md.",
        },
      },
      create(context) {
        const check = (node, value) => {
          if (typeof value !== "string") return;
          if (value.startsWith("./") || value.startsWith("../")) return;
          context.report({ node, messageId: "external", data: { name: value } });
        };
        return {
          ImportDeclaration: (n) => check(n, n.source.value),
          ImportExpression: (n) =>
            n.source.type === "Literal" && check(n, n.source.value),
          ExportNamedDeclaration: (n) => n.source && check(n, n.source.value),
          ExportAllDeclaration: (n) => n.source && check(n, n.source.value),
          CallExpression(n) {
            if (
              n.callee.type === "Identifier" &&
              n.callee.name === "require" &&
              n.arguments[0]?.type === "Literal"
            ) {
              check(n, n.arguments[0].value);
            }
          },
        };
      },
    },
  },
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    files: ["lib/solver/**/*.ts"],
    plugins: { "solver-purity": solverPurity },
    rules: { "solver-purity/no-external-imports": "error" },
  },

  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
