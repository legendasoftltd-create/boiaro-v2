import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getAllPublishers } from "../../services/publishers.service.js";

export const publishersRestRouter = Router();

publishersRestRouter.get("/", async (req, res) => {
  try {
    const result = await getAllPublishers();
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});