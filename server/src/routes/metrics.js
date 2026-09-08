import { Router } from "express";
import { get as getMetrics } from "../metrics.js";

export const metricsRouter = Router();

metricsRouter.get("/", (_req, res) => {
  res.json(getMetrics());
});
