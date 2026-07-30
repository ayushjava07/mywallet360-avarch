import { rateLimit } from "express-rate-limit";

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const walletWindowMs = positiveInteger(process.env.WALLET_RATE_LIMIT_WINDOW_MS, 60_000);
const walletRequestLimit = positiveInteger(process.env.WALLET_RATE_LIMIT_MAX, 10);

const createRateLimit = ({ limit, code, message }) => {
  if (process.env.NODE_ENV === "test") {
    return (req, res, next) => next();
  }
  return rateLimit({
    windowMs: walletWindowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => {
      const resetTime = req.rateLimit?.resetTime?.getTime();
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime - Date.now()) / 1000))
        : Math.ceil(walletWindowMs / 1000);

      res.status(429).json({
        success: false,
        code,
        message,
        retryAfterSeconds,
        requestId: req.requestId,
      });
    },
  });
};

export const walletAnalysisRateLimit = createRateLimit({
  limit: walletRequestLimit,
  code: "WALLET_ANALYSIS_RATE_LIMITED",
  message: "Too many wallet analysis requests. Please try again shortly.",
});

export const walletInventoryRateLimit = createRateLimit({
  limit: positiveInteger(process.env.WALLET_INVENTORY_RATE_LIMIT_MAX, 40),
  code: "WALLET_INVENTORY_RATE_LIMITED",
  message: "Too many inventory status requests. Please try again shortly.",
});

export const domainResolutionRateLimit = createRateLimit({
  limit: positiveInteger(process.env.DOMAIN_RESOLUTION_RATE_LIMIT_MAX, 30),
  code: "DOMAIN_RESOLUTION_RATE_LIMITED",
  message: "Too many domain searches. Please try again shortly.",
});
