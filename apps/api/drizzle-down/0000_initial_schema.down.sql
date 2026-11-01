DROP TABLE IF EXISTS "agent_session", "alert", "audit_log", "branch_payment_method",
  "branch_product_day", "branch_product", "change_set", "message", "conversation",
  "print_job", "order_item", "order", "payment_method", "product_alias", "product",
  "staff_branch", "staff", "customer", "branch" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "actor_type", "alert_status", "availability_status", "change_set_status",
  "conversation_state", "fulfillment_type", "message_direction", "message_type",
  "order_source", "order_status", "payment_method_code", "payment_status", "prep_status",
  "print_kind", "print_status", "product_unit", "staff_role";
