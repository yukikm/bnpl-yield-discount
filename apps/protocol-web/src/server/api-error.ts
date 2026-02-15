import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "CONFLICT"
  | "NOT_FOUND"
  | "INTERNAL";

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonError(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status },
    );
  }

  console.error(err);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Internal error" } },
    { status: 500 },
  );
}
