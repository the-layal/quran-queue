import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mushafSvgRouter from "./mushafSvg";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mushafSvgRouter);

export default router;
