/**
 * The solver's public surface.
 *
 * Everything below is pure TypeScript: plain data in, plain data out, no I/O
 * and no clock. Import from here rather than reaching into individual modules,
 * so the boundary stays visible from the call site.
 */

export * from "./types";
export * from "./expression";
export * from "./graph";
export * from "./reachability";
export * from "./requirements";
export * from "./activities";
