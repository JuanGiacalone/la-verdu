import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Database schema, derived from PRD.md section 8. Table and column names are
 * English snake_case. Enum values are the domain codes from the PRD.
 */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * E.164 shape for Argentine and other numbers: "+" then 8 to 15 digits, first digit
 * not zero. Rejects free text in phone columns (verifier advisory A1).
 */
function phoneFormat(column: AnyPgColumn) {
  return sql`${column} ~ '^\\+[1-9][0-9]{7,14}$'`;
}

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const staffRole = pgEnum("staff_role", ["OWNER", "SELLER"]);
export const fulfillmentType = pgEnum("fulfillment_type", ["PICKUP", "DELIVERY"]);
export const productUnit = pgEnum("product_unit", ["KG", "UNIT", "BUNCH"]);
export const availabilityStatus = pgEnum("availability_status", [
  "AVAILABLE",
  "UNAVAILABLE",
  "PENDING_CHECK",
]);
export const paymentMethodCode = pgEnum("payment_method_code", [
  "CASH",
  "TRANSFER",
  "MERCADO_PAGO",
  "CURRENT_ACCOUNT",
]);
export const orderStatus = pgEnum("order_status", ["DRAFT", "CONFIRMED", "CANCELLED"]);
export const orderSource = pgEnum("order_source", ["CUSTOMER", "STAFF"]);
export const paymentStatus = pgEnum("payment_status", ["TO_COLLECT", "PAID"]);
export const prepStatus = pgEnum("prep_status", [
  "PENDING",
  "IN_PREPARATION",
  "READY",
  "DELIVERED",
]);
export const printKind = pgEnum("print_kind", ["NEW", "MODIFICATION", "CANCELLATION"]);
export const printStatus = pgEnum("print_status", [
  "QUEUED",
  "HELD",
  "DISPATCHED",
  "PRINTED",
  "FAILED",
  "ABANDONED",
  "SUPERSEDED",
]);
export const conversationState = pgEnum("conversation_state", ["BOT", "ESCALATED", "CLOSED"]);
export const actorType = pgEnum("actor_type", ["CUSTOMER", "STAFF"]);
export const messageDirection = pgEnum("message_direction", ["INBOUND", "OUTBOUND"]);
export const messageType = pgEnum("message_type", ["TEXT", "AUDIO", "OTHER"]);
export const changeSetStatus = pgEnum("change_set_status", [
  "PENDING_CONFIRMATION",
  "APPLIED",
  "REJECTED",
  "EXPIRED",
]);
export const alertStatus = pgEnum("alert_status", ["OPEN", "ACKNOWLEDGED"]);

export const branch = pgTable(
  "branch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shortName: varchar("short_name", { length: 20 }).notNull().unique(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    address: text("address"),
    timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
    dayStartAt: time("day_start_at").notNull(),
    deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    active: boolean("active").notNull().default(true),
    printerAddress: text("printer_address"),
    ...timestamps,
  },
  (table) => [check("branch_short_name_not_blank", sql`length(trim(${table.shortName})) > 0`)],
);

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneE164: varchar("phone_e164", { length: 16 }).notNull().unique(),
    name: varchar("name", { length: 80 }).notNull(),
    role: staffRole("role").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => [check("staff_phone_e164_format", phoneFormat(table.phoneE164))],
);

export const staffBranch = pgTable(
  "staff_branch",
  {
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.staffId, table.branchId] })],
);

export const customer = pgTable(
  "customer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneE164: varchar("phone_e164", { length: 16 }).notNull().unique(),
    name: varchar("name", { length: 80 }),
    addressText: text("address_text"),
    usualFulfillment: fulfillmentType("usual_fulfillment").notNull().default("PICKUP"),
    preferredBranchId: uuid("preferred_branch_id").references(() => branch.id),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    orderCount: integer("order_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [check("customer_phone_e164_format", phoneFormat(table.phoneE164))],
);

export const product = pgTable("product", {
  id: uuid("id").primaryKey().defaultRandom(),
  officialName: varchar("official_name", { length: 80 }).notNull().unique(),
  unit: productUnit("unit").notNull(),
  referencePrice: numeric("reference_price", { precision: 12, scale: 2 }),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** Single-row configuration of the business instance (name, owner, contact). */
export const business = pgTable("business", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  ownerName: varchar("owner_name", { length: 80 }),
  phoneE164: varchar("phone_e164", { length: 16 }),
  addressText: text("address_text"),
  agentNotes: text("agent_notes"),
  ...timestamps,
});

export const productAlias = pgTable("product_alias", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  textNormalized: varchar("text_normalized", { length: 80 }).notNull().unique(),
});

/** Current price per branch and product. No report time is stored (PRD BR-06). */
export const branchProduct = pgTable(
  "branch_product",
  {
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    priceAmount: numeric("price_amount", { precision: 12, scale: 2 }),
    priceUnit: productUnit("price_unit"),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.branchId, table.productId] }),
    check(
      "branch_product_price_not_negative",
      sql`${table.priceAmount} is null or ${table.priceAmount} >= 0`,
    ),
  ],
);

/** Daily availability override per branch and product (PRD BR-04, BR-05). */
export const branchProductDay = pgTable(
  "branch_product_day",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    businessDate: date("business_date").notNull(),
    availability: availabilityStatus("availability").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("branch_product_day_unique").on(
      table.branchId,
      table.productId,
      table.businessDate,
    ),
  ],
);

export const paymentMethod = pgTable("payment_method", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: paymentMethodCode("code").notNull().unique(),
  label: varchar("label", { length: 40 }).notNull(),
  active: boolean("active").notNull().default(true),
});

export const branchPaymentMethod = pgTable(
  "branch_payment_method",
  {
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id, { onDelete: "cascade" }),
    paymentMethodId: uuid("payment_method_id")
      .notNull()
      .references(() => paymentMethod.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.branchId, table.paymentMethodId] })],
);

export const order = pgTable(
  "order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: bigint("order_number", { mode: "number" }).generatedAlwaysAsIdentity().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    preferredBranchId: uuid("preferred_branch_id").references(() => branch.id),
    fulfillingBranchId: uuid("fulfilling_branch_id").references(() => branch.id),
    derived: boolean("derived").notNull().default(false),
    fulfillment: fulfillmentType("fulfillment").notNull(),
    pickupTime: time("pickup_time"),
    deliveryAddressSnapshot: text("delivery_address_snapshot"),
    deliveryTime: time("delivery_time"),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethod.id),
    paymentStatus: paymentStatus("payment_status"),
    prepStatus: prepStatus("prep_status"),
    notes: varchar("notes", { length: 200 }),
    status: orderStatus("status").notNull().default("DRAFT"),
    version: integer("version").notNull().default(1),
    source: orderSource("source").notNull(),
    createdByStaffId: uuid("created_by_staff_id").references(() => staff.id),
    waMessageId: varchar("wa_message_id", { length: 128 }).unique(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check("order_version_positive", sql`${table.version} >= 1`),
    check(
      "order_pickup_requires_time_or_draft",
      sql`${table.status} = 'DRAFT' or ${table.fulfillment} = 'DELIVERY' or ${table.pickupTime} is not null`,
    ),
  ],
);

export const orderItem = pgTable(
  "order_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
    unit: productUnit("unit").notNull(),
    requestedText: varchar("requested_text", { length: 200 }),
  },
  (table) => [check("order_item_quantity_positive", sql`${table.quantity} > 0`)],
);

export const printJob = pgTable(
  "print_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    orderVersion: integer("order_version").notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    kind: printKind("kind").notNull(),
    payloadEscpos: bytea("payload_escpos"),
    previewText: text("preview_text"),
    status: printStatus("status").notNull().default("QUEUED"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    printedAt: timestamp("printed_at", { withTimezone: true }),
  },
  (table) => [check("print_job_order_version_positive", sql`${table.orderVersion} >= 1`)],
);

export const conversation = pgTable(
  "conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneE164: varchar("phone_e164", { length: 16 }).notNull().unique(),
    actorType: actorType("actor_type").notNull(),
    state: conversationState("state").notNull().default("BOT"),
    draftOrderId: uuid("draft_order_id").references(() => order.id),
    contextJson: jsonb("context_json").notNull().default({}),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [check("conversation_phone_e164_format", phoneFormat(table.phoneE164))],
);

export const message = pgTable("message", {
  id: uuid("id").primaryKey().defaultRandom(),
  waMessageId: varchar("wa_message_id", { length: 128 }).notNull().unique(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  direction: messageDirection("direction").notNull(),
  type: messageType("type").notNull(),
  bodyText: text("body_text"),
  transcript: text("transcript"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alert = pgTable("alert", {
  id: uuid("id").primaryKey().defaultRandom(),
  branchId: uuid("branch_id").references(() => branch.id),
  kind: varchar("kind", { length: 40 }).notNull(),
  orderId: uuid("order_id").references(() => order.id),
  message: text("message").notNull(),
  status: alertStatus("status").notNull().default("OPEN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});

export const changeSet = pgTable("change_set", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorStaffId: uuid("actor_staff_id")
    .notNull()
    .references(() => staff.id),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branch.id),
  payloadJson: jsonb("payload_json").notNull(),
  status: changeSetStatus("status").notNull().default("PENDING_CONFIRMATION"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
  actor: varchar("actor", { length: 120 }).notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 60 }).notNull(),
  entityId: varchar("entity_id", { length: 80 }),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentSession = pgTable("agent_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  branchId: uuid("branch_id")
    .notNull()
    .unique()
    .references(() => branch.id, { onDelete: "cascade" }),
  agentVersion: varchar("agent_version", { length: 40 }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  printerStatus: varchar("printer_status", { length: 40 }),
});

export const adminRole = pgEnum("admin_role", ["OWNER", "OPERATOR"]);

export const adminUser = pgTable("admin_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 40 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});
