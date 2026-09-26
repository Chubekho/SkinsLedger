// Vai trò: Hằng số + hàm thuần về tiền, không đụng DB — tránh mỗi service tự viết lại quy tắc làm tròn
import { Prisma } from "../generated/prisma/client.js";
import { DomainError } from "./errors.js";


export const CURRENCY_SCALE: Record<string, number> = {
  VND: 0,
  VND_STEAM: 2,
  EUR: 2,
  USD: 2,
  RMB: 2,
} as const;

/** Trả về độ dài của currency: currency nhập sai hoặc ko tồn tại thì throw */
function getScale(currency: string): number {
  const scale = CURRENCY_SCALE[currency];
  if (scale === undefined) {
    throw new DomainError("CURRENCY_UNKNOWN", `Unknown currency: ${currency}`, {
      currency,
    });
  }
  return scale;
}

/* Làm tròn — CHỈ dùng cho phân bổ (chia lô, dư dồn item cuối). Không dùng cho input người dùng. */
export function roundToScale(
  amount: Prisma.Decimal,
  currency: string,
): Prisma.Decimal {
  return amount.toDecimalPlaces(getScale(currency));
}

/* Input người dùng: vượt scale thì throw, KHÔNG làm tròn. */
export function assertFitsScale(
  amount: Prisma.Decimal,
  currency: string,
): void {
  const expectedScale = getScale(currency);
  const actualScale = amount.decimalPlaces();

  if (actualScale > expectedScale) {
    throw new DomainError(
      "AMOUNT_SCALE_EXCEEDED",
      `${amount.toString()} has ${actualScale} decimal places, but ${currency} allows ${expectedScale}`,
      { currency, expectedScale, actualScale, amount: amount.toString() },
    );
  }
}
