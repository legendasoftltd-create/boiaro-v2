import { lazy, Suspense, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { trpc, createTrpcClient } from "@/lib/trpc";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { AudioPlayerProvider } from "@/contexts/AudioPlayerContext";
import { Sentry } from "@/lib/sentry";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Defer heavy non-critical components
const MiniPlayer = lazy(() => import("@/components/audio-player/MiniPlayer").then(m => ({ default: m.MiniPlayer })));
const FullPlayer = lazy(() => import("@/components/audio-player/FullPlayer").then(m => ({ default: m.FullPlayer })));
const GlobalAudiobookPaywall = lazy(() => import("@/components/audio-player/GlobalAudiobookPaywall").then(m => ({ default: m.GlobalAudiobookPaywall })));
const CartDrawer = lazy(() => import("@/components/cart/CartDrawer").then(m => ({ default: m.CartDrawer })));
const RoleApplicationSubmitter = lazy(() => import("@/components/RoleApplicationSubmitter").then(m => ({ default: m.RoleApplicationSubmitter })));
const PresenceTracker = lazy(() => import("@/components/PresenceTracker").then(m => ({ default: m.PresenceTracker })));
const BandwidthReporter = lazy(() => import("@/components/BandwidthReporter").then(m => ({ default: m.BandwidthReporter })));

// Critical path — eagerly loaded
import Index from "./pages/Index.tsx";

// Lazy-loaded pages
const Auth = lazy(() => import("./pages/Auth.tsx"));
const AdminAuth = lazy(() => import("./pages/AdminAuth.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const UserDashboard = lazy(() => import("./pages/UserDashboard.tsx"));
const BookDetail = lazy(() => import("./pages/BookDetail.tsx"));
const Checkout = lazy(() => import("./pages/Checkout.tsx"));
const Orders = lazy(() => import("./pages/Orders.tsx"));
const EbookReader = lazy(() => import("./pages/EbookReader.tsx"));
const CreatorApply = lazy(() => import("./pages/CreatorApply.tsx"));
const Subscriptions = lazy(() => import("./pages/Subscriptions.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const PaymentCallback = lazy(() => import("./pages/PaymentCallback.tsx"));
const BooksPage = lazy(() => import("./pages/BooksPage.tsx"));
const AuthorsPage = lazy(() => import("./pages/AuthorsPage.tsx"));
const NarratorsPage = lazy(() => import("./pages/NarratorsPage.tsx"));
const AuthorProfile = lazy(() => import("./pages/AuthorProfile.tsx"));
const NarratorProfile = lazy(() => import("./pages/NarratorProfile.tsx"));
const PublisherProfile = lazy(() => import("./pages/PublisherProfile.tsx"));
const CmsPage = lazy(() => import("./pages/CmsPage.tsx"));
const BlogList = lazy(() => import("./pages/BlogList.tsx"));
const BlogPost = lazy(() => import("./pages/BlogPost.tsx"));
const SupportPage = lazy(() => import("./pages/SupportPage.tsx"));
const RewardCenter = lazy(() => import("./pages/RewardCenter.tsx"));
const WalletPage = lazy(() => import("./pages/WalletPage.tsx"));
const CoinStore = lazy(() => import("./pages/CoinStore.tsx"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings.tsx"));
const InvitePage = lazy(() => import("./pages/InvitePage.tsx"));
const GamificationPage = lazy(() => import("./pages/GamificationPage.tsx"));

// Admin — all lazy
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.tsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.tsx"));
const AdminBooks = lazy(() => import("./pages/admin/AdminBooks.tsx"));
const AdminTtsManagement = lazy(() => import("./pages/admin/AdminTtsManagement.tsx"));
const AdminAuthors = lazy(() => import("./pages/admin/AdminAuthors.tsx"));
const AdminNarrators = lazy(() => import("./pages/admin/AdminNarrators.tsx"));
const AdminPublishers = lazy(() => import("./pages/admin/AdminPublishers.tsx"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders.tsx"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews.tsx"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories.tsx"));
const AdminPayments = lazy(() => import("./pages/admin/AdminPayments.tsx"));
const AdminPaymentGateways = lazy(() => import("./pages/admin/AdminPaymentGateways.tsx"));
const AdminRoleApplications = lazy(() => import("./pages/admin/AdminRoleApplications.tsx"));
const AdminRevenueSplits = lazy(() => import("./pages/admin/AdminRevenueSplits.tsx"));
const AdminWithdrawals = lazy(() => import("./pages/admin/AdminWithdrawals.tsx"));
const AdminEarnings = lazy(() => import("./pages/admin/AdminEarnings.tsx"));
const AdminSubmissions = lazy(() => import("./pages/admin/AdminSubmissions.tsx"));
const AdminShippingMethods = lazy(() => import("./pages/admin/AdminShippingMethods.tsx"));
const AdminUserDetail = lazy(() => import("./pages/admin/AdminUserDetail.tsx"));
const AdminSubscriptionPlans = lazy(() => import("./pages/admin/AdminSubscriptionPlans.tsx"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons.tsx"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications.tsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.tsx"));
const AdminEmailTemplates = lazy(() => import("./pages/admin/AdminEmailTemplates.tsx"));
const AdminEmailLogs = lazy(() => import("./pages/admin/AdminEmailLogs.tsx"));
const AdminEmailSettings = lazy(() => import("./pages/admin/AdminEmailSettings.tsx"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics.tsx"));
const AdminAccounting = lazy(() => import("./pages/admin/AdminAccounting.tsx"));
const AdminFinancialReports = lazy(() => import("./pages/admin/AdminFinancialReports.tsx"));
const AdminInvestorReport = lazy(() => import("./pages/admin/AdminInvestorReport.tsx"));
const AdminCmsPages = lazy(() => import("./pages/admin/AdminCmsPages.tsx"));
const AdminBlog = lazy(() => import("./pages/admin/AdminBlog.tsx"));
const AdminHomepageSections = lazy(() => import("./pages/admin/AdminHomepageSections.tsx"));
const AdminBanners = lazy(() => import("./pages/admin/AdminBanners.tsx"));
const AdminTickets = lazy(() => import("./pages/admin/AdminTickets.tsx"));
const AdminTicketDetail = lazy(() => import("./pages/admin/AdminTicketDetail.tsx"));
const AdminRoles = lazy(() => import("./pages/admin/AdminRoles.tsx"));
const AdminActivityLogs = lazy(() => import("./pages/admin/AdminActivityLogs.tsx"));
const AdminSystemLogs = lazy(() => import("./pages/admin/AdminSystemLogs.tsx"));
const AdminWallets = lazy(() => import("./pages/admin/AdminWallets.tsx"));
const AdminCoinSettings = lazy(() => import("./pages/admin/AdminCoinSettings.tsx"));
const AdminCoinPackages = lazy(() => import("./pages/admin/AdminCoinPackages.tsx"));
const AdminAdPlacements = lazy(() => import("./pages/admin/AdminAdPlacements.tsx"));
const AdminAdBanners = lazy(() => import("./pages/admin/AdminAdBanners.tsx"));
const AdminAdCampaigns = lazy(() => import("./pages/admin/AdminAdCampaigns.tsx"));
const AdminAdSettings = lazy(() => import("./pages/admin/AdminAdSettings.tsx"));
const AdminAdReports = lazy(() => import("./pages/admin/AdminAdReports.tsx"));
const AdminRecommendations = lazy(() => import("./pages/admin/AdminRecommendations.tsx"));
const AdminDrmSettings = lazy(() => import("./pages/admin/AdminDrmSettings.tsx"));
const AdminRadio = lazy(() => import("./pages/admin/AdminRadio.tsx"));
const AdminReferrals = lazy(() => import("./pages/admin/AdminReferrals.tsx"));
const AdminGamification = lazy(() => import("./pages/admin/AdminGamification.tsx"));
const AdminSiteSettings = lazy(() => import("./pages/admin/AdminSiteSettings.tsx"));
const AdminUserPermissions = lazy(() => import("./pages/admin/AdminUserPermissions.tsx"));
const AdminReadingAnalytics = lazy(() => import("./pages/admin/AdminReadingAnalytics.tsx"));
const AdminFreeShipping = lazy(() => import("./pages/admin/AdminFreeShipping.tsx"));
const AdminPurchaseReport = lazy(() => import("./pages/admin/AdminPurchaseReport.tsx"));
const AdminRevenueAudit = lazy(() => import("./pages/admin/AdminRevenueAudit.tsx"));
const AdminLiveMonitoring = lazy(() => import("./pages/admin/AdminLiveMonitoring.tsx"));
const AdminR2Dashboard = lazy(() => import("./pages/admin/AdminR2Dashboard.tsx"));
const AdminDbHealth = lazy(() => import("./pages/admin/AdminDbHealth.tsx"));
const AdminAlerts = lazy(() => import("./pages/admin/AdminAlerts.tsx"));
const AdminUserAnalytics = lazy(() => import("./pages/admin/AdminUserAnalytics.tsx"));
const AdminRevenueDashboard = lazy(() => import("./pages/admin/AdminRevenueDashboard.tsx"));
const AdminPerformance = lazy(() => import("./pages/admin/AdminPerformance.tsx"));
const AdminWeeklyReport = lazy(() => import("./pages/admin/AdminWeeklyReport.tsx"));
const AdminBackupStatus = lazy(() => import("./pages/admin/AdminBackupStatus.tsx"));

// Creator
const CreatorLayout = lazy(() => import("./pages/creator/CreatorLayout.tsx"));
const CreatorDashboard = lazy(() => import("./pages/creator/CreatorDashboard.tsx"));
const CreatorBooks = lazy(() => import("./pages/creator/CreatorBooks.tsx"));
const CreatorEarnings = lazy(() => import("./pages/creator/CreatorEarnings.tsx"));
const CreatorProfile = lazy(() => import("./pages/creator/CreatorProfile.tsx"));
const CreatorAuth = lazy(() => import("./pages/creator/CreatorAuth.tsx"));
const RedirectToCreator = lazy(() => import("./pages/creator/RedirectToCreator.tsx"));
const NarratorAudiobooks = lazy(() => import("./pages/narrator/NarratorAudiobooks.tsx"));
const PublisherInventory = lazy(() => import("./pages/publisher/PublisherInventory.tsx"));

// RJ Panel
const RjAuth = lazy(() => import("./pages/RjAuth.tsx"));
const RjLayout = lazy(() => import("./pages/rj/RjLayout.tsx"));
const RjDashboard = lazy(() => import("./pages/rj/RjDashboard.tsx"));
const RjProfile = lazy(() => import("./pages/rj/RjProfile.tsx"));
const RjSchedule = lazy(() => import("./pages/rj/RjSchedule.tsx"));

// Admin RJ
const AdminRjManagement = lazy(() => import("./pages/admin/AdminRjManagement.tsx"));
const AdminSms = lazy(() => import("./pages/admin/AdminSms.tsx"));
const TtsDemo = lazy(() => import("./pages/TtsDemo.tsx"));

function LegacyCheckoutCallbackRedirect({ status }: { status: "success" | "failed" | "cancelled" }) {
  const location = useLocation();
  const existingQuery = location.search.startsWith("?") ? location.search.slice(1) : location.search;
  const queryPrefix = existingQuery ? `${existingQuery}&` : "";
  return <Navigate to={`/payment/callback?${queryPrefix}status=${status}`} replace />;
}

const SentryErrorBoundary = Sentry.ErrorBoundary;

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// Smart admin gateway: shows login form if unauthenticated, admin layout if authenticated as admin
function AdminGateway() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <AdminAuth />;
  const roles = (user?.roles as string[]) || [];
  if (!roles.includes("admin")) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

const App = () => {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,          // data stays fresh for 30s — avoids redundant refetches
        gcTime: 5 * 60_000,         // keep unused data in cache for 5 minutes
        refetchOnWindowFocus: true,  // refetch when user returns to tab
        retry: 1,                    // only retry once on failure
      },
    },
  }));
  const [trpcClient] = useState(() => createTrpcClient());
  return (
  <SentryErrorBoundary fallback={<div className="min-h-screen flex items-center justify-center bg-background text-foreground"><div className="text-center space-y-4"><h1 className="text-2xl font-bold">Something went wrong</h1><p className="text-muted-foreground">An unexpected error occurred. Please refresh the page.</p><button onClick={() => window.location.reload()} className="px-4 py-2 bg-primary text-primary-foreground rounded-md">Refresh</button></div></div>}>
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <AudioPlayerProvider>
              <Suspense fallback={null}><RoleApplicationSubmitter /></Suspense>
              <Suspense fallback={null}><PresenceTracker /></Suspense>
              <Suspense fallback={null}><BandwidthReporter /></Suspense>
              <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/author-auth" element={<Navigate to="/creator-auth" replace />} />
                <Route path="/writer-auth" element={<Navigate to="/creator-auth" replace />} />
                <Route path="/publisher-auth" element={<Navigate to="/creator-auth" replace />} />
                <Route path="/narrator-auth" element={<Navigate to="/creator-auth" replace />} />
                <Route path="/admin-auth" element={<Navigate to="/admin" replace />} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
                <Route path="/book/:slug" element={<BookDetail />} />
                <Route path="/b/:bookId" element={<BookDetail />} />
                <Route path="/books" element={<BooksPage />} />
                <Route path="/authors" element={<AuthorsPage />} />
                <Route path="/narrators" element={<NarratorsPage />} />
                <Route path="/author/:id" element={<AuthorProfile />} />
                <Route path="/narrator/:id" element={<NarratorProfile />} />
                <Route path="/publisher/:id" element={<PublisherProfile />} />
                <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
                <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
                <Route path="/apply" element={<CreatorApply />} />
                <Route path="/read/:slug" element={<ProtectedRoute><EbookReader /></ProtectedRoute>} />
                <Route path="/subscriptions" element={<Subscriptions />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/payment/callback" element={<PaymentCallback />} />
                <Route path="/checkout/success" element={<LegacyCheckoutCallbackRedirect status="success" />} />
                <Route path="/checkout/fail" element={<LegacyCheckoutCallbackRedirect status="failed" />} />
                <Route path="/checkout/failed" element={<LegacyCheckoutCallbackRedirect status="failed" />} />
                <Route path="/checkout/cancel" element={<LegacyCheckoutCallbackRedirect status="cancelled" />} />
                <Route path="/checkout/cancelled" element={<LegacyCheckoutCallbackRedirect status="cancelled" />} />
                <Route path="/page/:slug" element={<CmsPage />} />
                <Route path="/blog" element={<BlogList />} />
                <Route path="/blog/:slug" element={<BlogPost />} />
                <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
                <Route path="/rewards" element={<ProtectedRoute><RewardCenter /></ProtectedRoute>} />
                <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
                <Route path="/coin-store" element={<ProtectedRoute><CoinStore /></ProtectedRoute>} />
                <Route path="/notification-settings" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />
                <Route path="/invite" element={<ProtectedRoute><InvitePage /></ProtectedRoute>} />
                <Route path="/gamification" element={<ProtectedRoute><GamificationPage /></ProtectedRoute>} />
                <Route path="/tts-demo" element={<ProtectedRoute><TtsDemo /></ProtectedRoute>} />
                {/* Admin — /admin shows login if unauthenticated, dashboard if admin */}
                <Route path="/admin" element={<AdminGateway />}>
                  <Route element={<AdminLayout />}>
                  <Route index element={<ErrorBoundary><AdminDashboard /></ErrorBoundary>} />
                  <Route path="books" element={<AdminBooks />} />
                  <Route path="tts-management" element={<AdminTtsManagement />} />
                  <Route path="authors" element={<AdminAuthors />} />
                  <Route path="narrators" element={<AdminNarrators />} />
                  <Route path="publishers" element={<AdminPublishers />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="payments" element={<AdminPayments />} />
                  <Route path="payment-gateways" element={<AdminPaymentGateways />} />
                  <Route path="reviews" element={<AdminReviews />} />
                  <Route path="categories" element={<AdminCategories />} />
                  <Route path="applications" element={<AdminRoleApplications />} />
                  <Route path="revenue" element={<AdminRevenueSplits />} />
                  <Route path="submissions" element={<AdminSubmissions />} />
                  <Route path="shipping" element={<AdminShippingMethods />} />
                  <Route path="free-shipping" element={<AdminFreeShipping />} />
                  <Route path="subscriptions" element={<AdminSubscriptionPlans />} />
                  <Route path="coupons" element={<AdminCoupons />} />
                  <Route path="withdrawals" element={<AdminWithdrawals />} />
                  <Route path="earnings" element={<AdminEarnings />} />
                  <Route path="accounting" element={<AdminAccounting />} />
                  <Route path="financial-reports" element={<AdminFinancialReports />} />
                  <Route path="investor-report" element={<AdminInvestorReport />} />
                  <Route path="notifications" element={<AdminNotifications />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="user/:type/:id" element={<AdminUserDetail />} />
                  <Route path="email-templates" element={<AdminEmailTemplates />} />
                  <Route path="email-logs" element={<AdminEmailLogs />} />
                  <Route path="email-settings" element={<AdminEmailSettings />} />
                  <Route path="analytics" element={<AdminAnalytics />} />
                  <Route path="pages" element={<AdminCmsPages />} />
                  <Route path="blog" element={<AdminBlog />} />
                  <Route path="homepage-sections" element={<AdminHomepageSections />} />
                  <Route path="banners" element={<AdminBanners />} />
                  <Route path="tickets" element={<AdminTickets />} />
                  <Route path="ticket/:id" element={<AdminTicketDetail />} />
                  <Route path="roles" element={<AdminRoles />} />
                  <Route path="activity-logs" element={<AdminActivityLogs />} />
                  <Route path="wallets" element={<AdminWallets />} />
                  <Route path="coin-settings" element={<AdminCoinSettings />} />
                  <Route path="coin-packages" element={<AdminCoinPackages />} />
                  <Route path="ad-placements" element={<AdminAdPlacements />} />
                  <Route path="ad-banners" element={<AdminAdBanners />} />
                  <Route path="ad-campaigns" element={<AdminAdCampaigns />} />
                  <Route path="ad-settings" element={<AdminAdSettings />} />
                  <Route path="ad-reports" element={<AdminAdReports />} />
                  <Route path="recommendations" element={<AdminRecommendations />} />
                  <Route path="drm-settings" element={<AdminDrmSettings />} />
                  <Route path="radio" element={<AdminRadio />} />
                  <Route path="rj-management" element={<AdminRjManagement />} />
                  <Route path="referrals" element={<AdminReferrals />} />
                  <Route path="gamification" element={<AdminGamification />} />
                  <Route path="system-logs" element={<AdminSystemLogs />} />
                  <Route path="creator-permissions" element={<AdminUserPermissions />} />
                  <Route path="site-settings" element={<AdminSiteSettings />} />
                  <Route path="sms" element={<AdminSms />} />
                  <Route path="reading-analytics" element={<AdminReadingAnalytics />} />
                  <Route path="purchase-report" element={<AdminPurchaseReport />} />
                  <Route path="revenue-audit" element={<AdminRevenueAudit />} />
                  <Route path="live-monitoring" element={<AdminLiveMonitoring />} />
                  <Route path="r2-dashboard" element={<AdminR2Dashboard />} />
                  <Route path="db-health" element={<AdminDbHealth />} />
                  <Route path="alerts" element={<AdminAlerts />} />
                  <Route path="user-analytics" element={<AdminUserAnalytics />} />
                  <Route path="revenue-dashboard" element={<AdminRevenueDashboard />} />
                  <Route path="performance" element={<AdminPerformance />} />
                  <Route path="weekly-report" element={<AdminWeeklyReport />} />
                  <Route path="backup-status" element={<AdminBackupStatus />} />
                  </Route>
                </Route>

                {/* Creator Panel */}
                <Route path="/creator" element={<ProtectedRoute requiredRole={["writer", "publisher", "narrator"]} loginPath="/creator-auth" deniedPath="/"><CreatorLayout /></ProtectedRoute>}>
                  <Route index element={<CreatorDashboard />} />
                  <Route path="books" element={<CreatorBooks />} />
                  <Route path="audiobooks" element={<NarratorAudiobooks />} />
                  <Route path="inventory" element={<PublisherInventory />} />
                  <Route path="earnings" element={<CreatorEarnings />} />
                  <Route path="profile" element={<CreatorProfile />} />
                </Route>
                <Route path="/creator-auth" element={<CreatorAuth />} />

                {/* RJ Panel */}
                <Route path="/rj-auth" element={<RjAuth />} />
                <Route path="/rj" element={<ProtectedRoute requiredRole="rj" loginPath="/rj-auth"><RjLayout /></ProtectedRoute>}>
                  <Route index element={<RjDashboard />} />
                  <Route path="profile" element={<RjProfile />} />
                  <Route path="schedule" element={<RjSchedule />} />
                </Route>

                {/* Legacy redirects */}
                <Route path="/writer/*" element={<RedirectToCreator />} />
                <Route path="/publisher/*" element={<RedirectToCreator />} />
                <Route path="/narrator/*" element={<RedirectToCreator />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
              <Suspense fallback={null}><MiniPlayer /></Suspense>
              <Suspense fallback={null}><FullPlayer /></Suspense>
              <Suspense fallback={null}><GlobalAudiobookPaywall /></Suspense>
              <Suspense fallback={null}><CartDrawer /></Suspense>
            </AudioPlayerProvider>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </trpc.Provider>
  </SentryErrorBoundary>
  );
};

export default App;
