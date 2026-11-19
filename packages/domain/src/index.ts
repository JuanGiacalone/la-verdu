/**
 * Pure business rules (PRD section 6, BR-*). No I/O, no DB, no framework.
 * Safe to import from any runtime (api, admin, print-agent, evals).
 */

// BR-01 / BR-07: explicit confirmation word sets (Rioplatense + common).
export const CONFIRM_WORDS: ReadonlySet<string> = new Set([
  "sí", "si", "s", "yes", "ok", "dale", "confirmo", "correcto",
]);

export const REJECT_WORDS: ReadonlySet<string> = new Set([
  "no", "n", "cancelar", "cancela", "anular",
]);

export function isConfirmWord(value: string): boolean {
  return CONFIRM_WORDS.has(value.trim().toLowerCase());
}

export function isRejectWord(value: string): boolean {
  return REJECT_WORDS.has(value.trim().toLowerCase());
}

// BR-04 / BR-05: availability semantics.
export type Availability = "AVAILABLE" | "UNAVAILABLE" | "PENDING_CHECK";

export function isAvailableForSale(value: Availability | undefined | null): boolean {
  // Default available unless an UNAVAILABLE/PENDING_CHECK override exists (BR-04, BR-05).
  return value === undefined || value === null || value === "AVAILABLE";
}

export function nextDayAvailability(previous: Availability | undefined | null): Availability {
  // BR-05: yesterday's UNAVAILABLE becomes PENDING_CHECK at day start.
  if (previous === "UNAVAILABLE") return "PENDING_CHECK";
  return previous ?? "AVAILABLE";
}

// BR-15: derivation selects one fulfilling branch that has ALL items available,
// by configured priority (lower number first). Returns null if none qualifies.
export interface BranchCandidate {
  readonly id: string;
  readonly shortName: string;
  readonly priority: number;
  readonly hasAllItems: boolean;
  readonly active: boolean;
}

export function selectFulfillingBranch(
  preferred: BranchCandidate | undefined,
  candidates: readonly BranchCandidate[],
): BranchCandidate | null {
  // If the preferred branch has all items, it prepares (no derivation).
  if (preferred?.active && preferred.hasAllItems) return preferred;
  const eligible = candidates
    .filter((c) => c.active && c.hasAllItems)
    .sort((a, b) => a.priority - b.priority);
  return eligible[0] ?? null;
}

// Section 14.2: quantity rendering for the printed sheet.
export function formatQuantity(value: number, unit: "KG" | "UNIT" | "BUNCH"): string {
  if (unit !== "KG") {
    const n = Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
    return `${n} u`;
  }
  if (value === 0.5) return "1/2 kg";
  if (value === 0.25) return "1/4 kg";
  if (value === 0.75) return "3/4 kg";
  const text = String(value).replace(".", ",");
  return `${text} kg`;
}

// RNF-23: Argentine money formatting.
export function formatMoneyArs(amount: number): string {
  const integer = Math.trunc(amount);
  const decimals = Math.round((amount - integer) * 100);
  const groups = String(integer).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (decimals === 0) return `$ ${groups}`;
  return `$ ${groups},${String(decimals).padStart(2, "0")}`;
}

// BR-11: notes length cap.
export const MAX_NOTE_LENGTH = 200;

export function truncateNote(note: string): string {
  return note.length <= MAX_NOTE_LENGTH ? note : note.slice(0, MAX_NOTE_LENGTH);
}

// BR-34 / RF-34: audio length cap (seconds).
export const MAX_AUDIO_SECONDS = 120;

export function isAudioTooLong(durationSeconds: number): boolean {
  return durationSeconds > MAX_AUDIO_SECONDS;
}