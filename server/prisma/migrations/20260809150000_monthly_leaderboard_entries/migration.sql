-- CreateTable
CREATE TABLE "monthly_leaderboard_entries" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "metric" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "total_seconds" INTEGER NOT NULL,
    "prize_type" TEXT NOT NULL DEFAULT 'manual',
    "prize_coins" INTEGER,
    "prize_paid_at" TIMESTAMP(3),
    "prize_name" TEXT,
    "prize_status" TEXT NOT NULL DEFAULT 'pending',
    "winner_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_leaderboard_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_leaderboard_entries_year_month_idx" ON "monthly_leaderboard_entries"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_leaderboard_entries_year_month_metric_rank_key" ON "monthly_leaderboard_entries"("year", "month", "metric", "rank");
