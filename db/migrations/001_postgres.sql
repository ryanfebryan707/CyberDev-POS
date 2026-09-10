CREATE TABLE IF NOT EXISTS "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_email" text NOT NULL,
	"phone" text,
	"status" text DEFAULT 'demo' NOT NULL,
	"plan_code" text DEFAULT 'demo' NOT NULL,
	"active_until" BIGINT,
	"created_at" BIGINT NOT NULL
, "store_slug" text, "demo_expires_at" BIGINT, "updated_at" BIGINT, "address" text, "city" text, "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION, "last_location_at" BIGINT, "location_accuracy" DOUBLE PRECISION, "location_consent_at" BIGINT, "device_authorized_at" BIGINT, "last_ip" text, "business_type" text DEFAULT 'general' NOT NULL, "data_revision" BIGINT DEFAULT 1 NOT NULL);

CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"role" text NOT NULL,
	"is_active" BIGINT DEFAULT 1 NOT NULL,
	"password_changed_at" BIGINT,
	"last_login_at" BIGINT,
	"created_at" BIGINT NOT NULL,
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" BIGINT NOT NULL,
	"created_at" BIGINT NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "auth_login_attempts" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"attempts" BIGINT DEFAULT 0 NOT NULL,
	"window_started_at" BIGINT NOT NULL,
	"blocked_until" BIGINT,
	"updated_at" BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS "products" (
	"id" BIGSERIAL PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"barcode" text,
	"price" BIGINT NOT NULL,
	"cost" BIGINT DEFAULT 0 NOT NULL,
	"stock" DOUBLE PRECISION DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"low_stock" DOUBLE PRECISION DEFAULT 5 NOT NULL,
	"created_at" BIGINT NOT NULL,
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"cashier_name" text NOT NULL,
	"subtotal" BIGINT NOT NULL,
	"tax" BIGINT DEFAULT 0 NOT NULL,
	"discount" BIGINT DEFAULT 0 NOT NULL,
	"total" BIGINT NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"created_at" BIGINT NOT NULL, "customer_name" text DEFAULT 'Umum' NOT NULL, "amount_received" BIGINT DEFAULT 0 NOT NULL, "change_amount" BIGINT DEFAULT 0 NOT NULL,
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "transaction_items" (
	"id" BIGSERIAL PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"product_id" BIGINT NOT NULL,
	"product_name" text NOT NULL,
	"barcode" text,
	"quantity" DOUBLE PRECISION NOT NULL,
	"unit_price" BIGINT NOT NULL,
	"line_total" BIGINT NOT NULL, "unit_cost" BIGINT DEFAULT 0 NOT NULL,
	FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("product_id") REFERENCES "products"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"plan_code" text NOT NULL,
	"amount" BIGINT NOT NULL,
	"payment_reference" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"starts_at" BIGINT,
	"ends_at" BIGINT,
	"created_at" BIGINT NOT NULL,
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"plan_code" text NOT NULL,
	"amount" BIGINT NOT NULL,
	"method" text DEFAULT 'manual' NOT NULL,
	"reference" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" BIGINT NOT NULL,
	"verified_at" BIGINT,
	"verified_by" text,
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"user_id" text,
	"action" text NOT NULL,
	"details" text,
	"created_at" BIGINT NOT NULL,
	FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"is_active" BIGINT DEFAULT 1 NOT NULL,
	"expires_at" BIGINT,
	"created_by" text,
	"created_at" BIGINT NOT NULL,
	FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS "announcement_reads" (
	"id" text PRIMARY KEY NOT NULL,
	"announcement_id" text NOT NULL,
	"user_id" text NOT NULL,
	"read_at" BIGINT NOT NULL,
	FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON UPDATE no action ON DELETE no action,
	FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_owner_email_unique" ON "tenants" ("owner_email");

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_store_slug_unique" ON "tenants" ("store_slug");

CREATE INDEX IF NOT EXISTS "audit_logs_tenant_created_idx" ON "audit_logs" ("tenant_id","created_at");

CREATE INDEX IF NOT EXISTS "auth_sessions_user_idx" ON "auth_sessions" ("user_id");

CREATE INDEX IF NOT EXISTS "payments_tenant_submitted_idx" ON "payments" ("tenant_id","submitted_at");

CREATE INDEX IF NOT EXISTS "products_tenant_barcode_idx" ON "products" ("tenant_id","barcode");

CREATE INDEX IF NOT EXISTS "subscriptions_tenant_ends_idx" ON "subscriptions" ("tenant_id","ends_at");

CREATE INDEX IF NOT EXISTS "tenants_status_created_idx" ON "tenants" ("status","created_at");

CREATE INDEX IF NOT EXISTS "transaction_items_transaction_idx" ON "transaction_items" ("transaction_id");

CREATE INDEX IF NOT EXISTS "transactions_tenant_created_idx" ON "transactions" ("tenant_id","created_at");

CREATE INDEX IF NOT EXISTS "users_tenant_idx" ON "users" ("tenant_id");

CREATE INDEX IF NOT EXISTS "auth_login_attempts_updated_idx" ON "auth_login_attempts" ("updated_at");

CREATE UNIQUE INDEX IF NOT EXISTS "announcement_reads_announcement_user_idx" ON "announcement_reads" ("announcement_id","user_id");

CREATE INDEX IF NOT EXISTS "announcement_reads_user_idx" ON "announcement_reads" ("user_id");

CREATE INDEX IF NOT EXISTS "announcements_active_created_idx" ON "announcements" ("is_active","created_at");
