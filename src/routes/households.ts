import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireOwner } from "../middleware/household";
import { validate } from "../middleware/validate";
import {
  getHouseholds,
  createHousehold, createHouseholdSchema,
  joinHousehold, joinHouseholdSchema,
  getHousehold,
  updateHousehold, updateHouseholdSchema,
  deleteHousehold,
  getMembers,
  removeMember,
  changeRole, changeRoleSchema,
  transferOwnership, transferOwnershipSchema,
  regenerateCode,
  leaveHousehold,
  lookupByCode,
} from "../controllers/households";
import { requireMember } from "../middleware/household";

const router = Router();

router.use(requireAuth);

router.get("/", getHouseholds);
router.post("/", validate(createHouseholdSchema), createHousehold);
router.post("/join", validate(joinHouseholdSchema), joinHousehold);
router.get("/by-code", lookupByCode);

router.get("/:id", requireMember("id"), getHousehold);
router.patch("/:id", requireOwner(), validate(updateHouseholdSchema), updateHousehold);
router.delete("/:id", requireOwner(), deleteHousehold);

router.get("/:id/members", requireMember("id"), getMembers);
router.delete("/:id/members/:uid", requireOwner(), removeMember);
router.patch("/:id/members/:uid/role", requireOwner(), validate(changeRoleSchema), changeRole);
router.post("/:id/transfer-ownership", requireOwner(), validate(transferOwnershipSchema), transferOwnership);
router.post("/:id/regenerate-code", requireOwner(), regenerateCode);
router.post("/:id/leave", requireMember("id"), leaveHousehold);

export default router;
