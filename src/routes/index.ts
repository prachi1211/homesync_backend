import { Router } from "express";
import authRouter from "./auth";
import householdsRouter from "./households";
import groceriesRouter from "./groceries";
import choresRouter from "./chores";
import expensesRouter from "./expenses";
import analyticsRouter from "./analytics";

const router = Router();

router.use("/auth", authRouter);
router.use("/households", householdsRouter);
router.use("/households/:hid/groceries", groceriesRouter);
router.use("/households/:hid/chores", choresRouter);
router.use("/households/:hid/expenses", expensesRouter);
router.use("/households/:hid/analytics", analyticsRouter);

export default router;
