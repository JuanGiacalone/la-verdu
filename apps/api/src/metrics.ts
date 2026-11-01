import { collectDefaultMetrics, Gauge, Registry } from "prom-client";

export interface Metrics {
  readonly registry: Registry;
}

/**
 * Creates an isolated registry per application instance, so several apps
 * (for example in tests) never collide on metric names.
 */
export function createMetrics(version: string): Metrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const buildInfo = new Gauge({
    name: "laverdu_build_info",
    help: "Build information for the La Verdu API. Always 1.",
    labelNames: ["version"],
    registers: [registry],
  });
  buildInfo.set({ version }, 1);

  return { registry };
}
