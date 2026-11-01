CREATE TYPE "public"."actor_type" AS ENUM('CUSTOMER', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('OPEN', 'ACKNOWLEDGED');--> statement-breakpoint
CREATE TYPE "public"."availability_status" AS ENUM('AVAILABLE', 'UNAVAILABLE', 'PENDING_CHECK');--> statement-breakpoint
CREATE TYPE "public"."change_set_status" AS ENUM('PENDING_CONFIRMATION', 'APPLIED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."conversation_state" AS ENUM('BOT', 'ESCALATED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_type" AS ENUM('PICKUP', 'DELIVERY');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('INBOUND', 'OUTBOUND');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('TEXT', 'AUDIO', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('CUSTOMER', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'CONFIRMED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_method_code" AS ENUM('CASH', 'TRANSFER', 'MERCADO_PAGO', 'CURRENT_ACCOUNT');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('TO_COLLECT', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."prep_status" AS ENUM('PENDING', 'IN_PREPARATION', 'READY', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "public"."print_kind" AS ENUM('NEW', 'MODIFICATION', 'CANCELLATION');--> statement-breakpoint
CREATE TYPE "public"."print_status" AS ENUM('QUEUED', 'HELD', 'DISPATCHED', 'PRINTED', 'FAILED', 'ABANDONED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."product_unit" AS ENUM('KG', 'UNIT', 'BUNCH');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('OWNER', 'SELLER');--> statement-breakpoint
CREATE TABLE "agent_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"agent_version" varchar(40),
	"last_seen_at" timestamp with time zone,
	"printer_status" varchar(40),
	CONSTRAINT "agent_session_branch_id_unique" UNIQUE("branch_id")
);
--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid,
	"kind" varchar(40) NOT NULL,
	"order_id" uuid,
	"message" text NOT NULL,
	"status" "alert_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor" varchar(120) NOT NULL,
	"action" varchar(80) NOT NULL,
	"entity" varchar(60) NOT NULL,
	"entity_id" varchar(80),
	"before_json" jsonb,
	"after_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_name" varchar(20) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"address" text,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"day_start_at" time NOT NULL,
	"delivery_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"printer_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_short_name_unique" UNIQUE("short_name"),
	CONSTRAINT "branch_short_name_not_blank" CHECK (length(trim("branch"."short_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "branch_payment_method" (
	"branch_id" uuid NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "branch_payment_method_branch_id_payment_method_id_pk" PRIMARY KEY("branch_id","payment_method_id")
);
--> statement-breakpoint
CREATE TABLE "branch_product" (
	"branch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price_amount" numeric(12, 2),
	"price_unit" "product_unit",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_product_branch_id_product_id_pk" PRIMARY KEY("branch_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "branch_product_day" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"availability" "availability_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_staff_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" "change_set_status" DEFAULT 'PENDING_CONFIRMATION' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" varchar(16) NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"state" "conversation_state" DEFAULT 'BOT' NOT NULL,
	"draft_order_id" uuid,
	"context_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" varchar(16) NOT NULL,
	"name" varchar(80),
	"address_text" text,
	"usual_fulfillment" "fulfillment_type" DEFAULT 'PICKUP' NOT NULL,
	"preferred_branch_id" uuid,
	"consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wa_message_id" varchar(128) NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"type" "message_type" NOT NULL,
	"body_text" text,
	"transcript" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_wa_message_id_unique" UNIQUE("wa_message_id")
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" bigint GENERATED ALWAYS AS IDENTITY (sequence name "order_order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_id" uuid NOT NULL,
	"preferred_branch_id" uuid,
	"fulfilling_branch_id" uuid,
	"derived" boolean DEFAULT false NOT NULL,
	"fulfillment" "fulfillment_type" NOT NULL,
	"pickup_time" time,
	"delivery_address_snapshot" text,
	"delivery_time" time,
	"payment_method_id" uuid,
	"payment_status" "payment_status",
	"prep_status" "prep_status",
	"notes" varchar(200),
	"status" "order_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source" "order_source" NOT NULL,
	"created_by_staff_id" uuid,
	"wa_message_id" varchar(128),
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "order_wa_message_id_unique" UNIQUE("wa_message_id"),
	CONSTRAINT "order_version_positive" CHECK ("order"."version" >= 1),
	CONSTRAINT "order_pickup_requires_time_or_draft" CHECK ("order"."status" = 'DRAFT' or "order"."fulfillment" = 'DELIVERY' or "order"."pickup_time" is not null)
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit" "product_unit" NOT NULL,
	"requested_text" varchar(200),
	CONSTRAINT "order_item_quantity_positive" CHECK ("order_item"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_method" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "payment_method_code" NOT NULL,
	"label" varchar(40) NOT NULL,
	CONSTRAINT "payment_method_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "print_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_version" integer NOT NULL,
	"branch_id" uuid NOT NULL,
	"kind" "print_kind" NOT NULL,
	"payload_escpos" "bytea",
	"preview_text" text,
	"status" "print_status" DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"printed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"official_name" varchar(80) NOT NULL,
	"unit" "product_unit" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_official_name_unique" UNIQUE("official_name")
);
--> statement-breakpoint
CREATE TABLE "product_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"text_normalized" varchar(80) NOT NULL,
	CONSTRAINT "product_alias_text_normalized_unique" UNIQUE("text_normalized")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" varchar(16) NOT NULL,
	"name" varchar(80) NOT NULL,
	"role" "staff_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "staff_branch" (
	"staff_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	CONSTRAINT "staff_branch_staff_id_branch_id_pk" PRIMARY KEY("staff_id","branch_id")
);
--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_payment_method" ADD CONSTRAINT "branch_payment_method_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_payment_method" ADD CONSTRAINT "branch_payment_method_payment_method_id_payment_method_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_method"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_product" ADD CONSTRAINT "branch_product_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_product" ADD CONSTRAINT "branch_product_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_product_day" ADD CONSTRAINT "branch_product_day_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_product_day" ADD CONSTRAINT "branch_product_day_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_set" ADD CONSTRAINT "change_set_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_set" ADD CONSTRAINT "change_set_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_draft_order_id_order_id_fk" FOREIGN KEY ("draft_order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_preferred_branch_id_branch_id_fk" FOREIGN KEY ("preferred_branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_preferred_branch_id_branch_id_fk" FOREIGN KEY ("preferred_branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_fulfilling_branch_id_branch_id_fk" FOREIGN KEY ("fulfilling_branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_payment_method_id_payment_method_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_method"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_alias" ADD CONSTRAINT "product_alias_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_branch" ADD CONSTRAINT "staff_branch_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_branch" ADD CONSTRAINT "staff_branch_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_product_day_unique" ON "branch_product_day" USING btree ("branch_id","product_id","business_date");