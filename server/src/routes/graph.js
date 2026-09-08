import { Router } from "express";

import { readGraph } from "../tree.js";

export const graphRouter = Router();

graphRouter.get("/", (_req, res) => {
    return res.json(readGraph())
});
