# SKINSLEDGER — BACKEND CONTEXT

_Code backend tổ chức ra sao, luật nào nằm ở hàm nào._

_Luật NGHIỆP VỤ xem `SCHEMA_DESIGN.md` · Bẫy công cụ xem `NOTES.md` · Tiến độ xem `PROGRESS.md`._

> **Nguồn sự thật:** file này nói luật **NẰM Ở ĐÂU**, `SCHEMA_DESIGN.md` nói luật
> **LÀ GÌ**. Đừng chép nội dung luật sang đây — chép là đẻ nguồn sự thật thứ hai.

---

## Cấu trúc `src/`

| Thư mục     | Chứa gì                                                                 | Được phép làm gì                                     |
| ----------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| `db/`       | `client.ts` (singleton), `tx.ts` (`withTx`, type `Tx`), `seed.ts`       | Hạ tầng. Không chứa luật nghiệp vụ                   |
| `domain/`   | `errors.ts`, `money.ts`, `ledger-rules.ts`                              | **Hàm thuần.** Không đụng DB, không gọi `new Date()` |
| `services/` | `ledger.ts`, `opening-balance.ts`, …                                    | Nhận `tx`, đọc/ghi DB, cài luật nghiệp vụ            |
| `queries/`  | `balances.ts`                                                           | Chỉ đọc                                              |
| `scripts/`  | `seed-cli.ts`                                                           | Entry point chạy tay. Không chứa logic               |
| `tests/`    | `helpers/` (`fixtures.ts`, `assertions.ts`, `reset-db.ts`), `*.test.ts` | Ngoài `helpers/` chỉ chứa `*.test.ts`                |

**Vì sao `domain/` cấm `new Date()`:** hàm thuần phải cho ra cùng kết quả mọi lần chạy.
Cần "bây giờ" thì nhận qua tham số.

---

## Quy ước tầng

1. **Service nhận `tx: Tx` làm tham số đầu, KHÔNG tự gọi `withTx`.**
   Caller mở transaction, bọc cả `lockWallet` lẫn service. Service tự mở →
   ghép 2 service thành 2 transaction rời (nguyên tắc #6 vỡ); `withTx` lồng
   còn shadow mất `tx` → ghi ở transaction khác chỗ đã lấy khoá.
   Query đọc cũng nhận `tx` — đọc ngoài transaction thì không thấy thay đổi
   chưa commit của chính luồng đang chạy.

2. **Literal vào bằng `string`, đi tiếp bằng `Decimal`.**
   Hàm nhận literal từ người gõ (fixture, seed, CLI, input người dùng) khai tham số
   `string` rồi tự `new Prisma.Decimal(...)` bên trong. Hàm nhận giá trị ĐÃ là Decimal
   khai `Prisma.Decimal`.
   Khai `Decimal` ở chỗ nhận literal là mở đường cho `new Prisma.Decimal(50)` —
   typecheck xanh, giá trị đã hỏng từ trước khi Decimal nhận được. `string` không có
   đường viết sai: gõ `50` là TS đỏ ngay.

3. **`domain/` không được import từ `services/`.** Một chiều, để hàm thuần
   test được mà không cần DB.

4. **Test tự dựng fixture, không dùng `seed()`.** Seed là dữ liệu dev, id sẽ đổi.

5. **Thứ tự bắt buộc trong mọi luồng tiền: khoá → đọc → kiểm → ghi.**
   Đọc trước khi khoá = quyết định dựa trên số cũ (Lab 3b).

6. **Mã lỗi mới vào đúng nhóm trong `DOMAIN_ERROR_CODES`**, không append cuối mảng.
   Nhóm theo khái niệm bị vi phạm: Wallet · Amount & currency · Balance · Opening balance · Activity/ledger.

---

## Bản đồ luật → nơi cài

| Luật                                         | Nơi cài                              | Mã lỗi                       |
| -------------------------------------------- | ------------------------------------ | ---------------------------- |
| #1 mọi `wallet_transaction` có `activity_id` | DB FK + cấu trúc `recordActivity`    | —                            |
| #5 ví Steam không âm                         | `assertCanApply()`                   | `INSUFFICIENT_STEAM_BALANCE` |
| #5 backdate → warning                        | `assertCanApply()` + `isBackdated()` | `BACKDATED_NEGATIVE_BALANCE` |
| #11 vế 1                                     | DB `chk_activity_account`            | —                            |
| #11 vế 2                                     | `assertActivityAccountRule()`        | `ACTIVITY_ACCOUNT_RULE`      |
| #12 một opening mỗi ví                       | `recordOpeningBalance()`             | `OPENING_BALANCE_EXISTS`     |
| #13 opening sớm nhất sổ ví                   | `recordOpeningBalance()`             | `OPENING_BALANCE_NOT_FIRST`  |
| C7 scale                                     | `assertFitsScale()`                  | `AMOUNT_SCALE_EXCEEDED`      |
| C4 ví inactive                               | `assertCanApply()`                   | `WALLET_INACTIVE`            |
| amount ≠ 0                                   | `assertNonZero()`                    | `AMOUNT_ZERO`                |
| ví Steam: opening không âm                   | `recordOpeningBalance()`             | `OPENING_BALANCE_NEGATIVE`   |
| thứ tự khoá (Lab 4b)                         | `recordActivity()`                   | `LOCK_ORDER_VIOLATION`       |
| activity không có dòng tiền                  | `recordActivity()`                   | `EMPTY_ENTRIES`              |

> #11 vế 2, #12, #13 không làm bằng UNIQUE được: mỗi luật cần cột từ hai bảng khác nhau, mà index không trải qua hai bảng.

---

## Hợp đồng `recordActivity`

Cổng duy nhất tạo `activity` + `wallet_transactions`. Caller phải:

- `lockWallet()` TRƯỚC, `entries` sắp theo `wallet.id` TĂNG DẦN. Hàm cố tình không tự sắp — tự sắp che mất việc caller khoá sai thứ tự, mà lỗi thật nằm ở chỗ **khoá**, không phải chỗ ghi.
- `entries` nhận `LockedWallet`, không nhận `walletId`: kiểu dữ liệu ép phải khoá trước. Quy ước biến thành thứ TS kiểm được.
- `occurredAt` truyền MỘT lần, dùng chung cho `activities` lẫn mọi `wallet_transactions`. Cột này lặp ở 2 bảng (phục vụ `idx_wt_wallet_time`).

Đã kiểm sẵn — **service con đừng lặp lại**: `AMOUNT_ZERO` · `AMOUNT_SCALE_EXCEEDED` · `ACTIVITY_ACCOUNT_RULE` · `WALLET_INACTIVE` · #5 · `EMPTY_ENTRIES` · `LOCK_ORDER_VIOLATION`.

Mọi phép kiểm chạy **trước** mọi câu ghi → một entry lỗi thì không ghi entry nào.

Chữ ký: `recordActivity(tx, { type, accountId, occurredAt, note?, counterparty?, entries })` — `entries` nằm TRONG object, không phải tham số thứ ba.

## Hợp đồng `recordOpeningBalance`

Chữ ký: `recordOpeningBalance(tx, { walletId, amount: string, occurredAt, note? })`
→ `{ activityId, warnings }` (cùng kiểu trả về của `recordActivity`).

- Không nhận `accountId`: suy từ `wallet.accountId`, ví CASH tự ra `null`.
  Nhận từ input là tạo hai nguồn sự thật cho cùng một thông tin.
- Thứ tự: `lockWallet` → parse `amount` → kiểm âm (hàm thuần) → #12 → #13 →
  `recordActivity`. Kiểm thuần chạy trước kiểm cần DB. #12 và #13 BẮT BUỘC
  đứng sau `lockWallet` (khoá → đọc → kiểm → ghi).
- Tự kiểm: `OPENING_BALANCE_NEGATIVE` · `OPENING_BALANCE_EXISTS` ·
  `OPENING_BALANCE_NOT_FIRST`. Zero, scale, inactive, #11, #5 do
  `recordActivity` kiểm — đừng lặp lại.

---

## Hai luật dễ nhầm: MAX vs MIN

|         | `isBackdated()` — `MAX` | #13 — `MIN`                |
| ------- | ----------------------- | -------------------------- |
| Thuộc   | #5, **mọi luồng**       | **Chỉ F1**                 |
| Hỏi     | Chèn vào giữa lịch sử?  | Opening có đứng đầu sổ ví? |
| Hậu quả | Đổi throw → warning     | Throw hẳn                  |

Độc lập nhau, cùng tồn tại. Opening ví Steam luôn dương nên **không bao giờ** chạm
nhánh warning của #5 — thiếu #13 thì không gì chặn opening nằm giữa sổ, và đường số dư
quá khứ (Bước 7, window function) vẽ sai.

---

## API hiện có

- `domain/errors.ts` — `DomainError` · `isDomainError` · type `DomainWarning` · `DOMAIN_ERROR_CODES` (chia nhóm theo khái niệm)
- `domain/money.ts` — `CURRENCY_SCALE` · `roundToScale` · `assertFitsScale`
- `domain/ledger-rules.ts` — `assertActivityAccountRule` · `isBackdated` · `assertNonZero`
- `db/tx.ts` — `withTx` · type `Tx` (branded)
- `services/ledger.ts` — `lockWallet` · `getWalletBalance` · `getLatestOccurredAt` · `assertCanApply` · `recordActivity` · type `LockedWallet`, `LedgerEntry`
- `services/opening-balance.ts` — `recordOpeningBalance`
- `tests/helpers/fixtures.ts` — `makeAccount` · `makeWallet` · `makeSteamWallet` · `seedBalance`
- `tests/helpers/assertions.ts` — `expectDomainError` · `expectBalance`
- `tests/helpers/reset-db.ts` — `resetDb`

> `seedBalance` đi vòng qua mọi luật (không khoá, không qua #12/#13): chỉ để dựng bối cảnh. Opening "thật" phải gọi `recordOpeningBalance`.