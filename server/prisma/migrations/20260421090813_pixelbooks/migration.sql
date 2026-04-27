-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('admin', 'moderator', 'user', 'writer', 'publisher', 'narrator', 'rj');

-- CreateEnum
CREATE TYPE "AudioQuality" AS ENUM ('standard', 'hd');

-- CreateEnum
CREATE TYPE "BindingType" AS ENUM ('paperback', 'hardcover');

-- CreateEnum
CREATE TYPE "BookFormatType" AS ENUM ('ebook', 'audiobook', 'hardcopy');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_ledger" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "book_id" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "description" TEXT,
    "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order_id" TEXT,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "source" TEXT NOT NULL DEFAULT 'system',
    "type" TEXT NOT NULL DEFAULT 'credit',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_banners" (
    "id" TEXT NOT NULL,
    "clicks" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "destination_url" TEXT,
    "device" TEXT,
    "display_order" INTEGER,
    "end_date" TIMESTAMP(3),
    "image_url" TEXT,
    "impressions" INTEGER DEFAULT 0,
    "placement_key" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "title" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" TEXT NOT NULL,
    "ad_type" TEXT NOT NULL DEFAULT 'banner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "placement_key" TEXT,
    "start_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "target_page" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_placements" (
    "id" TEXT NOT NULL,
    "ad_type" TEXT NOT NULL DEFAULT 'banner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device_visibility" TEXT,
    "display_priority" INTEGER,
    "frequency" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "placement_key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_activity_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "action_type" TEXT,
    "actor_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" TEXT,
    "ip_address" TEXT,
    "module" TEXT,
    "new_value" TEXT,
    "old_value" TEXT,
    "risk_level" TEXT NOT NULL DEFAULT 'low',
    "status" TEXT NOT NULL DEFAULT 'success',
    "target_id" TEXT,
    "target_type" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT,

    CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user_roles" (
    "id" TEXT NOT NULL,
    "admin_role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audiobook_tracks" (
    "id" TEXT NOT NULL,
    "audio_url" TEXT,
    "book_format_id" TEXT NOT NULL,
    "chapter_price" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "duration" TEXT,
    "is_preview" BOOLEAN DEFAULT false,
    "media_type" TEXT NOT NULL DEFAULT 'audio',
    "status" TEXT NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL,
    "track_number" INTEGER NOT NULL,

    CONSTRAINT "audiobook_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authors" (
    "id" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "genre" TEXT,
    "is_featured" BOOLEAN DEFAULT false,
    "is_trending" BOOLEAN DEFAULT false,
    "linked_at" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "phone" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_definitions" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'reading',
    "coin_reward" INTEGER,
    "condition_type" TEXT NOT NULL DEFAULT 'count',
    "condition_value" INTEGER,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "icon_url" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "key" TEXT NOT NULL,
    "sort_order" INTEGER,
    "title" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "badge_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" TEXT NOT NULL,
    "author_name" TEXT,
    "category" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "cover_image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excerpt" TEXT,
    "is_featured" BOOLEAN DEFAULT false,
    "publish_date" TIMESTAMP(3),
    "seo_description" TEXT,
    "seo_keywords" TEXT,
    "seo_title" TEXT,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "tags" TEXT[],
    "title" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_comments" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parent_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "book_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_contributors" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "format" TEXT,
    "role" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "book_contributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_formats" (
    "id" TEXT NOT NULL,
    "audio_quality" "AudioQuality",
    "binding" "BindingType",
    "book_id" TEXT NOT NULL,
    "chapters_count" INTEGER,
    "coin_price" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "default_packaging_cost" DOUBLE PRECISION,
    "delivery_days" INTEGER,
    "dimensions" TEXT,
    "discount" DOUBLE PRECISION,
    "duration" TEXT,
    "file_size" TEXT,
    "file_url" TEXT,
    "format" "BookFormatType" NOT NULL,
    "in_stock" BOOLEAN DEFAULT true,
    "is_available" BOOLEAN DEFAULT true,
    "isbn" TEXT,
    "narrator_id" TEXT,
    "original_price" DOUBLE PRECISION,
    "pages" INTEGER,
    "payout_model" TEXT NOT NULL DEFAULT 'standard',
    "preview_chapters" INTEGER,
    "preview_percentage" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "printing_cost" DOUBLE PRECISION,
    "publisher_commission_percent" DOUBLE PRECISION,
    "publisher_id" TEXT,
    "stock_count" INTEGER,
    "submission_status" TEXT NOT NULL DEFAULT 'pending',
    "submitted_by" TEXT,
    "unit_cost" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "weight" TEXT,
    "weight_kg_per_copy" DOUBLE PRECISION,

    CONSTRAINT "book_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_reads" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "book_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "author_id" TEXT,
    "category_id" TEXT,
    "coin_price" INTEGER,
    "cover_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "description_bn" TEXT,
    "is_bestseller" BOOLEAN DEFAULT false,
    "is_featured" BOOLEAN DEFAULT false,
    "is_free" BOOLEAN DEFAULT false,
    "is_new" BOOLEAN DEFAULT false,
    "is_premium" BOOLEAN DEFAULT false,
    "language" TEXT,
    "published_date" TIMESTAMP(3),
    "publisher_id" TEXT,
    "rating" DOUBLE PRECISION,
    "reviews_count" INTEGER DEFAULT 0,
    "slug" TEXT NOT NULL,
    "submission_status" TEXT NOT NULL DEFAULT 'pending',
    "submitted_by" TEXT,
    "tags" TEXT[],
    "title" TEXT NOT NULL,
    "title_en" TEXT,
    "total_reads" INTEGER DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "icon" TEXT,
    "is_featured" BOOLEAN DEFAULT false,
    "is_trending" BOOLEAN DEFAULT false,
    "name" TEXT NOT NULL,
    "name_bn" TEXT,
    "name_en" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "slug" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_pages" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featured_image" TEXT,
    "seo_description" TEXT,
    "seo_keywords" TEXT,
    "seo_title" TEXT,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cms_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_packages" (
    "id" TEXT NOT NULL,
    "bonus_coins" INTEGER NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_purchases" (
    "id" TEXT NOT NULL,
    "coins_amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "package_id" TEXT,
    "payment_method" TEXT NOT NULL DEFAULT 'card',
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "price" DOUBLE PRECISION NOT NULL,
    "transaction_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "coin_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_transactions" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "expires_at" TIMESTAMP(3),
    "reference_id" TEXT,
    "source" TEXT,
    "type" TEXT NOT NULL DEFAULT 'earn',
    "user_id" TEXT NOT NULL,

    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_likes" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_access_logs" (
    "id" TEXT NOT NULL,
    "access_granted" BOOLEAN NOT NULL DEFAULT false,
    "book_id" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "denial_reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "content_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_access_tokens" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "format" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "content_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_consumption_time" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "format" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "content_consumption_time_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_edit_requests" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" TEXT,
    "format" TEXT,
    "request_type" TEXT NOT NULL DEFAULT 'edit',
    "reviewer_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "content_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_unlocks" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "coins_spent" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "unlock_method" TEXT NOT NULL DEFAULT 'coin',
    "user_id" TEXT NOT NULL,

    CONSTRAINT "content_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributor_earnings" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "earned_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "format" TEXT NOT NULL,
    "fulfillment_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL,
    "sale_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "user_id" TEXT NOT NULL,

    CONSTRAINT "contributor_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usage" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discount_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order_id" TEXT,
    "subscription_id" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "coupon_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "applies_to" TEXT NOT NULL DEFAULT 'all',
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "discount_type" TEXT NOT NULL DEFAULT 'percentage',
    "discount_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "end_date" TIMESTAMP(3),
    "first_order_only" BOOLEAN NOT NULL DEFAULT false,
    "min_order_amount" DOUBLE PRECISION,
    "per_user_limit" INTEGER,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_book_stats" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "reads" INTEGER NOT NULL DEFAULT 0,
    "stat_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unique_readers" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_book_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "default_revenue_rules" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "format" TEXT NOT NULL,
    "fulfillment_cost_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "narrator_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platform_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "publisher_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "writer_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "default_revenue_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ebook_chapters" (
    "id" TEXT NOT NULL,
    "book_format_id" TEXT NOT NULL,
    "chapter_order" INTEGER NOT NULL,
    "chapter_title" TEXT NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "file_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ebook_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_message" TEXT,
    "recipient_email" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "subject" TEXT NOT NULL DEFAULT '',
    "template_type" TEXT NOT NULL,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_send_log" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_message" TEXT,
    "message_id" TEXT,
    "metadata" JSONB,
    "recipient_email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "template_name" TEXT NOT NULL,

    CONSTRAINT "email_send_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_send_state" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT NOT NULL,
    "last_attempt_at" TIMESTAMP(3),
    "recipient_email" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "template_name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_send_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template_type" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "variables" TEXT[],

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_unsubscribe_tokens" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,

    CONSTRAINT "email_unsubscribe_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followee_id" TEXT NOT NULL,
    "follower_id" TEXT NOT NULL,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "format_revenue_splits" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "format" TEXT NOT NULL,
    "fulfillment_cost_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "narrator_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platform_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "publisher_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "writer_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "format_revenue_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "free_shipping_campaigns" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "min_order_value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "free_shipping_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamification_points" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "event_type" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "reference_id" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "gamification_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_banners" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cta_link" TEXT,
    "cta_text" TEXT,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "subtitle" TEXT,
    "title" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_sections" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "display_source" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "section_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "subtitle" TEXT,
    "title" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listening_progress" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_position" DOUBLE PRECISION,
    "current_track" INTEGER,
    "last_listened_at" TIMESTAMP(3),
    "percentage" DOUBLE PRECISION,
    "total_duration" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "listening_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_sessions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnect_reason" TEXT,
    "ended_at" TIMESTAMP(3),
    "rj_user_id" TEXT NOT NULL,
    "show_title" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "station_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'live',
    "stream_url" TEXT,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "narrators" (
    "id" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "is_featured" BOOLEAN DEFAULT false,
    "is_trending" BOOLEAN DEFAULT false,
    "linked_at" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "phone" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION,
    "specialty" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,

    CONSTRAINT "narrators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "order_enabled" BOOLEAN NOT NULL DEFAULT true,
    "promotional_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "support_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cta_link" TEXT,
    "cta_text" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'general',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'all',
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "image_url" TEXT,
    "link" TEXT,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "target_user_id" TEXT,
    "template_id" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "book_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "format" "BookFormatType" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "book_format_id" TEXT,
    "order_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_cost" DOUBLE PRECISION,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "changed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "new_status" TEXT NOT NULL,
    "note" TEXT,
    "old_status" TEXT,
    "order_id" TEXT NOT NULL,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "cod_collected_amount" DOUBLE PRECISION,
    "cod_payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "cod_settled_at" TIMESTAMP(3),
    "cod_settlement_reference" TEXT,
    "coupon_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discount_amount" DOUBLE PRECISION,
    "estimated_delivery_days" TEXT,
    "fulfillment_cost" DOUBLE PRECISION,
    "is_purchased" BOOLEAN DEFAULT false,
    "notes" TEXT,
    "order_number" TEXT NOT NULL,
    "packaging_cost" DOUBLE PRECISION,
    "payment_method" TEXT,
    "purchase_cost_per_unit" DOUBLE PRECISION,
    "shipping_address" TEXT,
    "shipping_area" TEXT,
    "shipping_carrier" TEXT,
    "shipping_city" TEXT,
    "shipping_cost" DOUBLE PRECISION,
    "shipping_district" TEXT,
    "shipping_method_id" TEXT,
    "shipping_method_name" TEXT,
    "shipping_name" TEXT,
    "shipping_phone" TEXT,
    "shipping_zip" TEXT,
    "status" TEXT DEFAULT 'pending',
    "total_amount" DOUBLE PRECISION,
    "total_weight" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_admin" BOOLEAN DEFAULT false,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT,
    "event_type" TEXT NOT NULL DEFAULT 'payment',
    "gateway" TEXT NOT NULL DEFAULT 'unknown',
    "order_id" TEXT,
    "raw_response" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transaction_id" TEXT,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateways" (
    "id" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gateway_key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT NOT NULL,
    "mode" TEXT,
    "notes" TEXT,
    "sort_priority" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "order_id" TEXT NOT NULL,
    "status" TEXT DEFAULT 'pending',
    "transaction_id" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_reward_last_claimed" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "deleted_reason" TEXT,
    "display_name" TEXT,
    "experience" TEXT,
    "facebook_url" TEXT,
    "full_name" TEXT,
    "genre" TEXT,
    "instagram_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "phone" TEXT,
    "portfolio_url" TEXT,
    "preferred_language" TEXT,
    "referral_code" TEXT,
    "referred_by" TEXT,
    "specialty" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "website_url" TEXT,
    "youtube_url" TEXT,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishers" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "email" TEXT,
    "is_featured" BOOLEAN DEFAULT false,
    "is_trending" BOOLEAN DEFAULT false,
    "is_verified" BOOLEAN DEFAULT false,
    "linked_at" TIMESTAMP(3),
    "logo_url" TEXT,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "phone" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,

    CONSTRAINT "publishers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_stations" (
    "id" TEXT NOT NULL,
    "artwork_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "stream_url" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radio_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_progress" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_page" INTEGER,
    "last_read_at" TIMESTAMP(3),
    "percentage" DOUBLE PRECISION,
    "total_pages" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "reading_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "referral_code" TEXT NOT NULL,
    "referred_user_id" TEXT,
    "referrer_id" TEXT NOT NULL,
    "reward_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reward_status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rating" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewarded_ad_logs" (
    "id" TEXT NOT NULL,
    "ad_event_id" TEXT NOT NULL,
    "coins_rewarded" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "placement_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "user_id" TEXT NOT NULL,

    CONSTRAINT "rewarded_ad_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rj_profiles" (
    "id" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "specialty" TEXT,
    "stage_name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "rj_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_applications" (
    "id" TEXT NOT NULL,
    "applied_role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "display_name" TEXT,
    "notes" TEXT,
    "portfolio_url" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "sample_work" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "role_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_change_logs" (
    "id" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "new_role" TEXT NOT NULL,
    "old_role" TEXT,
    "reason" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "role_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_allowed" BOOLEAN NOT NULL DEFAULT true,
    "permission_key" TEXT NOT NULL,
    "role" "AppRole" NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "location" TEXT,
    "shipment_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "carrier" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimated_delivery" TIMESTAMP(3),
    "order_id" TEXT NOT NULL,
    "shipped_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tracking_number" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_methods" (
    "id" TEXT NOT NULL,
    "base_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_days" TEXT,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "per_kg_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "zone" TEXT,

    CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "show_schedules" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day_of_week" INTEGER NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "rj_user_id" TEXT NOT NULL,
    "show_title" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "show_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "template_key" TEXT,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_templates" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "variables" TEXT[],

    CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "duration_days" INTEGER NOT NULL DEFAULT 30,
    "features" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "assigned_to" TEXT,
    "category" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "resolved_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "subject" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressed_emails" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "suppressed_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fingerprint" TEXT,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "module" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_replies" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_staff" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "ticket_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tts_audio" (
    "id" TEXT NOT NULL,
    "audio_url" TEXT,
    "book_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "language" TEXT NOT NULL DEFAULT 'bn',
    "source_text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "voice_id" TEXT,

    CONSTRAINT "tts_audio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activity_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "activity_type" TEXT,
    "book_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device_type" TEXT,
    "format" TEXT,
    "ip_address" TEXT,
    "metadata" JSONB,
    "page" TEXT,
    "session_id" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_coins" (
    "id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_earned" INTEGER NOT NULL DEFAULT 0,
    "total_spent" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_coins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_goals" (
    "id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "current_value" INTEGER DEFAULT 0,
    "goal_type" TEXT NOT NULL DEFAULT 'reading',
    "period" TEXT NOT NULL DEFAULT 'daily',
    "started_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "target_value" INTEGER NOT NULL DEFAULT 0,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "notification_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" TEXT,
    "is_allowed" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "permission_key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_presence" (
    "id" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL DEFAULT 'idle',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_book_id" TEXT,
    "current_page" TEXT,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_presence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_purchases" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "book_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "format" TEXT NOT NULL DEFAULT 'ebook',
    "payment_method" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "role" "AppRole" NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_streaks" (
    "id" TEXT NOT NULL,
    "best_streak" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "current_streak" INTEGER DEFAULT 0,
    "last_activity_date" TEXT,
    "streak_updated_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscriptions" (
    "id" TEXT NOT NULL,
    "amount_paid" DOUBLE PRECISION,
    "coupon_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discount_amount" DOUBLE PRECISION,
    "end_date" TIMESTAMP(3),
    "plan_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voices" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'bn',
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "voice_id" TEXT NOT NULL,

    CONSTRAINT "voices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "bank_account" TEXT,
    "bank_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mobile_number" TEXT,
    "method" TEXT NOT NULL DEFAULT 'bank',
    "notes" TEXT,
    "processed_at" TIMESTAMP(3),
    "processed_by" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ad_placements_placement_key_key" ON "ad_placements"("placement_key");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_name_key" ON "admin_roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "badge_definitions_key_key" ON "badge_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "books_slug_key" ON "books"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "cms_pages_slug_key" ON "cms_pages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "content_access_tokens_token_key" ON "content_access_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "content_unlocks_user_id_book_id_format_key" ON "content_unlocks"("user_id", "book_id", "format");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "email_send_state_idempotency_key_key" ON "email_send_state"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_template_type_key" ON "email_templates"("template_type");

-- CreateIndex
CREATE UNIQUE INDEX "email_unsubscribe_tokens_email_key" ON "email_unsubscribe_tokens"("email");

-- CreateIndex
CREATE UNIQUE INDEX "email_unsubscribe_tokens_token_key" ON "email_unsubscribe_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "follows_follower_id_followee_id_key" ON "follows"("follower_id", "followee_id");

-- CreateIndex
CREATE UNIQUE INDEX "homepage_sections_section_key_key" ON "homepage_sections"("section_key");

-- CreateIndex
CREATE UNIQUE INDEX "listening_progress_user_id_book_id_key" ON "listening_progress"("user_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateways_gateway_key_key" ON "payment_gateways"("gateway_key");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_referral_code_key" ON "profiles"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reading_progress_user_id_book_id_key" ON "reading_progress"("user_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "rj_profiles_user_id_key" ON "rj_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permission_key_key" ON "role_permissions"("role", "permission_key");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_key_key" ON "site_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sms_templates_template_key_key" ON "sms_templates"("template_key");

-- CreateIndex
CREATE UNIQUE INDEX "suppressed_emails_email_key" ON "suppressed_emails"("email");

-- CreateIndex
CREATE UNIQUE INDEX "system_logs_fingerprint_key" ON "system_logs"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "user_badges_user_id_badge_id_key" ON "user_badges"("user_id", "badge_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_coins_user_id_key" ON "user_coins"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_user_id_permission_key_key" ON "user_permission_overrides"("user_id", "permission_key");

-- CreateIndex
CREATE UNIQUE INDEX "user_presence_user_id_key" ON "user_presence"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_key" ON "user_roles"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "user_streaks_user_id_key" ON "user_streaks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "voices_voice_id_key" ON "voices"("voice_id");

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_admin_role_id_fkey" FOREIGN KEY ("admin_role_id") REFERENCES "admin_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audiobook_tracks" ADD CONSTRAINT "audiobook_tracks_book_format_id_fkey" FOREIGN KEY ("book_format_id") REFERENCES "book_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_comments" ADD CONSTRAINT "book_comments_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_comments" ADD CONSTRAINT "book_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "book_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_contributors" ADD CONSTRAINT "book_contributors_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_formats" ADD CONSTRAINT "book_formats_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_formats" ADD CONSTRAINT "book_formats_narrator_id_fkey" FOREIGN KEY ("narrator_id") REFERENCES "narrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_formats" ADD CONSTRAINT "book_formats_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "publishers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_reads" ADD CONSTRAINT "book_reads_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "publishers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_purchases" ADD CONSTRAINT "coin_purchases_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "coin_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "book_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_unlocks" ADD CONSTRAINT "content_unlocks_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributor_earnings" ADD CONSTRAINT "contributor_earnings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributor_earnings" ADD CONSTRAINT "contributor_earnings_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usage" ADD CONSTRAINT "coupon_usage_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "user_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_book_stats" ADD CONSTRAINT "daily_book_stats_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ebook_chapters" ADD CONSTRAINT "ebook_chapters_book_format_id_fkey" FOREIGN KEY ("book_format_id") REFERENCES "book_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listening_progress" ADD CONSTRAINT "listening_progress_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "radio_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_book_format_id_fkey" FOREIGN KEY ("book_format_id") REFERENCES "book_formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "show_schedules" ADD CONSTRAINT "show_schedules_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "radio_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badge_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_current_book_id_fkey" FOREIGN KEY ("current_book_id") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
