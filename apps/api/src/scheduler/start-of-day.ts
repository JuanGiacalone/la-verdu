import { eq } from "drizzle-orm";
import { transitionAvailabilityForNewDay } from "../availability/service.js";
import type { WhatsAppChannel } from "../channels/whatsapp.js";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface StartOfDayDeps {
  readonly database: Database;
  readonly channel: WhatsAppChannel;
  readonly templateName: string;
  readonly language: string;
}

/**
 * Runs the start-of-day flow for a single branch:
 * 1. Sends the template message M-11 to all staff assigned to the branch.
 * 2. Transitions UNAVAILABLE → PENDING_CHECK for all products.
 */
export async function runStartOfDay(deps: StartOfDayDeps, branchId: string): Promise<void> {
  const today = new Date().toISOString().split("T")[0] ?? "";

  // Get staff assigned to this branch.
  const assignments = await deps.database
    .select()
    .from(schema.staffBranch)
    .where(eq(schema.staffBranch.branchId, branchId));

  const staffIds = assignments.map((a) => a.staffId);
  if (staffIds.length === 0) return;

  const staffMembers = await deps.database
    .select()
    .from(schema.staff)
    .where(eq(schema.staff.active, true));

  const branchStaff = staffMembers.filter((s) => staffIds.includes(s.id));

  // Get branch info.
  const branchRows = await deps.database
    .select()
    .from(schema.branch)
    .where(eq(schema.branch.id, branchId))
    .limit(1);
  const branch = branchRows[0];
  if (!branch) return;

  // Send template to each staff member.
  for (const member of branchStaff) {
    try {
      await deps.channel.sendTemplate(member.phoneE164, deps.templateName, deps.language, [
        { type: "text", text: branch.shortName },
      ]);
    } catch {
      // Log but continue.
      console.error(`Failed to send start-of-day template to ${member.phoneE164}`);
    }
  }

  // Transition availability.
  await transitionAvailabilityForNewDay(deps.database, branchId, today);
}
