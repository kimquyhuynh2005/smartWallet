-- BUD-03: budgets remember how much of their limit was carried over, so re-running a rollover is idempotent
ALTER TABLE "budgets" ADD COLUMN "rollover_amount" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_rollover_nonneg" CHECK ("rollover_amount" >= 0);

-- ALR-02: per-channel mutes
ALTER TABLE "users" ADD COLUMN "notification_settings" JSONB NOT NULL DEFAULT '{"inApp": true, "email": true, "weeklySummary": true, "goalReminders": true}';

-- CAT-04: one personal rule per (user, keyword, category); makes "upsert + hits+1" race-free
CREATE UNIQUE INDEX "category_rules_personal_unique" ON "category_rules"("user_id", "keyword", "category_id") WHERE "user_id" IS NOT NULL AND "deleted_at" IS NULL;
