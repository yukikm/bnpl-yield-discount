import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function randomBytes32Hex(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}`;
}

