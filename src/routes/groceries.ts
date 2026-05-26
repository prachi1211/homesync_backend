import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireMember } from "../middleware/household";
import { validate } from "../middleware/validate";
import {
  getItems,
  addItem, addItemSchema,
  updateItem, updateItemSchema,
  deleteItem,
  toggleBought,
  toggleStarred,
  clearBought,
} from "../controllers/groceries";

const router = Router({ mergeParams: true });

router.use(requireAuth, requireMember("hid"));

router.get("/", getItems);
router.post("/", validate(addItemSchema), addItem);
router.delete("/clear-bought", clearBought);
router.patch("/:id", validate(updateItemSchema), updateItem);
router.delete("/:id", deleteItem);
router.post("/:id/toggle-bought", toggleBought);
router.post("/:id/toggle-starred", toggleStarred);

export default router;
