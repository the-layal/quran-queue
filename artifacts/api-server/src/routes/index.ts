import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mushafSvgRouter from "./mushafSvg";
import qpcFontRouter from "./qpcFont";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mushafSvgRouter);
router.use(qpcFontRouter);

export default router;
