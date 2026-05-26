import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireMember } from "../middleware/household";
import { validate } from "../middleware/validate";
import {
  getExpenses,
  addExpense, addExpenseSchema,
  updateExpense, updateExpenseSchema,
  deleteExpense,
  getSettlements,
  addSettlement, addSettlementSchema,
  getBalances,
} from "../controllers/expenses";

const router = Router({ mergeParams: true });

router.use(requireAuth, requireMember("hid"));

router.get("/", getExpenses);
router.post("/", validate(addExpenseSchema), addExpense);
router.patch("/:id", validate(updateExpenseSchema), updateExpense);
router.delete("/:id", deleteExpense);
router.get("/settlements", getSettlements);
router.post("/settlements", validate(addSettlementSchema), addSettlement);
router.get("/balances", getBalances);

export default router;
