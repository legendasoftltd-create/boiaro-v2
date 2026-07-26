import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { prisma } from "../../lib/prisma.js";
import { detectCountryCode } from "../../lib/geoCountry.js";

export const paymentConfigRestRouter = Router();

// ── GET /api/v1/payment/config/ios ──────────────────────────────────────────
// Public. Tells the iOS app whether to show the SSLCommerz payment option,
// based on the admin-managed `sslcommerz_enabled_ios` global toggle and, when
// enabled, whether the caller's detected country is in `allowed_countries_ios`.
paymentConfigRestRouter.get("/ios", async (req, res) => {
  try {
    const rows = await prisma.platformSetting.findMany({
      where: { key: { in: ["sslcommerz_enabled_ios", "allowed_countries_ios"] } },
    });
    const map: Record<string, string> = {};
    rows.forEach((r) => { map[r.key] = r.value; });

    const isGlobalEnabled = map.sslcommerz_enabled_ios === "true";
    if (!isGlobalEnabled) {
      res.json({ success: true, show_sslcommerz: false });
      return;
    }

    const allowedCountries = (map.allowed_countries_ios || "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);

    const detectedCountry = detectCountryCode(req);
    const showSslcommerz = !!detectedCountry && allowedCountries.includes(detectedCountry);

    res.json({ success: true, show_sslcommerz: showSslcommerz });
  } catch (error) {
    sendHttpError(res, error);
  }
});
