import { describe, it, expect } from "vitest";
import { assertFitsScale } from "../domain/money.js";
import { Prisma } from "../generated/prisma/client.js";

describe("money rules: ", () => {
  it("12.505 vào ví EUR → AMOUNT_SCALE_EXCEEDED", () => {
    expect(() => {
      assertFitsScale(new Prisma.Decimal("12.505"), "EUR");
    }).toThrow(expect.objectContaining({ code: "AMOUNT_SCALE_EXCEEDED" }));
  });
});
