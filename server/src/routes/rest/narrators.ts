import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getAllNarrators } from "../../services/narrators.service.js";

export const narratorsRestRouter = Router();

narratorsRestRouter.get("/", async (req, res) => {
  try {
    const result = await getAllNarrators();
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});