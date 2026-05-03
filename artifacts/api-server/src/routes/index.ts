import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mushafSvgRouter from "./mushafSvg";
import qpcFontRouter from "./qpcFont";
import queuesRouter from "./queues";
import authRouter from "./auth";
import trackerRouter from "./tracker";
import qfAuthRouter from "./qfAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mushafSvgRouter);
router.use(qpcFontRouter);
router.use(queuesRouter);
router.use(authRouter);
router.use(trackerRouter);
router.use(qfAuthRouter);

export default router;
