ALTER TABLE "payment_method" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "branch_product" ADD CONSTRAINT "branch_product_price_not_negative" CHECK ("branch_product"."price_amount" is null or "branch_product"."price_amount" >= 0);--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_phone_e164_format" CHECK ("conversation"."phone_e164" ~ '^\+[1-9][0-9]{7,14}$');--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_phone_e164_format" CHECK ("customer"."phone_e164" ~ '^\+[1-9][0-9]{7,14}$');--> statement-breakpoint
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_order_version_positive" CHECK ("print_job"."order_version" >= 1);--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_phone_e164_format" CHECK ("staff"."phone_e164" ~ '^\+[1-9][0-9]{7,14}$');