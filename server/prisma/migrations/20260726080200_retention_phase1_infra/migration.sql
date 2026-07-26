-- User retention plan: foundational schema for badges (fix), leaderboard
-- aggregation, spin wheel, quiz, and mega-competitions.

BEGIN;

-- CreateTable
CREATE TABLE "spin_wheel_configs" (
    "id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "segments" JSONB NOT NULL,
    "spins_per_day" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spin_wheel_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spin_results" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "segment_label" TEXT NOT NULL,
    "coin_reward" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spin_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "coin_reward" INTEGER NOT NULL DEFAULT 0,
    "pass_percentage" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_index" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "coin_reward" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metric" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "prize_coin_top1" INTEGER,
    "prize_coin_top2" INTEGER,
    "prize_coin_top3" INTEGER,
    "prize_description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "winners_processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spin_results_user_id_created_at_idx" ON "spin_results"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_user_id_quiz_id_key" ON "quiz_attempts"("user_id", "quiz_id");

-- CreateIndex
CREATE INDEX "coin_transactions_type_created_at_idx" ON "coin_transactions"("type", "created_at");

-- CreateIndex
CREATE INDEX "content_consumption_time_format_created_at_idx" ON "content_consumption_time"("format", "created_at");

-- CreateIndex
CREATE INDEX "content_consumption_time_user_id_format_created_at_idx" ON "content_consumption_time"("user_id", "format", "created_at");

-- AddForeignKey
ALTER TABLE "spin_results" ADD CONSTRAINT "spin_results_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "spin_wheel_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the 4 badges from the retention spec (book-completion x3 + streak).
-- Uses ON CONFLICT on the unique `key` so this is safe to re-run.
INSERT INTO "badge_definitions" (id, key, title, description, category, condition_type, condition_value, coin_reward, sort_order, is_active)
VALUES
  (gen_random_uuid()::text, 'first_book', '🥉 প্রথম বই', '১টি বই সম্পূর্ণ শেষ করলে', 'reading', 'book_completion', 1, 20, 1, true),
  (gen_random_uuid()::text, 'reader', '🥈 পাঠক', '৫টি বই সম্পূর্ণ শেষ করলে', 'reading', 'book_completion', 5, 50, 2, true),
  (gen_random_uuid()::text, 'bookworm', '🥇 বই পোকা', '১০টি বই সম্পূর্ণ শেষ করলে', 'reading', 'book_completion', 10, 100, 3, true),
  (gen_random_uuid()::text, 'seven_day_streak', '🔥 ৭ দিনের ধারা', 'টানা ৭ দিন পড়া বজায় রাখলে', 'streak', 'streak', 7, 30, 4, true)
ON CONFLICT (key) DO NOTHING;

COMMIT;
