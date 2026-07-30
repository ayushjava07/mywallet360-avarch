import { isSwapTransaction } from "../services/personality.service.js";

const APPROVE_SELECTOR = "0x095ea7b3";

export function isApproveTransaction(record) {
  const input = String(record.input || "").toLowerCase();
  return input.startsWith(APPROVE_SELECTOR);
}

export function resolveTransactionMethod(record, type) {
  if (type === "normal" && isApproveTransaction(record)) return "Approve";

  if (type === "token" || type === "nft") return "Transfer";

  if (type === "internal") {
    return record.input && record.input !== "0x" ? "Contract Interaction" : "Transfer";
  }

  if (isSwapTransaction(record)) return "Token Swap";
  if (record.input && record.input !== "0x") return "Contract Interaction";
  return "Transfer";
}

export function isContractTriggeredTransfer(record, type) {
  if (type !== "internal") return false;
  return resolveTransactionMethod(record, type) === "Transfer";
}

export function getMethodDisplayLabel(method, contractTriggered) {
  if (contractTriggered && method === "Transfer") return "Transfer*";
  return method;
}
