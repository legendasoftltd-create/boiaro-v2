# Supabase → tRPC Migration TODO

**Goal:** Remove all Supabase dependencies. Delete `supabase/` folder and `src/integrations/supabase/`.

---

## ✅ Already Done

### Server endpoints
- `auth.*` — sign up, sign in, refresh, me, updateProfile
- `books.*` — list, browseBooks, trending, byId, bySlug, categories, heroBanners, reviews, postReview, **deleteReview**, bookmark, isBookmarked, userBookmarks, incrementRead, narrators, authors, homepageSections, siteSettings, **blogPosts, blogPost, recentlyViewed, recommendations, comments, postComment, deleteComment, formatsByBookId**
- `wallet.*` — balance, adjustCoins, unlockContent, checkUnlock, userUnlocks, checkHybridAccess, checkAccess
- `orders.*` — (scaffolded)
- `gamification.*` — streaks, updateStreak, addPoints, totalPoints, badges, badgeDefinitions, goals, logActivity, logConsumptionTime, claimDailyReward, claimAdReward, **adRewardStatus**
- `profiles.*` — me, update, readingProgress, **readingProgressByBook, listeningProgress, submitRoleApplication**, updateReadingProgress, updateListeningProgress, userRoles, hasRole, permissionOverrides, presence
- `notifications.*` — (scaffolded)
- `admin.*` — listBooks, approveBook, rejectBook, listUsers, updateUserStatus, listOrders, updateOrderStatus, listRoleApplications, approveRoleApplication, myPermissions, submitEditRequest, checkPendingEditRequest, createCreator, linkCreatorProfile, logAction, listAuthors, createAuthor, updateAuthor, deleteAuthor, updateSiteSetting, **listNarrators, createNarrator, updateNarrator, deleteNarrator, listPublishers, createPublisher, updatePublisher, deletePublisher, listCategories, createCategory, updateCategory, deleteCategory, listHomepageSections, updateHomepageSection, listReviews, approveReview, rejectReview, adConfig, siteSettingsByCategory, dashboard, activityLogs, getUserDetail, updateUserRole, listBlogPosts, createBlogPost, updateBlogPost, deleteBlogPost, listRoles**
- `follows.*` — isFollowing, countFor, toggle ✅ NEW
- `shipping.*` — methods, freeShipping, calculate ✅ NEW
- `rj.*` — radioStation, radioStations, liveSession.current/start/end, profiles ✅ NEW
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
- `useActivityTracker.ts` ✅ → `gamification.logActivity`
- `useAdminLogger.ts` ✅ → `admin.logAction`
- `useAudiobookAccess.ts` ✅ → `wallet.checkAccess` + `books.formatsByBookId`
- `useEbookAccess.ts` ✅ → `wallet.checkAccess` + `books.formatsByBookId`
- `useBookEngagement.ts` ✅ → `books.incrementRead` + `books.byId`
- `useContentEditRequest.ts` ✅ → `admin.submitEditRequest`
- `useCreatorAccount.ts` ✅ → `admin.createCreator` + `admin.linkCreatorProfile`
- `useCreatorPermissions.ts` ✅ → `profiles.permissionOverrides`
- `useDailyReward.ts` ✅ → `gamification.claimDailyReward` + `gamification.claimAdReward`
- `useGamification.ts` ✅ → `gamification.updateStreak` + `gamification.addPoints`
- `useHybridAccess.ts` ✅ → `wallet.checkHybridAccess`
- `usePresence.ts` ✅ → `profiles.presence`
- `useReadingProgress.ts` ✅ → `profiles.readingProgressByBook`
- `useRecommendations.ts` ✅ → `books.recentlyViewed` + `books.recommendations`
- `useFollow.ts` ✅ → `follows.*`
- `useFreeShipping.ts` ✅ → `shipping.freeShipping`
- `useShippingCalculator.ts` ✅ → `shipping.methods`
- `useRadioStation.ts` ✅ → `rj.radioStation`
- `useLiveSession.ts` ✅ → `rj.liveSession.*`
- `useAdConfig.ts` ✅ → `admin.adConfig`

### Pages/components
- `AdminAuthors.tsx` ✅
- `AdminSiteSettings.tsx` ✅
- `AvatarUpload.tsx` ✅
- `AdminLayout.tsx` ✅ (removed supabase alerts query)

---

## 🔴 Phase 1 — Server: Remaining Endpoints Needed

### Admin router — still missing
- [ ] `admin.softDeleteUser(userId, reason)` — mark profile deleted_at
- [ ] `admin.restoreUser(userId)` — clear deleted_at
- [ ] `admin.listSubmissions(status?)` — book format submissions
- [ ] `admin.listNotifications` / `admin.sendNotification`
- [ ] `admin.listWithdrawals` / `admin.processWithdrawal(id, status)`
- [ ] `admin.listCoinPackages` / `admin.updateCoinPackage`
- [ ] `admin.listCoupons` / `admin.createCoupon` / `admin.updateCoupon`
- [ ] `admin.listSubscriptionPlans` / `admin.createPlan` / `admin.updatePlan`
- [ ] `admin.listCmsPages` / `admin.createCmsPage` / `admin.updateCmsPage`
- [ ] `admin.listBanners` / `admin.createBanner` / `admin.updateBanner` / `admin.deleteBanner`
- [ ] `admin.listAdBanners` / `admin.updateAdBanner`
- [ ] `admin.listShippingMethods` / `admin.updateShippingMethod`
- [ ] `admin.financialReport(period)` — revenue/cost breakdown
- [ ] `admin.weeklyReport` — weekly KPIs
- [ ] `admin.dbHealth` — Prisma health check
- [ ] `admin.systemLogs(limit?, level?)` — system log table

---

## 🟡 Phase 2 — Migrate Remaining Hooks

### Infrastructure dependent (needs provider decision)
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
- [x] `src/components/book-detail/BookDetailHero.tsx` ✅
- [x] `src/components/book-detail/BookReviews.tsx` ✅
- [x] `src/components/book-detail/BookComments.tsx` ✅
- [ ] `src/components/book-detail/CoinUnlockButton.tsx`
- [ ] `src/components/book-detail/AudiobookChapterUnlock.tsx`
- [ ] `src/components/book-detail/QuickUnlockModal.tsx`
- [x] `src/components/book-detail/RelatedBooks.tsx` ✅
- [ ] `src/components/audio-player/PlayerCommentsDrawer.tsx`

### Components (homepage/browse)
- [x] `src/components/BlogSection.tsx` ✅
- [x] `src/components/ContinueListening.tsx` ✅
- [x] `src/components/ContinueProgress.tsx` ✅ (dead file — replaced with re-export)
- [x] `src/components/ContinueReading.tsx` ✅
- [x] `src/components/RecommendedForYou.tsx` ✅
- [x] `src/components/SmartSearch.tsx` ✅
- [x] `src/components/NotificationBell.tsx` ✅
- [x] `src/components/WatchAdButton.tsx` ✅
- [x] `src/components/RoleApplicationSubmitter.tsx` ✅

### User pages (secondary)
- [x] `src/pages/BlogList.tsx` ✅
- [x] `src/pages/BlogPost.tsx` ✅
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

### Ready to migrate (endpoints exist)
- [ ] `AdminUsers.tsx` → `admin.listUsers`, `admin.updateUserStatus`, softDelete/restore (need endpoints)
- [x] `AdminNarrators.tsx` ✅
- [x] `AdminPublishers.tsx` ✅
- [ ] `AdminOrders.tsx` → `admin.listOrders`, `admin.updateOrderStatus`
- [x] `AdminRoleApplications.tsx` ✅
- [x] `AdminActivityLogs.tsx` ✅
- [ ] `AdminCategories.tsx` → `admin.listCategories`, `createCategory`, `updateCategory`, `deleteCategory`
- [ ] `AdminHomepageSections.tsx` → `admin.listHomepageSections`, `updateHomepageSection`
- [ ] `AdminReviews.tsx` → `admin.listReviews`, `approveReview`, `rejectReview`
- [ ] `AdminDashboard.tsx` → `admin.dashboard`
- [ ] `AdminBlog.tsx` → `admin.listBlogPosts`, `createBlogPost`, `updateBlogPost`, `deleteBlogPost`

### Need new endpoints first
- [ ] `AdminBanners.tsx`, `AdminCmsPages.tsx` → need banner/CMS endpoints
- [ ] `AdminSubmissions.tsx` → need `admin.listSubmissions`
- [ ] `AdminNotifications.tsx` → need `admin.listNotifications` / `admin.sendNotification`
- [ ] `AdminWithdrawals.tsx` → need `admin.listWithdrawals`
- [ ] `AdminCoinPackages.tsx`, `AdminCoinSettings.tsx` → need coin package endpoints
- [ ] `AdminCoupons.tsx`, `AdminSubscriptionPlans.tsx` → need coupon/subscription endpoints
- [ ] `AdminShippingMethods.tsx` → need `admin.listShippingMethods`
- [ ] `AdminAdBanners.tsx`, `AdminAdCampaigns.tsx`, `AdminAdPlacements.tsx`, `AdminAdSettings.tsx`, `AdminAdReports.tsx` → ad endpoints
- [ ] `AdminAnalytics.tsx`, `AdminUserAnalytics.tsx`, `AdminReadingAnalytics.tsx` → analytics endpoints
- [ ] `AdminRevenueDashboard.tsx`, `AdminRevenueAudit.tsx`, `AdminRevenueSplits.tsx` → revenue endpoints
- [ ] `AdminEarnings.tsx`, `AdminAccounting.tsx`, `AdminFinancialReports.tsx` → financial endpoints
- [ ] `AdminPayments.tsx`, `AdminPaymentGateways.tsx`, `AdminWallets.tsx` → payment endpoints
- [ ] `AdminWeeklyReport.tsx`, `AdminInvestorReport.tsx` → report endpoints
- [ ] `AdminEmailLogs.tsx`, `AdminEmailSettings.tsx`, `AdminEmailTemplates.tsx` → email endpoints
- [ ] `AdminSms.tsx` → SMS endpoints
- [ ] `AdminRoles.tsx`, `AdminUserPermissions.tsx` → `admin.listRoles`, `admin.updateUserRole`
- [ ] `AdminGamification.tsx` → gamification admin endpoints
- [ ] `AdminReferrals.tsx` → referral endpoints
- [ ] `AdminDrmSettings.tsx` → DRM settings endpoints
- [ ] `AdminRadio.tsx`, `AdminRjManagement.tsx` → `rj.*` endpoints
- [ ] `AdminTickets.tsx`, `AdminTicketDetail.tsx` → support ticket endpoints
- [ ] `AdminSystemLogs.tsx`, `AdminAlerts.tsx`, `AdminDbHealth.tsx` → system endpoints
- [ ] `AdminPurchaseReport.tsx`, `AdminPerformance.tsx` → report endpoints
- [ ] `AdminLiveMonitoring.tsx`, `AdminR2Dashboard.tsx` → monitoring endpoints
- [ ] `AdminFreeShipping.tsx` → `shipping.*` endpoints

### Admin components
- [ ] `EditUserDialog.tsx`
- [ ] `AdminUserProfileModal.tsx`
- [ ] `AuthorAccountCard.tsx`, `CreatorAccountCard.tsx`, `CreatorLinkSummary.tsx`
- [ ] `BookContributors.tsx`, `BookRevenueSplit.tsx`
- [ ] `HardcopyProfitCalculator.tsx`, `OrderProfitBreakdown.tsx`
- [ ] `LiveUsersModal.tsx`

---

## ⚫ Phase 5 — Infrastructure (Requires User Input)

- [ ] **File storage** — currently Supabase Storage → Option: R2 SDK in Node server
- [ ] **TTS** — `usePremiumTTS.ts` calls Supabase edge functions
- [ ] **Email** — `emailService.ts` calls `send-transactional-email` edge function
- [ ] **Realtime presence** — currently using DB polling (OK for now)

---

## ⚪ Phase 6 — Cleanup

- [ ] Delete `supabase/` folder (keep migrations as SQL reference)
- [ ] Delete `src/integrations/supabase/` folder
- [ ] Remove `@supabase/*` from `package.json`
- [ ] Remove Supabase env vars from `.env`

---

## Notes

- **Re-auth required** — browser Supabase JWTs don't work with Node server. Sign out → sign in.
- **File uploads** — `/upload` saves to `server/uploads/`. Wire to R2 for production.
- **TTS and email** — need provider decision before migration.
- **Realtime** — presence and live sessions use polling (SSE can be added later).
- **softDeleteUser / restoreUser** — needed for AdminUsers.tsx migration, add to admin router next.
