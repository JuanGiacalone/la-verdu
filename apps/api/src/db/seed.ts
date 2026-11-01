import { pathToFileURL } from "node:url";
import { createDatabase, type Database } from "./client.js";
import * as schema from "./schema.js";

/**
 * Development dataset from PRD.md section 19.4. Idempotent: every insert uses
 * the table's unique key, so running it twice leaves the database unchanged.
 * Phone numbers are fictional and reserved for local testing.
 */

const BRANCHES = [
  {
    shortName: "CENTRO",
    fullName: "La Verdu - Sucursal Centro",
    opensAt: "08:00",
    closesAt: "20:00",
    dayStartAt: "08:00",
    priority: 1,
  },
  {
    shortName: "NORTE",
    fullName: "La Verdu - Sucursal Norte",
    opensAt: "08:30",
    closesAt: "19:30",
    dayStartAt: "08:30",
    priority: 2,
  },
] as const;

const STAFF = [
  {
    phoneE164: "+5491100000100",
    name: "Dueño de prueba",
    role: "OWNER",
    branches: ["CENTRO", "NORTE"],
  },
  { phoneE164: "+5491100000101", name: "Vendedor Centro", role: "SELLER", branches: ["CENTRO"] },
  { phoneE164: "+5491100000102", name: "Vendedor Norte", role: "SELLER", branches: ["NORTE"] },
] as const;

const PRODUCTS = [
  { officialName: "Tomate perita", unit: "KG", aliases: ["tomate", "tomates"] },
  { officialName: "Lechuga crespa", unit: "UNIT", aliases: [] },
  { officialName: "Banana", unit: "KG", aliases: ["bananas", "cavendish"] },
  { officialName: "Papa", unit: "KG", aliases: [] },
  { officialName: "Naranja", unit: "KG", aliases: [] },
] as const;

const PAYMENT_METHODS = [
  { code: "CASH", label: "Efectivo" },
  { code: "TRANSFER", label: "Transferencia" },
  { code: "MERCADO_PAGO", label: "Mercado Pago" },
  { code: "CURRENT_ACCOUNT", label: "Cuenta corriente" },
] as const;

/** Three test customers: no preferred branch, CENTRO and NORTE preferred. */
const CUSTOMERS = [
  { phoneE164: "+5491100000201", name: "Cliente sin sucursal", preferredBranch: null },
  { phoneE164: "+5491100000202", name: "Cliente Centro", preferredBranch: "CENTRO" },
  { phoneE164: "+5491100000203", name: "Cliente Norte", preferredBranch: "NORTE" },
] as const;

export async function seedDatabase(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    for (const branch of BRANCHES) {
      await tx.insert(schema.branch).values(branch).onConflictDoNothing();
    }
    const branchRows = await tx.select().from(schema.branch);
    const branchId = (shortName: string) => {
      const row = branchRows.find((candidate) => candidate.shortName === shortName);
      if (!row) {
        throw new Error(`seed: branch ${shortName} missing after insert`);
      }
      return row.id;
    };

    for (const person of STAFF) {
      await tx
        .insert(schema.staff)
        .values({ phoneE164: person.phoneE164, name: person.name, role: person.role })
        .onConflictDoNothing();
    }
    const staffRows = await tx.select().from(schema.staff);
    for (const person of STAFF) {
      const staffRow = staffRows.find((row) => row.phoneE164 === person.phoneE164);
      if (!staffRow) {
        throw new Error(`seed: staff ${person.phoneE164} missing after insert`);
      }
      for (const shortName of person.branches) {
        await tx
          .insert(schema.staffBranch)
          .values({ staffId: staffRow.id, branchId: branchId(shortName) })
          .onConflictDoNothing();
      }
    }

    for (const product of PRODUCTS) {
      await tx
        .insert(schema.product)
        .values({ officialName: product.officialName, unit: product.unit })
        .onConflictDoNothing();
    }
    const productRows = await tx.select().from(schema.product);
    for (const product of PRODUCTS) {
      const productRow = productRows.find((row) => row.officialName === product.officialName);
      if (!productRow) {
        throw new Error(`seed: product ${product.officialName} missing after insert`);
      }
      for (const alias of product.aliases) {
        await tx
          .insert(schema.productAlias)
          .values({ productId: productRow.id, textNormalized: alias })
          .onConflictDoNothing();
      }
    }

    for (const method of PAYMENT_METHODS) {
      await tx
        .insert(schema.paymentMethod)
        .values({ code: method.code, label: method.label })
        .onConflictDoNothing();
    }
    const methodRows = await tx.select().from(schema.paymentMethod);
    for (const branch of BRANCHES) {
      for (const methodRow of methodRows) {
        await tx
          .insert(schema.branchPaymentMethod)
          .values({
            branchId: branchId(branch.shortName),
            paymentMethodId: methodRow.id,
            enabled: true,
          })
          .onConflictDoNothing();
      }
    }

    for (const customer of CUSTOMERS) {
      await tx
        .insert(schema.customer)
        .values({
          phoneE164: customer.phoneE164,
          name: customer.name,
          preferredBranchId: customer.preferredBranch ? branchId(customer.preferredBranch) : null,
          consentAt: new Date(),
        })
        .onConflictDoNothing();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write("DATABASE_URL is required to seed\n");
    process.exit(1);
  }
  const handle = createDatabase(databaseUrl, 2);
  seedDatabase(handle.db)
    .then(() => process.stdout.write("seed applied\n"))
    .catch((error: unknown) => {
      process.stderr.write(`seed failed: ${String(error)}\n`);
      process.exitCode = 1;
    })
    .finally(() => handle.close());
}
