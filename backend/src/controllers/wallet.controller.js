import { getPortfolioInventory, getWalletData } from "../services/blockaction.service.js";
import { getPaginatedWalletTransactions } from "../services/transaction-table.service.js";
import { isAddress } from "ethers";
import { HttpError } from "../middleware/error.middleware.js";

const ALLOWED_ANALYSIS_DAYS = new Set([1, 7, 30, 365]);
const ALLOWED_ANALYSIS_PERIODS = new Set(["ytd"]);

export const getWalletInventory = (req, res, next) => {
  const { address } = req.params;

  if (!isAddress(address)) {
    next(new HttpError(400, "INVALID_WALLET_ADDRESS", "Enter a valid Ethereum wallet address."));
    return;
  }

  res.set("Cache-Control", "private, no-store").json(getPortfolioInventory(address));
};

export const getWalletTransactions = async (req, res, next) => {
  const { address } = req.params;
  const {
    type = "normal",
    page = "1",
    limit = "25",
    period,
    days,
    from,
    to,
    sort = "age",
    order = "desc",
    hideLowValue,
  } = req.query;

  if (!isAddress(address)) {
    next(new HttpError(400, "INVALID_WALLET_ADDRESS", "Enter a valid Ethereum wallet address."));
    return;
  }

  const customRange = from && to ? { from, to } : null;
  const analysisPeriod = customRange ? "custom" : (period || days || "ytd");

  try {
    const payload = await getPaginatedWalletTransactions({
      address: address.toLowerCase(),
      type,
      page: Number(page),
      limit: Number(limit),
      analysisPeriod,
      customRange,
      sort,
      order,
      hideLowValue: hideLowValue === "true" || hideLowValue === "1",
    });

    res.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
    res.json(payload);
  } catch (error) {
    if (error.message === "Invalid analysis period") {
      next(new HttpError(400, "INVALID_ANALYSIS_PERIOD", "Choose YTD or an analysis period of 1, 7, 30, or 365 days."));
      return;
    }
    next(error);
  }
};

export const getWalletProfile = async (req, res, next) => {
  const { address } = req.params;
  const { from, to } = req.query;

  if (from && to) {
    if (!isAddress(address)) {
      next(new HttpError(400, "INVALID_WALLET_ADDRESS", "Enter a valid Ethereum wallet address."));
      return;
    }

    try {
      const walletData = await getWalletData(address, "custom", { from, to });
      res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=240");
      res.json(walletData);
    } catch (error) {
      next(error);
    }
    return;
  }

  const requestedPeriod = req.query.period || req.query.days || "ytd";
  const analysisPeriod = ALLOWED_ANALYSIS_PERIODS.has(requestedPeriod)
    ? requestedPeriod
    : Number(requestedPeriod);

  if (!isAddress(address)) {
    next(new HttpError(400, "INVALID_WALLET_ADDRESS", "Enter a valid Ethereum wallet address."));
    return;
  }

  if (!ALLOWED_ANALYSIS_PERIODS.has(analysisPeriod) && !ALLOWED_ANALYSIS_DAYS.has(analysisPeriod)) {
    next(new HttpError(400, "INVALID_ANALYSIS_PERIOD", "Choose YTD or an analysis period of 1, 7, 30, or 365 days."));
    return;
  }

  try {
    const walletData = await getWalletData(address, analysisPeriod);
    res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=240");
    res.json(walletData);
  } catch (error) {
    next(error);
  }
};
