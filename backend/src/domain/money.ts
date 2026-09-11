// Vai trò: Hằng số + hàm thuần về tiền, không đụng DB — tránh mỗi service tự viết lại quy tắc làm tròn
import { Prisma } from "../generated/prisma/client.js";

type Decimal = Prisma.Decimal;
type SupportedCurrency = "VND" | "EUR" | "USD" | "RMB";

export const CURRENCY_SCALE: Record<SupportedCurrency, number> = {
  "VND": 0,
  "EUR": 2,
  "USD": 2,
  "RMB": 2,
};

export function roundToScale(amount: Decimal, currency: string): Decimal {
  let scale: number = CURRENCY_SCALE[currency as SupportedCurrency] ?? 2;
  return amount.toDecimalPlaces(scale);
}