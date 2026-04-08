
## Production Readiness & Business Optimization Plan

This is a large scope covering 4 major systems. I recommend implementing them in priority order across multiple steps:

### Step 1: Alerting System (Edge Function)
- Create a `system-alerts` edge function that checks:
  - DB saturation > 60% → warning, > 80% → critical
  - R2 error rate spikes (from `r2_rollout_metrics`)
  - Bandwidth threshold breaches (from `daily_bandwidth_stats`)
- Store alerts in a new `system_alerts` table
- Show alerts on the admin dashboard

### Step 2: User Analytics Dashboard
- Create an admin page `/admin/user-analytics` with:
  - Daily Active Users (from `content_consumption_time` + `book_reads`)
  - Concurrent users estimate (from `user_presence`)
  - Audiobook vs eBook usage breakdown
  - 7-day / 30-day retention (from login/activity data)

### Step 3: Revenue Tracking Dashboard  
- Create an admin page `/admin/revenue-dashboard` with:
  - Revenue per book (from `order_items` + `accounting_ledger`)
  - Revenue per user (top spenders)
  - Daily/monthly income charts (from `accounting_ledger`)
  - Format breakdown (ebook vs audiobook vs hardcopy)

### Step 4: Performance Monitoring
- Add a `system_performance_logs` table for tracking:
  - Edge function response times (already in analytics logs)
  - API error rates over time
  - Aggregate into the DB Health dashboard

**Note:** Given Production Lock Mode, all changes are additive (new tables, new pages, new functions) — no modification to existing payment/access/ledger logic.

Shall I proceed with Step 1 (Alerting System) first?
