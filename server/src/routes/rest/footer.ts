import { Router } from "express";
import { sendHttpError } from "../../lib/http.js";
import { getFooterData } from "../../services/footer.service.js";


export const footerRestRouter = Router();

footerRestRouter.get("/", async (req, res) => {
  try {
    const result = await getFooterData();
    res.json(result);
  } catch (error) {
    sendHttpError(res, error);
  }
});