import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export type OnboardingStep = "privacy" | "name" | "address" | "branch" | "done";

export interface OnboardingContext {
  readonly step: OnboardingStep;
  readonly name?: string;
  readonly address?: string;
  readonly usualFulfillment?: "PICKUP" | "DELIVERY";
}

/**
 * Starts or continues the onboarding flow for a new customer.
 * Returns the message to send and the next step.
 */
export async function startOnboarding(
  _db: Database,
  _phoneE164: string,
): Promise<{ message: string; step: OnboardingStep }> {
  return {
    message:
      "Hola, soy el asistente de La Verdu. Para tomar tu pedido necesito tu nombre, la dirección si querés envío y la sucursal que preferís. Tus datos se usan solo para gestionar tus pedidos. ¿Seguimos?",
    step: "privacy",
  };
}

/**
 * Processes an onboarding response and advances to the next step.
 * Returns the next message and step, or null if onboarding is complete.
 */
export async function processOnboardingStep(
  db: Database,
  phoneE164: string,
  context: OnboardingContext,
  response: string,
): Promise<{
  message: string;
  step: OnboardingStep;
  completed: boolean;
  customer?: typeof schema.customer.$inferSelect;
}> {
  const trimmed = response.trim();

  switch (context.step) {
    case "privacy": {
      // Accept any affirmative response.
      if (!isAffirmative(trimmed)) {
        return {
          message: "Necesito tu confirmación para continuar. ¿Seguimos?",
          step: "privacy",
          completed: false,
        };
      }
      return {
        message: "¿Cómo te llamás?",
        step: "name",
        completed: false,
      };
    }

    case "name": {
      if (trimmed.length < 2) {
        return {
          message: "¿Cómo te llamás?",
          step: "name",
          completed: false,
        };
      }
      return {
        message: `Gracias, ${trimmed}. ¿Querés que te enviemos el pedido a domicilio o preferís retirarlo en el local? (respondé "domicilio" o "retiro")`,
        step: "address",
        completed: false,
      };
    }

    case "address": {
      const lower = trimmed.toLowerCase();
      let usualFulfillment: "PICKUP" | "DELIVERY" = "PICKUP";
      let address: string | undefined;

      if (lower.includes("domicilio") || lower.includes("envio") || lower.includes("envío")) {
        usualFulfillment = "DELIVERY";
        // Ask for address.
        if (!context.address) {
          return {
            message: "¿Cuál es tu dirección para el envío?",
            step: "address",
            completed: false,
          };
        }
      } else if (lower.includes("retiro") || lower.includes("retirar")) {
        usualFulfillment = "PICKUP";
      } else if (trimmed.length > 5 && !context.address) {
        // Treat as address input.
        address = trimmed;
        usualFulfillment = "DELIVERY";
      }

      if (usualFulfillment === "DELIVERY" && !address && !context.address) {
        return {
          message: "¿Cuál es tu dirección para el envío?",
          step: "address",
          completed: false,
        };
      }

      const finalAddress = address ?? context.address;
      void finalAddress;
      const finalFulfillment = usualFulfillment;
      void finalFulfillment;

      // Ask for preferred branch.
      const branches = await db.select().from(schema.branch).where(eq(schema.branch.active, true));
      const branchList = branches.map((b) => b.shortName).join(", ");
      return {
        message: `¿Cuál es tu sucursal preferida? (${branchList})`,
        step: "branch",
        completed: false,
      };
    }

    case "branch": {
      const branches = await db.select().from(schema.branch).where(eq(schema.branch.active, true));
      const selected = branches.find((b) => b.shortName.toLowerCase() === trimmed.toLowerCase());

      if (!selected) {
        const branchList = branches.map((b) => b.shortName).join(", ");
        return {
          message: `No encontré esa sucursal. ¿Cuál es tu sucursal preferida? (${branchList})`,
          step: "branch",
          completed: false,
        };
      }

      // Create the customer.
      const customer = await db
        .insert(schema.customer)
        .values({
          phoneE164,
          name: context.name ?? "Cliente",
          addressText: context.address ?? null,
          usualFulfillment: context.usualFulfillment ?? "PICKUP",
          preferredBranchId: selected.id,
          consentAt: new Date(),
        })
        .returning();

      const created = customer[0];
      if (!created) {
        return {
          message: "Hubo un error al registrar tus datos. Intentá de nuevo.",
          step: "branch",
          completed: false,
        };
      }

      return {
        message: `Listo, ${context.name}. Ya podés hacer tu pedido. ¿Qué necesitás?`,
        step: "done",
        completed: true,
        customer: created,
      };
    }

    default:
      return {
        message: "¿Qué necesitás?",
        step: "done",
        completed: true,
      };
  }
}

function isAffirmative(text: string): boolean {
  const lower = text.toLowerCase();
  return ["sí", "si", "s", "yes", "ok", "dale", "claro", "perfecto"].some((w) => lower.includes(w));
}
