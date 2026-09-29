import { describe, expect, it } from "vitest";
import {
  assertActivityAccountRule,
  isBackdated,
} from "../domain/ledger-rules.js";

describe("Assert activity account rule", () => {
  it("Opening ví CASH được phép không có accountId", () => {
    expect(() => {
      assertActivityAccountRule({
        type: "OPENING_BALANCE",
        accountId: null,
        walletKinds: ["CASH"],
      });
    }).not.toThrow();
  });

  it("Opening ví STEAM_WALLET phải có accountId, DB CHECK không bắt được", () => {
    expect(() => {
      assertActivityAccountRule({
        type: "OPENING_BALANCE",
        accountId: 1,
        walletKinds: ["STEAM_BALANCE"],
      });
    }).not.toThrow();
  });

  it("TOP_UP phải có accountId", () => {
    expect(() => {
      assertActivityAccountRule({
        type: "TOP_UP",
        accountId: 1,
        walletKinds: ["CASH", "STEAM_BALANCE"],
      });
    }).not.toThrow();
  });

  it("WALLET_TRANSFER phải có accountId", () => {
    expect(() => {
      assertActivityAccountRule({
        type: "WALLET_TRANSFER",
        accountId: 1,
        walletKinds: ["STEAM_BALANCE", "STEAM_BALANCE"],
      });
    }).not.toThrow();
  });

  it("PURCHASE trả bằng ví CASH nhưng có accountId → hợp lệ", () => {
    expect(() =>
      assertActivityAccountRule({
        type: "PURCHASE",
        accountId: 3,
        walletKinds: ["CASH"],
      }),
    ).not.toThrow();
  });

  it("TOP_UP mà accountId null → throw", () => {
    expect(() =>
      assertActivityAccountRule({
        type: "TOP_UP",
        accountId: null,
        walletKinds: ["CASH", "STEAM_BALANCE"],
      }),
    ).toThrow(expect.objectContaining({ code: "ACTIVITY_ACCOUNT_RULE" }));
  });

  it("OPENING_BALANCE accountId null trên ví Steam → throw (DB CHECK không bắt được)", () => {
    expect(() =>
      assertActivityAccountRule({
        type: "OPENING_BALANCE",
        accountId: null,
        walletKinds: ["STEAM_BALANCE"],
      }),
    ).toThrow(expect.objectContaining({ code: "ACTIVITY_ACCOUNT_RULE" }));
  });

  it("OPENING_BALANCE accountId null trộn CASH với Steam → throw", () => {
    expect(() =>
      assertActivityAccountRule({
        type: "OPENING_BALANCE",
        accountId: null,
        walletKinds: ["CASH", "STEAM_BALANCE"],
      }),
    ).toThrow(expect.objectContaining({ code: "ACTIVITY_ACCOUNT_RULE" }));
  });
});

describe("isBackdated", () => {
  const latest = new Date("2026-09-10");

  it("ví chưa có giao dịch nào → không phải backdate", () => {
    expect(isBackdated(new Date("2026-09-01"), null)).toBe(false);
  });

  it("nối cuối sổ → không phải backdate", () => {
    expect(isBackdated(new Date("2026-09-20"), latest)).toBe(false);
  });

  it("chèn giữa lịch sử → là backdate", () => {
    expect(isBackdated(new Date("2026-09-05"), latest)).toBe(true);
  });

  it("bằng đúng giao dịch mới nhất → không phải backdate", () => {
    expect(isBackdated(new Date("2026-09-10"), latest)).toBe(false);
  });
});
