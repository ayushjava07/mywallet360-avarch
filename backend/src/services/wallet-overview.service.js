import { getAddress, JsonRpcProvider } from "ethers";
import { blockActionRequest } from "./blockaction.service.js";

const EIP7702_PREFIX = "0xef0100";
const FUNDED_BY_MAX_PAGES = 5;
const PAGE_SIZE = 1000;

let rpcProvider;

function getRpcProvider() {
  if (!rpcProvider) {
    const rpcUrl = process.env.ETHEREUM_RPC_URL;
    if (!rpcUrl) {
      throw new Error("ETHEREUM_RPC_URL is not configured");
    }
    rpcProvider = new JsonRpcProvider(rpcUrl, "mainnet");
  }
  return rpcProvider;
}

function formatIsoDate(timestampSeconds) {
  if (!timestampSeconds) return null;
  return new Date(Number(timestampSeconds) * 1000).toISOString();
}

function relativeAgeFromTimestamp(timestampSeconds) {
  if (!timestampSeconds) return null;
  const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000 - Number(timestampSeconds)));
  const days = Math.floor(elapsedSeconds / 86_400);
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `${years} yr${years === 1 ? "" : "s"} ago`;
  }
  if (days >= 30) {
    const months = Math.floor(days / 30);
    return `${months} mo${months === 1 ? "" : "s"} ago`;
  }
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(elapsedSeconds / 3600);
  if (hours >= 1) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  return "Just now";
}

async function fetchTxPage(address, { sort, page = 1, offset = PAGE_SIZE }) {
  return blockActionRequest({
    module: "account",
    action: "txlist",
    address,
    page,
    offset,
    sort,
    startblock: 0,
    endblock: 99999999,
  });
}

export function findFirstInboundNativeEth(transactions, address) {
  const normalizedAddress = address.toLowerCase();
  for (const transaction of transactions || []) {
    if (transaction.isError === "1") continue;
    if (transaction.to?.toLowerCase() !== normalizedAddress) continue;
    if (Number(transaction.value || 0) <= 0) continue;
    return {
      from: transaction.from?.toLowerCase() || null,
      timestamp: Number(transaction.timeStamp || 0),
      hash: transaction.hash || null,
    };
  }
  return null;
}

export async function fetchFundedBy(address) {
  for (let page = 1; page <= FUNDED_BY_MAX_PAGES; page += 1) {
    const records = await fetchTxPage(address, { sort: "asc", page });
    const match = findFirstInboundNativeEth(records, address);
    if (match?.from) {
      return {
        address: match.from,
        timestamp: formatIsoDate(match.timestamp),
        ageLabel: relativeAgeFromTimestamp(match.timestamp),
        transactionHash: match.hash,
        complete: records.length < PAGE_SIZE,
      };
    }
    if (records.length < PAGE_SIZE) {
      return null;
    }
  }
  return null;
}

export async function fetchLifetimeTransactionBounds(address) {
  const [oldestRecords, newestRecords] = await Promise.all([
    fetchTxPage(address, { sort: "asc", page: 1, offset: 1 }),
    fetchTxPage(address, { sort: "desc", page: 1, offset: 1 }),
  ]);

  const first = oldestRecords?.[0];
  const latest = newestRecords?.[0];

  if (!first && !latest) {
    return {
      firstTransactionAt: null,
      latestTransactionAt: null,
    };
  }

  return {
    firstTransactionAt: first ? formatIsoDate(first.timeStamp) : null,
    latestTransactionAt: latest ? formatIsoDate(latest.timeStamp) : null,
  };
}

export async function fetchEip7702Delegation(address) {
  try {
    const code = await getRpcProvider().getCode(address);
    if (!code || code === "0x") return null;

    const normalized = code.toLowerCase();
    if (!normalized.startsWith(EIP7702_PREFIX)) return null;

    const delegateHex = `0x${normalized.slice(EIP7702_PREFIX.length, EIP7702_PREFIX.length + 40)}`;
    if (delegateHex.length !== 42) return null;

    return {
      delegateAddress: getAddress(delegateHex),
      type: "EIP-7702",
    };
  } catch (error) {
    console.warn(`[Wallet Overview] EIP-7702 lookup failed for ${address}: ${error.message}`);
    return null;
  }
}

export function summarizeEtherscanTokenPortfolio(tokens) {
  if (!Array.isArray(tokens)) return null;

  let valueUsd = 0;
  let pricedCount = 0;

  for (const token of tokens) {
    const quantity = Number(token.TokenQuantity || 0);
    const divisor = Number(token.TokenDivisor || 0);
    const price = Number(token.TokenPriceUSD || 0);
    const balance = divisor >= 0 ? quantity / (10 ** divisor) : 0;
    if (price > 0 && balance > 0) {
      valueUsd += balance * price;
      pricedCount += 1;
    }
  }

  return {
    valueUsd,
    pricedCount,
    totalCount: tokens.length,
  };
}

export function buildTokenHoldingsSummary(
  assets,
  ethPrice,
  portfolioInventory = null,
  etherscanTokenSummary = null,
) {
  const nonEthAssets = (assets || []).filter((asset) => asset.symbol !== "ETH");
  const priced = nonEthAssets.filter((asset) => asset.priceAvailable);
  const transferScanValueUsd = priced.reduce((sum, asset) => sum + Number(asset.usdValue || 0), 0);
  const transferScanTokenCount = nonEthAssets.length;
  const transferScanPricedCount = priced.length;

  const inventoryComplete = portfolioInventory?.status === "complete";
  const inventoryTokenCount = inventoryComplete
    ? Number(portfolioInventory.tokenHoldingsCount)
    : null;
  const inventoryValueUsd = inventoryComplete && Number.isFinite(Number(portfolioInventory.tokenValueUsd))
    ? Number(portfolioInventory.tokenValueUsd)
    : null;
  const inventoryPricedCount = inventoryComplete && Number.isFinite(Number(portfolioInventory.pricedCount))
    ? Number(portfolioInventory.pricedCount)
    : null;

  const useEtherscanSnapshot = etherscanTokenSummary && Number.isFinite(etherscanTokenSummary.valueUsd);
  const useInventoryValuation = inventoryValueUsd !== null;

  const tokenValueUsd = useInventoryValuation
    ? inventoryValueUsd
    : useEtherscanSnapshot
      ? etherscanTokenSummary.valueUsd
      : transferScanValueUsd;

  const pricedTokenCount = useInventoryValuation
    ? inventoryPricedCount ?? transferScanPricedCount
    : useEtherscanSnapshot
      ? etherscanTokenSummary.pricedCount
      : transferScanPricedCount;

  const totalTokenCount = inventoryComplete && Number.isFinite(inventoryTokenCount)
    ? inventoryTokenCount
    : useEtherscanSnapshot
      ? etherscanTokenSummary.totalCount
      : transferScanTokenCount;

  const unpricedCount = Math.max(0, totalTokenCount - pricedTokenCount);
  const totalAssetsHeld = inventoryComplete && Number.isFinite(inventoryTokenCount)
    ? 1 + inventoryTokenCount
    : useEtherscanSnapshot
      ? 1 + etherscanTokenSummary.totalCount
      : (assets || []).length;

  const valuationSource = useInventoryValuation || useEtherscanSnapshot
    ? "etherscan_snapshot"
    : "transfer_scan";

  return {
    tokenValueUsd,
    pricedTokenCount,
    totalTokenCount,
    unpricedCount,
    totalAssetsHeld,
    inventorySource: inventoryComplete ? "etherscan_inventory" : valuationSource,
    inventoryComplete: inventoryComplete,
    inventoryPending: portfolioInventory?.status === "pending",
    valuationSource,
    ethPrice,
  };
}

export async function buildAddressOverview({
  address,
  ethBalance,
  ethPrice,
  assets,
  portfolioInventory = null,
  etherscanTokenSummary = null,
}) {
  const tokenSummary = buildTokenHoldingsSummary(
    assets,
    ethPrice,
    portfolioInventory,
    etherscanTokenSummary,
  );
  const ethValueUsd = ethBalance * ethPrice;

  const [transactionBounds, fundedBy, delegation] = await Promise.all([
    fetchLifetimeTransactionBounds(address),
    fetchFundedBy(address),
    fetchEip7702Delegation(address),
  ]);

  return {
    ethBalance,
    ethValueUsd,
    tokenHoldings: {
      valueUsd: tokenSummary.tokenValueUsd,
      pricedCount: tokenSummary.pricedTokenCount,
      totalCount: tokenSummary.totalTokenCount,
      unpricedCount: tokenSummary.unpricedCount,
      totalAssetsHeld: tokenSummary.totalAssetsHeld,
      inventorySource: tokenSummary.inventorySource,
      inventoryComplete: tokenSummary.inventoryComplete,
      inventoryPending: tokenSummary.inventoryPending,
      valuationSource: tokenSummary.valuationSource,
    },
    firstTransactionAt: transactionBounds.firstTransactionAt,
    latestTransactionAt: transactionBounds.latestTransactionAt,
    fundedBy,
    delegation,
  };
}
