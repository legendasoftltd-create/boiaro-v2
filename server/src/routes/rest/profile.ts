import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getUserProfile, updateUserProfile } from "../../services/profile.service.js";
import { AuthenticatedRequest, requireAuth } from "../../middleware/auth.js";
import { profileUpdateSchema } from "../../schemas/profile.js";
import { uploadWithFallback } from "../../lib/s3.js";

export const profileRestRouter = Router();


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../../../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const PORT = parseInt(process.env.PORT || "3001", 10);
const BASE_URL = (process.env.FRONTEND_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const fallbackConfig = { uploadsDir: UPLOADS_DIR, baseUrl: BASE_URL };

const uploadProfileImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, or WebP images are allowed"));
    }
  },
});

profileRestRouter.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    res.json(await getUserProfile(req.auth.userId));
  } catch (error) {
    sendHttpError(res, error);
  }
});

profileRestRouter.patch("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const updateData = profileUpdateSchema.parse(req.body);
    res.json(await updateUserProfile(req.auth.userId, updateData));
  } catch (error) {
    sendHttpError(res, error);
  }
});

profileRestRouter.post(
  "/upload-image",
  requireAuth,
  uploadProfileImage.fields([
    { name: "image", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  async (req: AuthenticatedRequest, res) => {
    try {
      const files = req.files as { image?: Express.Multer.File[]; file?: Express.Multer.File[] } | undefined;
      const imageFile = files?.image?.[0] ?? files?.file?.[0];

      if (!imageFile) {
        res.status(400).json({ error: "No image provided. Use form-data field 'image'." });
        return;
      }

      const result = await uploadWithFallback(
        imageFile.buffer,
        imageFile.originalname,
        imageFile.mimetype,
        { hint: "avatar" },
        fallbackConfig
      );

      await updateUserProfile(req.auth.userId, { avatar_url: result.url });

      res.status(201).json({
        success: true,
        message: "Profile image uploaded",
        avatar_url: result.url,
        storage: result.via,
      });
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);
