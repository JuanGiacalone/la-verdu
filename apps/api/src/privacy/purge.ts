import { and, lt, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface PurgeResult {
  readonly messagesDeleted: number;
  readonly conversationsClosed: number;
  readonly audioReferencesCleared: number;
}

/**
 * Purges messages older than the retention period (default 12 months).
 * Also closes conversations inactive for more than 30 days.
 * Audio transcripts are kept but raw audio is already deleted after transcription.
 */
export async function purgeOldData(
  db: Database,
  retentionMonths: number = 12,
): Promise<PurgeResult> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - retentionMonths);

  // Delete old messages.
  const deletedMessages = await db
    .delete(schema.message)
    .where(lt(schema.message.createdAt, cutoff))
    .returning({ id: schema.message.id });

  // Close conversations inactive for more than 30 days.
  const inactiveCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const closedConversations = await db
    .update(schema.conversation)
    .set({ state: "CLOSED", contextJson: {} })
    .where(
      and(
        lt(schema.conversation.lastInboundAt, inactiveCutoff),
        sql`${schema.conversation.state} != 'CLOSED'`,
      ),
    )
    .returning({ id: schema.conversation.id });

  // Clear transcripts from messages older than 6 months (keep the message, remove transcript).
  const transcriptCutoff = new Date();
  transcriptCutoff.setMonth(transcriptCutoff.getMonth() - 6);
  const clearedTranscripts = await db
    .update(schema.message)
    .set({ transcript: null })
    .where(
      and(
        lt(schema.message.createdAt, transcriptCutoff),
        sql`${schema.message.transcript} IS NOT NULL`,
      ),
    )
    .returning({ id: schema.message.id });

  return {
    messagesDeleted: deletedMessages.length,
    conversationsClosed: closedConversations.length,
    audioReferencesCleared: clearedTranscripts.length,
  };
}
