import express from "express";
import {
  getWalletInventory,
  getWalletProfile,
  getWalletTransactions,
} from "../controllers/wallet.controller.js";
import { walletAnalysisRateLimit, walletInventoryRateLimit } from "../middleware/rate-limit.middleware.js";

const router = express.Router();

router.get("/:address/inventory", walletInventoryRateLimit, getWalletInventory);
router.get("/:address/transactions", walletAnalysisRateLimit, getWalletTransactions);
router.get("/:address", walletAnalysisRateLimit, getWalletProfile);

export default router;
