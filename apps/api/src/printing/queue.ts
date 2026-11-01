import type { PrintJobData } from "@la-verdu/print-render";
import { renderPrintJob } from "@la-verdu/print-render";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

const MAX_RETRIES = 3;

export interface CreatePrintJobInput {
  readonly orderId: string;
  readonly orderVersion: number;
  readonly branchId: string;
  readonly kind: "NEW" | "MODIFICATION" | "CANCELLATION";
  readonly data: PrintJobData;
  readonly held?: boolean;
}

/**
 * Creates a print job in QUEUED or HELD state.
 * Renders the ESC/POS bytes and text preview.
 */
export async function createPrintJob(db: Database, input: CreatePrintJobInput): Promise<string> {
  const rendered = renderPrintJob(input.data);

  const rows = await db
    .insert(schema.printJob)
    .values({
      orderId: input.orderId,
      orderVersion: input.orderVersion,
      branchId: input.branchId,
      kind: input.kind,
      payloadEscpos: Buffer.from(rendered.bytes),
      previewText: rendered.preview,
      status: input.held ? "HELD" : "QUEUED",
    })
    .returning({ id: schema.printJob.id });

  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create print job");
  }
  return id;
}

/**
 * Marks a print job as dispatched (sent to the agent).
 */
export async function markDispatched(db: Database, jobId: string): Promise<void> {
  await db
    .update(schema.printJob)
    .set({ status: "DISPATCHED" })
    .where(eq(schema.printJob.id, jobId));
}

/**
 * Marks a print job as printed (agent confirmed).
 */
export async function markPrinted(db: Database, jobId: string): Promise<void> {
  await db
    .update(schema.printJob)
    .set({ status: "PRINTED", printedAt: new Date() })
    .where(eq(schema.printJob.id, jobId));
}

/**
 * Marks a print job as failed and increments the attempt counter.
 * If max retries exceeded, marks as ABANDONED.
 */
export async function markFailed(
  db: Database,
  jobId: string,
  error: string,
): Promise<"retry" | "abandoned"> {
  const rows = await db
    .select({ attempts: schema.printJob.attempts })
    .from(schema.printJob)
    .where(eq(schema.printJob.id, jobId))
    .limit(1);

  const attempts = (rows[0]?.attempts ?? 0) + 1;

  if (attempts >= MAX_RETRIES) {
    await db
      .update(schema.printJob)
      .set({ status: "ABANDONED", attempts, lastError: error })
      .where(eq(schema.printJob.id, jobId));
    return "abandoned";
  }

  await db
    .update(schema.printJob)
    .set({ status: "FAILED", attempts, lastError: error })
    .where(eq(schema.printJob.id, jobId));
  return "retry";
}

/**
 * Retries a failed print job (moves FAILED → QUEUED).
 */
export async function retryJob(db: Database, jobId: string): Promise<void> {
  await db
    .update(schema.printJob)
    .set({ status: "QUEUED", lastError: null })
    .where(and(eq(schema.printJob.id, jobId), eq(schema.printJob.status, "FAILED")));
}

/**
 * Reprints a job (creates a new job with the same data).
 * Used for modifications and manual reprints.
 */
export async function reprintJob(db: Database, jobId: string): Promise<string> {
  const rows = await db
    .select()
    .from(schema.printJob)
    .where(eq(schema.printJob.id, jobId))
    .limit(1);
  const original = rows[0];
  if (!original) {
    throw new Error("Print job not found");
  }

  const newRows = await db
    .insert(schema.printJob)
    .values({
      orderId: original.orderId,
      orderVersion: original.orderVersion,
      branchId: original.branchId,
      kind: original.kind,
      payloadEscpos: original.payloadEscpos,
      previewText: original.previewText,
      status: "QUEUED",
    })
    .returning({ id: schema.printJob.id });

  const id = newRows[0]?.id;
  if (!id) {
    throw new Error("Failed to create reprint job");
  }
  return id;
}

/**
 * Releases held jobs for a branch (HELD → QUEUED).
 * Called at start of day.
 */
export async function releaseHeldJobs(db: Database, branchId: string): Promise<number> {
  const result = await db
    .update(schema.printJob)
    .set({ status: "QUEUED", releasedAt: new Date() })
    .where(and(eq(schema.printJob.branchId, branchId), eq(schema.printJob.status, "HELD")))
    .returning({ id: schema.printJob.id });

  return result.length;
}

/**
 * Supersedes pending print jobs for an order when a new version is created.
 * Moves QUEUED/HELD jobs for older versions to SUPERSEDED.
 */
export async function supersedeOldJobs(
  db: Database,
  orderId: string,
  currentVersion: number,
): Promise<number> {
  const result = await db
    .update(schema.printJob)
    .set({ status: "SUPERSEDED" })
    .where(
      and(
        eq(schema.printJob.orderId, orderId),
        sql`${schema.printJob.orderVersion} < ${currentVersion}`,
        sql`${schema.printJob.status} IN ('QUEUED', 'HELD')`,
      ),
    )
    .returning({ id: schema.printJob.id });

  return result.length;
}

/**
 * Gets pending jobs for a branch (QUEUED status), ordered by creation time.
 */
export async function getPendingJobs(
  db: Database,
  branchId: string,
): Promise<Array<typeof schema.printJob.$inferSelect>> {
  return db
    .select()
    .from(schema.printJob)
    .where(and(eq(schema.printJob.branchId, branchId), eq(schema.printJob.status, "QUEUED")))
    .orderBy(schema.printJob.createdAt);
}

/**
 * Creates an alert for a printer issue.
 */
export async function createPrinterAlert(
  db: Database,
  branchId: string,
  jobId: string,
  message: string,
): Promise<void> {
  await db.insert(schema.alert).values({
    branchId,
    kind: "PRINTER_OFFLINE",
    orderId: null,
    message: `Impresora offline. Trabajo ${jobId}: ${message}`,
  });
}
