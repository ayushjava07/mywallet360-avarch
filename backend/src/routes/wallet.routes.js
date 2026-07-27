import express from "express";
import {
  getWalletInventory,
  getWalletProfile,
  getWalletTransactions,
} from "../controllers/wallet.controller.js";
import { walletAnalysisRateLimit } from "../middleware/rate-limit.middleware.js";

const router = express.Router();

router.get("/:address/inventory", walletAnalysisRateLimit, getWalletInventory);
router.get("/:address/transactions", walletAnalysisRateLimit, getWalletTransactions);
router.get("/:address", walletAnalysisRateLimit, getWalletProfile);

export default router;
