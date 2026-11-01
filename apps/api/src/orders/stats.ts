import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export type StatsPeriod = "day" | "month" | "year";

export interface OrderCount {
  readonly period: string;
  readonly count: number;
  readonly branchId?: string;
}

export interface OrderStats {
  readonly total: number;
  readonly byPeriod: readonly OrderCount[];
  readonly byBranch: readonly { branchId: string; branchName: string; count: number }[];
  readonly byStatus: readonly { status: string; count: number }[];
  readonly byFulfillment: readonly { fulfillment: string; count: number }[];
}

/**
 * Returns order statistics for a given period range.
 * Supports grouping by day, month, or year.
 */
export async function getOrderStats(
  db: Database,
  options: {
    readonly period: StatsPeriod;
    readonly from?: string; // ISO date
    readonly to?: string; // ISO date
    readonly branchId?: string;
  },
): Promise<OrderStats> {
  const { period, from, to, branchId } = options;

  // Build date filter.
  const conditions = [];
  if (from) {
    conditions.push(gte(schema.order.createdAt, new Date(from)));
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setDate(toDate.getDate() + 1); // Include the full "to" day.
    conditions.push(lte(schema.order.createdAt, toDate));
  }
  if (branchId) {
    conditions.push(eq(schema.order.fulfillingBranchId, branchId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Total count.
  const totalResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.order)
    .where(whereClause);
  const total = totalResult[0]?.count ?? 0;

  // Count by period.
  const periodExpr =
    period === "day"
      ? sql<string>`to_char(${schema.order.createdAt}, 'YYYY-MM-DD')`
      : period === "month"
        ? sql<string>`to_char(${schema.order.createdAt}, 'YYYY-MM')`
        : sql<string>`to_char(${schema.order.createdAt}, 'YYYY')`;

  const byPeriodResult = await db
    .select({
      period: periodExpr,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.order)
    .where(whereClause)
    .groupBy(periodExpr)
    .orderBy(periodExpr);

  const byPeriod: OrderCount[] = byPeriodResult.map((r) => ({
    period: r.period,
    count: r.count,
  }));

  // Count by branch.
  const byBranchResult = await db
    .select({
      branchId: schema.order.fulfillingBranchId,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.order)
    .where(whereClause)
    .groupBy(schema.order.fulfillingBranchId);

  const branches = await db.select().from(schema.branch);
  const byBranch = byBranchResult.map((r) => ({
    branchId: r.branchId ?? "unknown",
    branchName: branches.find((b) => b.id === r.branchId)?.shortName ?? "Sin sucursal",
    count: r.count,
  }));

  // Count by status.
  const byStatusResult = await db
    .select({
      status: schema.order.status,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.order)
    .where(whereClause)
    .groupBy(schema.order.status);

  const byStatus = byStatusResult.map((r) => ({
    status: r.status,
    count: r.count,
  }));

  // Count by fulfillment.
  const byFulfillmentResult = await db
    .select({
      fulfillment: schema.order.fulfillment,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.order)
    .where(whereClause)
    .groupBy(schema.order.fulfillment);

  const byFulfillment = byFulfillmentResult.map((r) => ({
    fulfillment: r.fulfillment,
    count: r.count,
  }));

  return {
    total,
    byPeriod,
    byBranch,
    byStatus,
    byFulfillment,
  };
}

/**
 * Returns a quick summary: today's count, this month's count, this year's count, and all-time total.
 */
export async function getOrderSummary(
  db: Database,
  branchId?: string,
): Promise<{
  today: number;
  thisMonth: number;
  thisYear: number;
  allTime: number;
}> {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0] ?? "";
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const yearStr = String(now.getFullYear());

  const baseCondition = branchId ? eq(schema.order.fulfillingBranchId, branchId) : undefined;

  async function countWhere(extra: ReturnType<typeof gte> | ReturnType<typeof lte> | undefined) {
    const conditions = baseCondition ? [baseCondition] : [];
    if (extra) conditions.push(extra);
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.order)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return result[0]?.count ?? 0;
  }

  const todayStart = new Date(todayStr);
  const monthStart = new Date(`${monthStr}-01`);
  const yearStart = new Date(`${yearStr}-01-01`);

  return {
    today: await countWhere(gte(schema.order.createdAt, todayStart)),
    thisMonth: await countWhere(gte(schema.order.createdAt, monthStart)),
    thisYear: await countWhere(gte(schema.order.createdAt, yearStart)),
    allTime: await countWhere(undefined),
  };
}
