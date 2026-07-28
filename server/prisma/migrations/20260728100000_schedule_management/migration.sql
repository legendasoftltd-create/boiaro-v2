BEGIN;

ALTER TABLE "show_schedules" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "cover_image_url" TEXT,
ADD COLUMN     "schedule_type" TEXT NOT NULL DEFAULT 'recurring',
ADD COLUMN     "specific_date" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

CREATE TABLE "schedule_change_requests" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "rj_user_id" TEXT NOT NULL,
    "request_type" TEXT NOT NULL,
    "proposed_day_of_week" INTEGER,
    "proposed_start_time" TEXT,
    "proposed_end_time" TEXT,
    "proposed_specific_date" TIMESTAMP(3),
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "schedule_change_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "schedule_change_requests" ADD CONSTRAINT "schedule_change_requests_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "show_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
