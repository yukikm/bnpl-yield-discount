import { ApiError } from "./api-error";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ApiError(500, "INTERNAL", `Missing env: ${name}`);
  }
  return value;
}

