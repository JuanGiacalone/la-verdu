ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "staff_phone_e164_format";--> statement-breakpoint
ALTER TABLE "customer" DROP CONSTRAINT IF EXISTS "customer_phone_e164_format";--> statement-breakpoint
ALTER TABLE "conversation" DROP CONSTRAINT IF EXISTS "conversation_phone_e164_format";--> statement-breakpoint
ALTER TABLE "print_job" DROP CONSTRAINT IF EXISTS "print_job_order_version_positive";--> statement-breakpoint
ALTER TABLE "branch_product" DROP CONSTRAINT IF EXISTS "branch_product_price_not_negative";--> statement-breakpoint
ALTER TABLE "payment_method" DROP COLUMN IF EXISTS "active";
