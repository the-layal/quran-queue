import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mushafSvgRouter from "./mushafSvg";
import qpcFontRouter from "./qpcFont";
import queuesRouter from "./queues";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mushafSvgRouter);
router.use(qpcFontRouter);
router.use(queuesRouter);

export default router;
