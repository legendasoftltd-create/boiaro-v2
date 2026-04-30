import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getHomepageData } from "../../services/homepage.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

export const homepageRestRouter = Router();

const getLimitFromQuery = (rawLimit: unknown) => {
  if (Array.isArray(rawLimit)) return rawLimit[0];
  return rawLimit;
};

homepageRestRouter.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const limit = getLimitFromQuery(req.query.limit);
    const userId = req.auth?.userId ?? undefined;
    const result = await getHomepageData(limit, userId);
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

homepageRestRouter.get("/:section", async (req: AuthenticatedRequest, res) => {
  try {
    const limit = getLimitFromQuery(req.query.limit);
    const userId = req.auth?.userId ?? undefined;
    const homepageData = await getHomepageData(limit, userId);
    const rawSection = req.params.section;
    const section = Array.isArray(rawSection) ? rawSection[0] : rawSection;

    const sectionMap: Record<string, unknown> = {
      slider: homepageData.slider,
      trendingNow: homepageData.trendingNow,
      popularBooks: homepageData.popularBooks,
      becauseYouRead: homepageData.BecauseYouRead,
      editorsPick: homepageData.editorsPick,
      appDownload: homepageData.appDownload,
      popularAudiobooks: homepageData.popularAudiobooks,
      popularHardCopies: homepageData.popularHardCopies,
      popularEbooks: homepageData.popularEbooks,
      topMostRead: homepageData.topTenMostRead,
      allCategory: homepageData.allCategory,
      allAuthor: homepageData.allAuthor,
      allNarrators: homepageData.allNarrators,
      countsValue: homepageData.countsValue,
      newReleases: homepageData.NewReleases,
      freeBooks: homepageData.FreeBooks,
      continueReading: homepageData.continueReading,
      continueListening: homepageData.continueListening,
      radio: homepageData.radio,
      currentUser: homepageData.currentUser,
    };

    if (!section || !(section in sectionMap)) {
      return res.status(404).json({
        error: "Homepage section not found",
      });
    }

    return res.json({
      section,
      data: sectionMap[section],
    });
  } catch (error) {
    return sendHttpError(res, error);
  }
});
