import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireMember } from "../middleware/household";
import { getChoreAnalytics, getExpenseAnalytics } from "../controllers/analytics";

const router = Router({ mergeParams: true });

router.use(requireAuth, requireMember("hid"));

router.get("/chores", getChoreAnalytics);
router.get("/expenses", getExpenseAnalytics);

export default router;
