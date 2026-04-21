# Supabase → tRPC Migration TODO

**Goal:** Remove all Supabase dependencies. Delete `supabase/` folder and `src/integrations/supabase/`.

---

## ✅ Already Done

### Server endpoints
- `auth.*` — sign up, sign in, refresh, me, updateProfile
- `books.*` — list, browseBooks, trending, byId, bySlug, categories, heroBanners, reviews, postReview, bookmark, isBookmarked, userBookmarks, incrementRead, narrators, authors, homepageSections, siteSettings
- `wallet.*` — balance, adjustCoins, unlockContent, checkUnlock, userUnlocks, checkHybridAccess, checkAccess
- `orders.*` — (scaffolded)
- `gamification.*` — streaks, updateStreak, addPoints, totalPoints, badges, badgeDefinitions, goals, logActivity, logConsumptionTime, claimDailyReward, claimAdReward
- `profiles.*` — me, update, readingProgress, updateReadingProgress, updateListeningProgress, userRoles, hasRole, permissionOverrides, presence
- `notifications.*` — (scaffolded)
- `admin.*` — listBooks, approveBook, rejectBook, listUsers, updateUserStatus, listOrders, updateOrderStatus, listRoleApplications, approveRoleApplication, myPermissions, submitEditRequest, checkPendingEditRequest, createCreator, linkCreatorProfile, logAction, listAuthors, createAuthor, updateAuthor, deleteAuthor, updateSiteSetting
- `POST /upload` — file upload endpoint (saves to `uploads/`)

### Frontend hooks/contexts
- `AuthContext.tsx` ✅
- `useWallet.ts` ✅
- `useBooks.ts` (useBooks, useBrowseBooks, useAuthors, useNarrators, useCategories) ✅
- `useAccessQuery.ts` ✅
- `useHomepageSections.ts` ✅
- `useSiteSettings.ts` ✅
- `useAdminCheck.ts` ✅
- `useUserRole.ts` ✅
- `useAdminPermissions.ts` ✅
- `useSystemLog.ts` ✅
- `useBandwidthReporter.ts` ✅
- `useConsumptionTracker.ts` ✅

### Pages/components
- `AdminAuthors.tsx` ✅
- `AdminSiteSettings.tsx` ✅
- `AvatarUpload.tsx` ✅

---

## 🔴 Phase 1 — Server: Add Missing Endpoints

### New router: `follows`
- [ ] `follows.toggle(profileId, profileType)` — follow/unfollow, returns `{ following, count }`
- [ ] `follows.isFollowing(profileId, profileType)` — boolean check
- [ ] `follows.countFor(profileId)` — follower count

### New router: `shipping`
- [ ] `shipping.methods(districtId?)` — list active shipping methods
- [ ] `shipping.freeShipping(subtotal, districtId?)` — best active free shipping campaign
- [ ] `shipping.calculate(items, districtId)` — weight-based shipping cost

### New router: `rj`
- [ ] `rj.radioStation` — active radio station
- [ ] `rj.liveSession.current` — current live session
- [ ] `rj.liveSession.start(stationId)` — start live session
- [ ] `rj.liveSession.end(sessionId)` — end live session
- [ ] `rj.profiles` — list active RJ profiles

### Books router additions
- [ ] `books.blogPosts(limit?, cursor?, category?)` — paginated blog posts
- [ ] `books.blogPost(slug)` — single blog post
- [ ] `books.recentlyViewed(limit?)` — books user viewed recently (from activity_logs)
- [ ] `books.recommendations(bookId?)` — related books by category/author
- [ ] `books.comments(bookId)` — approved comments for a book
- [ ] `books.postComment(bookId, content)` — protected, post a comment
- [ ] `books.trackRead(bookId)` — increment read count (wraps incrementRead)
- [ ] `books.formatsByBookId(bookId)` — book formats with full detail

### Admin router additions
- [ ] `admin.adConfig` — fetch platform_settings for ad configuration
- [ ] `admin.listNarrators(search?)` — narrator list with CRUD
- [ ] `admin.createNarrator(data)` / `admin.updateNarrator(id, data)` / `admin.deleteNarrator(id)`
- [ ] `admin.listPublishers(search?)` — publisher list with CRUD
- [ ] `admin.createPublisher(data)` / `admin.updatePublisher(id, data)` / `admin.deletePublisher(id)`
- [ ] `admin.listCategories` / `admin.createCategory` / `admin.updateCategory` / `admin.deleteCategory`
- [ ] `admin.listHomepageSections` / `admin.updateHomepageSection`
- [ ] `admin.siteSettingsByCategory` — for the settings UI
- [ ] `admin.listRoles` / `admin.updateUserRole`
- [ ] `admin.activityLogs(limit?, cursor?)` — admin audit trail
- [ ] `admin.systemLogs(limit?, level?)` — system log table
- [ ] `admin.listReviews(status?)` / `admin.approveReview(id)` / `admin.rejectReview(id)`
- [ ] `admin.listSubmissions(status?)` — book format submissions
- [ ] `admin.listNotifications` / `admin.sendNotification`
- [ ] `admin.listWithdrawals` / `admin.processWithdrawal(id, status)`
- [ ] `admin.dashboard` — counts for dashboard widgets
- [ ] `admin.listUsers` already exists — add `admin.getUserDetail(id)`, `admin.updateUserRole`
- [ ] `admin.listCoinPackages` / `admin.updateCoinPackage`
- [ ] `admin.listCoupons` / `admin.createCoupon` / `admin.updateCoupon`
- [ ] `admin.listSubscriptionPlans` / `admin.createPlan` / `admin.updatePlan`
- [ ] `admin.listBlogPosts` / `admin.createBlogPost` / `admin.updateBlogPost` / `admin.deleteBlogPost`
- [ ] `admin.listCmsPages` / `admin.createCmsPage` / `admin.updateCmsPage`
- [ ] `admin.listBanners` / `admin.createBanner` / `admin.updateBanner` / `admin.deleteBanner`
- [ ] `admin.listAdBanners` / `admin.updateAdBanner`
- [ ] `admin.listShippingMethods` / `admin.updateShippingMethod`
- [ ] `admin.financialReport(period)` — revenue/cost breakdown
- [ ] `admin.weeklyReport` — weekly KPIs
- [ ] `admin.dbHealth` — Prisma health check

---

## 🟡 Phase 2 — Migrate Hooks

### Has server endpoints ready — migrate now
- [ ] `useActivityTracker.ts` → `gamification.logActivity`
- [ ] `useAdminLogger.ts` → `admin.logAction` (remove profile lookup, use auth.me display_name)
- [ ] `useAudiobookAccess.ts` → `wallet.checkAccess` + `books.formatsByBookId`
- [ ] `useEbookAccess.ts` → `wallet.checkAccess` + `books.formatsByBookId`
- [ ] `useBookEngagement.ts` → `books.incrementRead` + gamification (no RPC needed)
- [ ] `useContentEditRequest.ts` → `admin.submitEditRequest` + `admin.checkPendingEditRequest`
- [ ] `useCreatorAccount.ts` → `admin.createCreator` + `admin.linkCreatorProfile`
- [ ] `useCreatorPermissions.ts` → `profiles.permissionOverrides` + `useUserRole`
- [ ] `useDailyReward.ts` → `gamification.claimDailyReward` + `gamification.claimAdReward`
- [ ] `useGamification.ts` → `gamification.*` (streaks, addPoints, badges, totalPoints)
- [ ] `useHybridAccess.ts` → `wallet.checkHybridAccess`
- [ ] `usePresence.ts` → `profiles.presence`
- [ ] `useReadingProgress.ts` → `profiles.readingProgress` + `profiles.updateReadingProgress`
- [ ] `useRecommendations.ts` → `books.recentlyViewed` + `books.recommendations` (add to server first)

### Needs new server endpoints first
- [ ] `useFollow.ts` → add `follows` router first
- [ ] `useFreeShipping.ts` → add `shipping.freeShipping` first
- [ ] `useShippingCalculator.ts` → add `shipping.calculate` first
- [ ] `useRadioStation.ts` → add `rj.radioStation` first
- [ ] `useLiveSession.ts` → add `rj.liveSession.*` first
- [ ] `useAdConfig.ts` → add `admin.adConfig` first

### Infrastructure dependent (discuss with user)
- [ ] `useSecureContent.ts` → needs R2/S3 signed URL endpoint
- [ ] `usePremiumTTS.ts` → needs TTS provider (was Supabase Edge Function `tts-paragraph`)

---

## 🟠 Phase 3 — Migrate User-Facing Pages & Components

### High priority (user-facing, broken without hooks)
- [ ] `src/pages/BookDetail.tsx`
- [ ] `src/pages/EbookReader.tsx`
- [ ] `src/pages/WalletPage.tsx`
- [ ] `src/pages/Profile.tsx`
- [ ] `src/pages/UserDashboard.tsx`
- [ ] `src/pages/GamificationPage.tsx`
- [ ] `src/pages/RewardCenter.tsx`
- [ ] `src/pages/CoinStore.tsx`
- [ ] `src/pages/Checkout.tsx`
- [ ] `src/pages/Orders.tsx`
- [ ] `src/contexts/AudioPlayerContext.tsx`

### Components (book detail flow)
- [ ] `src/components/book-detail/BookDetailHero.tsx`
- [ ] `src/components/book-detail/BookReviews.tsx`
- [ ] `src/components/book-detail/BookComments.tsx`
- [ ] `src/components/book-detail/CoinUnlockButton.tsx`
- [ ] `src/components/book-detail/AudiobookChapterUnlock.tsx`
- [ ] `src/components/book-detail/QuickUnlockModal.tsx`
- [ ] `src/components/book-detail/RelatedBooks.tsx`
- [ ] `src/components/audio-player/PlayerCommentsDrawer.tsx`

### Components (homepage/browse)
- [ ] `src/components/BlogSection.tsx`
- [ ] `src/components/ContinueListening.tsx`
- [ ] `src/components/ContinueProgress.tsx`
- [ ] `src/components/ContinueReading.tsx`
- [ ] `src/components/RecommendedForYou.tsx`
- [ ] `src/components/SmartSearch.tsx`
- [ ] `src/components/NotificationBell.tsx`
- [ ] `src/components/WatchAdButton.tsx`
- [ ] `src/components/RoleApplicationSubmitter.tsx`

### User pages (secondary)
- [ ] `src/pages/BlogList.tsx`
- [ ] `src/pages/BlogPost.tsx`
- [ ] `src/pages/AuthorProfile.tsx`
- [ ] `src/pages/NarratorProfile.tsx`
- [ ] `src/pages/PublisherProfile.tsx`
- [ ] `src/pages/InvitePage.tsx`
- [ ] `src/pages/CreatorApply.tsx`
- [ ] `src/pages/Subscriptions.tsx`
- [ ] `src/pages/SupportPage.tsx`
- [ ] `src/pages/PaymentCallback.tsx`
- [ ] `src/pages/NotificationSettings.tsx`
- [ ] `src/pages/TtsDemo.tsx`
- [ ] `src/pages/CmsPage.tsx`

### Creator dashboards
- [ ] `src/pages/writer/WriterDashboard.tsx`
- [ ] `src/pages/writer/WriterBooks.tsx`
- [ ] `src/pages/narrator/NarratorDashboard.tsx`
- [ ] `src/pages/narrator/NarratorAudiobooks.tsx`
- [ ] `src/pages/publisher/PublisherDashboard.tsx`
- [ ] `src/pages/publisher/PublisherBooks.tsx`
- [ ] `src/pages/rj/RjDashboard.tsx`
- [ ] `src/pages/rj/RjLayout.tsx`
- [ ] `src/pages/rj/RjProfile.tsx`
- [ ] `src/components/earnings/EarningsDashboard.tsx`
- [ ] `src/components/narrator/AudiobookEpisodeManager.tsx`
- [ ] `src/components/writer/EbookChapterManager.tsx`
- [ ] `src/components/book-submission/AttachToExistingBook.tsx`
- [ ] `src/components/book-submission/DuplicateDetector.tsx`
- [ ] `src/components/vendor/VendorEarningsPreview.tsx`
- [ ] `src/components/profile/CreatorProfilePage.tsx`

---

## 🔵 Phase 4 — Migrate Admin Pages

All 50 admin pages follow the same pattern: replace `supabase.from("table").*` with `trpc.admin.*` mutations. Group them by router needed:

### Already have endpoints
- [ ] `AdminUsers.tsx` → `admin.listUsers`, `admin.updateUserStatus`
- [ ] `AdminLayout.tsx` → remove supabase auth check, use `useAuth()`
- [ ] `AdminNarrators.tsx` → add `admin.listNarrators` etc. (same as Authors)
- [ ] `AdminPublishers.tsx` → add `admin.listPublishers` etc.
- [ ] `AdminOrders.tsx` → `admin.listOrders`, `admin.updateOrderStatus`
- [ ] `AdminRoleApplications.tsx` → `admin.listRoleApplications`, `admin.approveRoleApplication`
- [ ] `AdminActivityLogs.tsx` → `admin.activityLogs`
- [ ] `AdminUsers.tsx` / `EditUserDialog.tsx` → `admin.listUsers`, `admin.updateUserStatus`

### Need new endpoints first (Phase 1)
- [ ] `AdminBlog.tsx`, `AdminCmsPages.tsx`, `AdminBanners.tsx`
- [ ] `AdminCategories.tsx`, `AdminHomepageSections.tsx`
- [ ] `AdminReviews.tsx`, `AdminSubmissions.tsx`
- [ ] `AdminNotifications.tsx`
- [ ] `AdminWithdrawals.tsx`
- [ ] `AdminCoinPackages.tsx`, `AdminCoinSettings.tsx`
- [ ] `AdminCoupons.tsx`, `AdminSubscriptionPlans.tsx`
- [ ] `AdminShippingMethods.tsx`
- [ ] `AdminAdBanners.tsx`, `AdminAdCampaigns.tsx`, `AdminAdPlacements.tsx`, `AdminAdSettings.tsx`, `AdminAdReports.tsx`
- [ ] `AdminDashboard.tsx`
- [ ] `AdminAnalytics.tsx`, `AdminUserAnalytics.tsx`, `AdminReadingAnalytics.tsx`
- [ ] `AdminRevenueDashboard.tsx`, `AdminRevenueAudit.tsx`, `AdminRevenueSplits.tsx`
- [ ] `AdminEarnings.tsx`, `AdminAccounting.tsx`, `AdminFinancialReports.tsx`
- [ ] `AdminPayments.tsx`, `AdminPaymentGateways.tsx`, `AdminWallets.tsx`
- [ ] `AdminWeeklyReport.tsx`, `AdminInvestorReport.tsx`
- [ ] `AdminEmailLogs.tsx`, `AdminEmailSettings.tsx`, `AdminEmailTemplates.tsx`
- [ ] `AdminSms.tsx`
- [ ] `AdminRoles.tsx`, `AdminUserPermissions.tsx`
- [ ] `AdminGamification.tsx`
- [ ] `AdminReferrals.tsx`
- [ ] `AdminDrmSettings.tsx`
- [ ] `AdminRadio.tsx`, `AdminRjManagement.tsx`
- [ ] `AdminTickets.tsx`, `AdminTicketDetail.tsx`
- [ ] `AdminSystemLogs.tsx`, `AdminAlerts.tsx`, `AdminDbHealth.tsx`
- [ ] `AdminPurchaseReport.tsx`, `AdminPerformance.tsx`
- [ ] `AdminLiveMonitoring.tsx`, `AdminR2Dashboard.tsx`
- [ ] `AdminFreeShipping.tsx`

### Admin components
- [ ] `EditUserDialog.tsx`
- [ ] `AdminUserProfileModal.tsx`
- [ ] `AuthorAccountCard.tsx`, `CreatorAccountCard.tsx`, `CreatorLinkSummary.tsx`
- [ ] `BookContributors.tsx`, `BookRevenueSplit.tsx`
- [ ] `HardcopyProfitCalculator.tsx`, `OrderProfitBreakdown.tsx`
- [ ] `LiveUsersModal.tsx`

---

## ⚫ Phase 5 — Infrastructure (Requires User Input)

These need decisions on which provider to use:

- [ ] **File storage** (images, ebooks, audiobooks) — currently Supabase Storage
  - Option A: Keep using R2 (already in use for media via `r2-media-proxy` edge function)
  - Option B: Add a proper R2 SDK integration in the Node server
  - `useSecureContent.ts` needs signed URL generation from R2

- [ ] **TTS** — `usePremiumTTS.ts` calls Supabase edge functions `tts-paragraph` and `free-tts`
  - Need to port these as Express endpoints or use a TTS provider SDK directly

- [ ] **Email** — `emailService.ts` + `approveCreator.ts` call `send-transactional-email` edge function
  - Option: Add Resend/Nodemailer/SendGrid to the Node server

- [ ] **Realtime presence** — `usePresence.ts` uses DB polling (already works, but slow)
  - Option: Keep as polling or add Server-Sent Events

---

## ⚪ Phase 6 — Cleanup

- [ ] Delete `supabase/` folder (edge functions + migrations — keep migrations as SQL reference)
- [ ] Delete `src/integrations/supabase/` folder
- [ ] Remove `@supabase/*` from `package.json`
- [ ] Remove Supabase env vars from `.env`

---

## Notes for User

- **"No authors" on admin pages** — your browser session has a Supabase JWT. Sign out → sign in again through the new auth form to get a Node-issued JWT.
- **File uploads** — `/upload` now saves files to `server/uploads/`. For production, wire this to R2.
- **TTS and email** — both need a provider decision before those hooks can be migrated.
- **Realtime** (presence, live sessions) — simplified to polling. True realtime can be added via SSE later.
