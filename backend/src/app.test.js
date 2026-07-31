import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";

// dotenv may overwrite NODE_ENV from .env — force test mode before loading app/middleware.
process.env.NODE_ENV = "test";

const { default: app } = await import("./app.js");
const { clearWalletServiceCaches } = await import("./services/blockaction.service.js");
const { clearProtocolCache } = await import("./services/protocol-resolution.service.js");
const { clearTransactionTableCaches } = await import("./services/transaction-table.service.js");

function resetTestCaches() {
  clearWalletServiceCaches();
  clearProtocolCache();
  clearTransactionTableCaches();
}

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("health endpoint reports readiness without caching", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(body.status, "ok");
    assert.equal(typeof body.uptimeSeconds, "number");
  });
});

test("rejects invalid wallet addresses before calling upstream services", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wallet/not-an-address`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_WALLET_ADDRESS");
    assert.equal(typeof body.requestId, "string");
  });
});

test("rejects invalid wallet addresses on transactions endpoint", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wallet/not-an-address/transactions?period=ytd`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_WALLET_ADDRESS");
  });
});

test("rejects unsupported analysis periods on transactions endpoint", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wallet/0x742d35Cc6634C0532925a3b844Bc454e4438f44e/transactions?days=20`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_ANALYSIS_PERIOD");
  });
});

test("accepts numeric analysis periods on transactions endpoint", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wallet/0x742d35Cc6634C0532925a3b844Bc454e4438f44e/transactions?days=30`);
    const body = await response.json();

    assert.notEqual(body.code, "INVALID_ANALYSIS_PERIOD");
    assert.ok([200, 500].includes(response.status), `unexpected status ${response.status}`);
  });
});

test("rejects unsupported analysis periods before calling upstream services", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wallet/0x742d35Cc6634C0532925a3b844Bc454e4438f44e?days=20`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_ANALYSIS_PERIOD");
  });
});

test("accepts YTD as the default analysis period before calling upstream services", async () => {
  resetTestCaches();
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wallet/0x742d35Cc6634C0532925a3b844Bc454e4438f44e`);
    const body = await response.json();

    // Without usable upstream credentials this fails; with a configured BlockAction URL it may succeed.
    assert.ok([200, 500].includes(response.status), `unexpected status ${response.status}`);
    if (response.status === 500) {
      assert.ok(body.code === "INTERNAL_SERVER_ERROR" || body.code === "ENOTFOUND");
    } else {
      assert.equal(body.period?.id, "ytd");
    }
  });
});

test("rejects invalid transaction report dates before calling upstream services", async () => {
  await withServer(async (baseUrl) => {
    const address = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
    const response = await fetch(`${baseUrl}/api/report/${address}?from=2026-06-11&to=2026-06-01`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_REPORT_DATES");
  });
});

test("limits transaction reports to one year", async () => {
  await withServer(async (baseUrl) => {
    const address = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
    const response = await fetch(`${baseUrl}/api/report/${address}?from=2024-01-01&to=2026-01-01`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.code, "REPORT_RANGE_TOO_LARGE");
  });
});

test("rejects future transaction report dates", async () => {
  await withServer(async (baseUrl) => {
    const address = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const response = await fetch(`${baseUrl}/api/report/${address}?from=2026-01-01&to=${future}`);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.code, "FUTURE_REPORT_DATE");
  });
});

test("returns a consistent response for unknown endpoints", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.code, "NOT_FOUND");
    assert.equal(typeof body.requestId, "string");
  });
});

test("wallet profile API endpoint returns accurate protocol counts and types", async () => {
  resetTestCaches();
  const originalGet = axios.get;

  axios.get = async (url, options) => {
    const params = options?.params || {};
    const module = params.module;
    const action = params.action;

    if (module === "account" && action === "balance") {
      return { data: { status: "1", message: "OK", result: "1000000000000000000" } };
    }
    if (module === "account" && action === "txlist") {
      return { data: { status: "1", message: "OK", result: [
        { to: "0x5555555555555555555555555555555555555555", from: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", isError: "0", input: "0x12345678", hash: "0x1", timeStamp: "1718000000", value: "0" },
        { to: "0x5555555555555555555555555555555555555555", from: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", isError: "0", input: "0x12345679", hash: "0x1b", timeStamp: "1718000001", value: "0" },
        { to: "0x6666666666666666666666666666666666666666", from: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", isError: "0", input: "0xabcdef", hash: "0x2", timeStamp: "1718000002", value: "0" }
      ] } };
    }
    if (module === "account" && (action === "txlistinternal" || action === "tokentx" || action === "tokennfttx" || action === "addresstokenbalance")) {
      return { data: { status: "1", message: "OK", result: [] } };
    }
    if (module === "contract" && action === "getsourcecode") {
      if (String(params.address || "").toLowerCase() === "0x5555555555555555555555555555555555555555") {
        return { data: { status: "1", message: "OK", result: [{ ContractName: "MockProtocolA" }] } };
      }
      return { data: { status: "1", message: "OK", result: [] } };
    }
    if (module === "stats" && action === "ethprice") {
      return { data: { status: "1", message: "OK", result: { ethusd: "2000" } } };
    }
    if (module === "block" && action === "getblocknobytime") {
      return { data: { status: "1", message: "OK", result: "1234567" } };
    }
    if (url.includes("openchain.xyz")) {
      throw new Error("OpenChain simulation error");
    }
    if (url.includes("alchemy.com") || url.includes("etherscan")) {
      return { data: { result: [] } };
    }
    if (url.includes("llama.fi")) {
      return { data: { coins: {} } };
    }
    throw new Error(`Unhandled mock request for ${url}`);
  };

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/wallet/0x742d35Cc6634C0532925a3b844Bc454e4438f44e?period=ytd`);
      assert.equal(response.status, 200);
      const body = await response.json();

      assert.ok(body.mostUsedProtocol);
      assert.equal(body.mostUsedProtocol.name, "MockProtocolA");
      assert.equal(body.mostUsedProtocol.interactionCount, 2);
      assert.equal(body.mostUsedProtocol.type, "protocol");
      assert.equal(body.mostUsedProtocol.recognizedCount, 2);
      assert.equal(body.mostUsedProtocol.unrecognizedCount, 1);
    });
  } finally {
    axios.get = originalGet;
  }
});

test("wallet API endpoint returns accurate period IDs for all supported periods", async () => {
  resetTestCaches();
  const originalGet = axios.get;

  axios.get = async (url, options) => {
    const params = options?.params || {};
    const module = params.module;
    const action = params.action;

    if (module === "block" && action === "getblocknobytime") {
      return { data: { status: "1", message: "OK", result: "1234567" } };
    }
    if (module === "account" && action === "balance") {
      return { data: { status: "1", message: "OK", result: "1000000000000000000" } };
    }
    if (module === "account" && (action === "txlist" || action === "txlistinternal" || action === "tokentx" || action === "tokennfttx" || action === "addresstokenbalance")) {
      return { data: { status: "1", message: "OK", result: [] } };
    }
    if (module === "stats" && action === "ethprice") {
      return { data: { status: "1", message: "OK", result: { ethusd: "2000" } } };
    }
    if (url.includes("alchemy.com") || url.includes("etherscan") || url.includes("llama.fi")) {
      return { data: { result: [], coins: {} } };
    }
    throw new Error(`Unhandled mock request for ${url}`);
  };

  try {
    await withServer(async (baseUrl) => {
      const periodsToCheck = [
        { query: "period=ytd", expectedId: "ytd" },
        { query: "days=1", expectedId: "1d" },
        { query: "days=7", expectedId: "7d" },
        { query: "days=30", expectedId: "30d" },
        { query: "days=365", expectedId: "365d" },
      ];

      for (const { query, expectedId } of periodsToCheck) {
        const response = await fetch(`${baseUrl}/api/wallet/0x742d35Cc6634C0532925a3b844Bc454e4438f44e?${query}`);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.period?.id, expectedId);
      }
    });
  } finally {
    axios.get = originalGet;
  }
});


