// Vai trò: Tạo đúng 1 PrismaClient cho toàn app (singleton) — mọi nơi import chung 1 kết nối, không tự new PrismaClient() rải rác

import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

export const prisma = new PrismaClient({
  datasourceUrl: env.DATABASE_URL,
  log:
    env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["warn", "error"],
});
