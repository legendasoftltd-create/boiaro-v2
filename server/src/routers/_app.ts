import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { booksRouter } from "./books.js";
import { profilesRouter } from "./profiles.js";
import { walletRouter } from "./wallet.js";
import { ordersRouter } from "./orders.js";
import { gamificationRouter } from "./gamification.js";
import { notificationsRouter } from "./notifications.js";
import { adminRouter } from "./admin.js";
import { followsRouter } from "./follows.js";
import { shippingRouter } from "./shipping.js";
import { rjRouter } from "./rj.js";
import { contentRouter } from "./content.js";

export const appRouter = router({
  auth: authRouter,
  books: booksRouter,
  profiles: profilesRouter,
  wallet: walletRouter,
  orders: ordersRouter,
  gamification: gamificationRouter,
  notifications: notificationsRouter,
  admin: adminRouter,
  follows: followsRouter,
  shipping: shippingRouter,
  rj: rjRouter,
  content: contentRouter,
});

export type AppRouter = typeof appRouter;
