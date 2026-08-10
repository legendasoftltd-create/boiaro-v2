import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/index.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

// Global default omit: several `User` queries across the codebase do
// `include: { profile, roles }` with no top-level `select`, which returns
// every column — including password_hash and the live password-reset OTP.
// None of that should ever leave the auth layer (found leaking through
// several admin endpoints). Hiding it here means every query is safe by
// default; the handful of places that legitimately need the real value
// (password comparison, OTP verification) opt back in per-query with
// `omit: { password_hash: false }` / `omit: { reset_otp: false, ... }`.
export const prisma = new PrismaClient({
  adapter,
  omit: {
    user: {
      password_hash: true,
      reset_otp: true,
      reset_otp_expires: true,
    },
  },
});
