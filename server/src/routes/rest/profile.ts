import crypto from "crypto";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getUserProfile, updateUserProfile } from "../../services/profile.service.js";
import { AuthenticatedRequest, requireAuth } from "../../middleware/auth.js";
import { profileUpdateSchema } from "../../schemas/profile.js";

export const profileRestRouter = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../../../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const uploadProfileImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, or WebP images are allowed"));
    }
  },
});

profileRestRouter.get("/",requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId;

    
    const result = await getUserProfile(userId);

    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});

profileRestRouter.patch("/",requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.auth.userId;
    const updateData = profileUpdateSchema.parse(req.body);

    const result = await updateUserProfile(userId, updateData);

    res.json(result);
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
      const userId = req.auth.userId;
      const imageFile =
        (req.files as { image?: Express.Multer.File[]; file?: Express.Multer.File[] } | undefined)
          ?.image?.[0] ??
        (req.files as { image?: Express.Multer.File[]; file?: Express.Multer.File[] } | undefined)
          ?.file?.[0];

      if (!imageFile) {
        res.status(400).json({ error: "No image provided. Use form-data field 'image'." });
        return;
      }

      const baseUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
      const avatarUrl = `${baseUrl}/uploads/${imageFile.filename}`;
      await updateUserProfile(userId, { avatar_url: avatarUrl });

      res.status(201).json({
        success: true,
        message: "Profile image uploaded",
        avatar_url: avatarUrl,
      });
    } catch (error) {
      sendHttpError(res, error);
    }
  }
);
