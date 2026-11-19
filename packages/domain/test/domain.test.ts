import { describe, expect, it } from "vitest";
import {
  CONFIRM_WORDS,
  REJECT_WORDS,
  formatMoneyArs,
  formatQuantity,
  isAudioTooLong,
  isAvailableForSale,
  isConfirmWord,
  isRejectWord,
  MAX_AUDIO_SECONDS,
  MAX_NOTE_LENGTH,
  nextDayAvailability,
  selectFulfillingBranch,
  truncateNote,
} from "../src/index.js";

describe("domain (BR-*)", () => {
  it("BR-01/BR-07 confirm and reject word sets", () => {
    expect(isConfirmWord("SÍ")).toBe(true);
    expect(isConfirmWord("dale")).toBe(true);
    expect(isConfirmWord("👍")).toBe(false);
    expect(isRejectWord("no")).toBe(true);
    expect(isRejectWord("cancelar")).toBe(true);
    expect(isRejectWord("tal vez")).toBe(false);
    expect(CONFIRM_WORDS.has("correcto")).toBe(true);
    expect(REJECT_WORDS.has("anular")).toBe(true);
  });

  it("BR-04/BR-05 availability semantics", () => {
    expect(isAvailableForSale("AVAILABLE")).toBe(true);
    expect(isAvailableForSale("UNAVAILABLE")).toBe(false);
    expect(isAvailableForSale("PENDING_CHECK")).toBe(false);
    expect(isAvailableForSale(null)).toBe(true);
    expect(nextDayAvailability("UNAVAILABLE")).toBe("PENDING_CHECK");
    expect(nextDayAvailability("AVAILABLE")).toBe("AVAILABLE");
    expect(nextDayAvailability(null)).toBe("AVAILABLE");
  });

  it("BR-15 derivation selects by priority and falls back", () => {
    const preferred = { id: "p", shortName: "CENTRO", priority: 1, hasAllItems: false, active: true };
    const candidates = [
      { id: "a", shortName: "NORTE", priority: 2, hasAllItems: true, active: true },
      { id: "b", shortName: "SUR", priority: 1, hasAllItems: true, active: true },
    ];
    expect(selectFulfillingBranch(preferred, candidates)?.shortName).toBe("SUR");
    const preferredOk = { ...preferred, hasAllItems: true };
    expect(selectFulfillingBranch(preferredOk, candidates)?.shortName).toBe("CENTRO");
    const none = selectFulfillingBranch(preferred, [
      { id: "x", shortName: "X", priority: 1, hasAllItems: false, active: true },
    ]);
    expect(none).toBeNull();
  });

  it("section 14.2 quantity rendering", () => {
    expect(formatQuantity(0.5, "KG")).toBe("1/2 kg");
    expect(formatQuantity(0.25, "KG")).toBe("1/4 kg");
    expect(formatQuantity(0.75, "KG")).toBe("3/4 kg");
    expect(formatQuantity(1.5, "KG")).toBe("1,5 kg");
    expect(formatQuantity(2, "UNIT")).toBe("2 u");
  });

  it("RNF-23 Argentine money formatting", () => {
    expect(formatMoneyArs(3600)).toBe("$ 3.600");
    expect(formatMoneyArs(2400.5)).toBe("$ 2.400,50");
    expect(formatMoneyArs(100)).toBe("$ 100");
  });

  it("BR-11 note cap and RF-34 audio cap", () => {
    expect(MAX_NOTE_LENGTH).toBe(200);
    expect(truncateNote("a".repeat(250))).toHaveLength(200);
    expect(MAX_AUDIO_SECONDS).toBe(120);
    expect(isAudioTooLong(121)).toBe(true);
    expect(isAudioTooLong(120)).toBe(false);
  });
});
