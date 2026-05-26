import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import {
  register, registerSchema,
  login, loginSchema,
  refreshTokens, refreshSchema,
  logout, logoutSchema,
  forgotPassword, forgotPasswordSchema,
  resetPassword, resetPasswordSchema,
  getMe,
  updateMe, updateMeSchema,
  changePassword, changePasswordSchema,
} from "../controllers/auth";

const router = Router();

const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts, please try again later" } },
});

router.post("/register", authRateLimit, validate(registerSchema), register);
router.post("/login", authRateLimit, validate(loginSchema), login);
router.post("/refresh", validate(refreshSchema), refreshTokens);
router.post("/logout", requireAuth, validate(logoutSchema), logout);
router.post("/forgot-password", authRateLimit, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", authRateLimit, validate(resetPasswordSchema), resetPassword);
router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, validate(updateMeSchema), updateMe);
router.patch("/me/password", requireAuth, validate(changePasswordSchema), changePassword);

export default router;
