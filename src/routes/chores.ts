import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireMember } from "../middleware/household";
import { validate } from "../middleware/validate";
import {
  getChores,
  addChore, addChoreSchema,
  updateChore, updateChoreSchema,
  deleteChore,
  getCompletions,
  markComplete,
  undoComplete,
} from "../controllers/chores";

const router = Router({ mergeParams: true });

router.use(requireAuth, requireMember("hid"));

router.get("/", getChores);
router.post("/", validate(addChoreSchema), addChore);
router.get("/completions", getCompletions);
router.patch("/:id", validate(updateChoreSchema), updateChore);
router.delete("/:id", deleteChore);
router.post("/:id/complete", markComplete);
router.delete("/:id/completions/:logId", undoComplete);

export default router;
