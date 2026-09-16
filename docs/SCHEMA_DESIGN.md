# SKINSLEDGER — THIẾT KẾ DATABASE

**Version 3.2** — _cập nhật 08/09/2026 (chốt gốc 05/08/2026)_

---

## NGUYÊN TẮC NỀN TẢNG

1. **_Tiền_** _(wallets)_ — **_Đồ_** _(items)_ — **_Nhật ký_** _(activities)_: tách bạch, không lẫn lộn.
2. `activities` là **sổ cái bất biến**. Ghi rồi không sửa.
3. **Tiền thật và tiền Steam là hai sổ riêng.** Không quy đổi ngầm, không trộn lãi.
4. Mọi con số lịch sử **đóng băng vĩnh viễn**. Tỷ giá thị trường chỉ để _hiển thị_.
5. **Lưu sự kiện, suy ra trạng thái** — không lưu cờ mà cron job phải đi lật.
6. Mỗi luồng nghiệp vụ chạy trong **1 DB transaction duy nhất**.
7. **Steam API là nguồn ĐỐI SOÁT, không phải nguồn dữ liệu tài chính.** Vốn/tiền luôn nhập tay.

### Mô hình 2 sổ

|          | Sổ thật                                                   | Sổ Steam                                        |
| -------- | --------------------------------------------------------- | ----------------------------------------------- |
| Ví       | `CASH`                                                    | `STEAM_BALANCE`                                 |
| Đơn vị   | VND                                                       | EUR / VND_STEAM                                 |
| Số lẻ    | `VND` → **scale 0**                                       | `EUR` → **scale 2** · `VND_STEAM` → **scale 2** |
| Bản chất | _tiền tiêu được ngoài đời_                                | **_tiền ảo, không rút ra được_**                |
| Cầu nối  | `TOP_UP` _(thật → ảo)_ · `SALE` ra tiền mặt _(ảo → thật)_ |                                                 |

> - ⚠️ **`VND` và `VND_STEAM` là hai currency code KHÁC NHAU**, dù cùng là đồng Việt Nam.
> - Steam VN hiển thị 2 số lẻ (`11.568,61₫`) còn tiền mặt làm tròn về đồng.
> - Tách code riêng để một câu `GROUP BY currency` cẩu thả **không thể** cộng nhầm tiền thật với tiền ảo. Xem `CURRENCY_SCALE` trong `domain/money.ts`.

**Ví `CASH` = vị thế tiền thật ròng.** Cho phép âm.

| Số dư     | Nghĩa                                    |
| --------- | ---------------------------------------- |
| **Âm**    | _Đang đầu tư — đã bỏ ra, chưa thu về đủ_ |
| **0**     | _Hoà vốn_                                |
| **Dương** | _Phần dương là tiền thật đã lời_         |

## QUY ƯỚC TRIỂN KHAI — áp cho toàn bộ 8 bảng dưới đây

| Loại dữ liệu  | Kiểu Prisma                                                                  | Ghi chú                                                                                                                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Khoá chính    | `Int @id @default(autoincrement())`                                          | KHÔNG dùng `BigInt` — tránh lỗi `JSON.stringify` ở Bước 7                                                                                                                                                                                               |
| Tiền + tỷ giá | `Decimal @db.Decimal(20, 8)`                                                 | 12 số nguyên + 8 số lẻ. Một luật duy nhất cho mọi cột tiền                                                                                                                                                                                              |
| Thời gian     | `DateTime @db.Timestamptz(3)`                                                | Prisma mặc định KHÔNG có timezone — phải khai rõ, tránh lệch giờ Mac (+7) vs server (UTC)                                                                                                                                                               |
| JSON          | `Json @db.JsonB`                                                             | `metadata`, `counterparty` — jsonb query/index được, json thường thì không                                                                                                                                                                              |
| Tên bảng/cột  | Model `PascalCase`, field `camelCase`, map `@map`/`@@map` xuống `snake_case` | SQL recipes trong file này copy-paste chạy thẳng, không cần dịch tên                                                                                                                                                                                    |
| Chuỗi         | `String` (không khai `@db.VarChar`)                                          | `VARCHAR` trong file này = quy ước đọc. Prisma map ra `text` — Postgres lưu y hệt `varchar`. Giới hạn độ dài validate bằng Zod ở service                                                                                                                |
| DB `DEFAULT`  | Chỉ `created_at`                                                             | `occurred_at` / `acquired_at` / `tradable_after` / `fetched_at` **KHÔNG** có default — là dữ kiện nghiệp vụ service phải chủ động truyền. `occurred_at` còn backdate được; default sẽ im lặng ghi hôm nay khi quên truyền → sổ cái sai mà không ai biết |

### Quy ước `ON DELETE` — áp cho toàn bộ FK

| FK                                | Hành vi    | Lý do                                                                                                                                               |
| --------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mọi FK → `accounts`               | `RESTRICT` | Sổ cái bất biến — không xoá acc khi còn item/activity trỏ tới                                                                                       |
| Mọi FK → `wallets`                | `RESTRICT` | Xoá ví là mất lịch sử tiền                                                                                                                          |
| Mọi FK → `activities`             | `RESTRICT` | Xoá activity là mất biên lai của item/tiền                                                                                                          |
| `inventory_items.storage_unit_id` | `RESTRICT` | _(→ chính bảng)_ Storage unit trong CS2 không tiêu thụ được. FK chỉ chặn `DELETE`; chặn `UPDATE status` phải làm ở service — xem nợ kỹ thuật Bước 5 |
| `item_movements.item_id`          | `CASCADE`  | Movement vô nghĩa nếu item không tồn tại. Chỉ chạy khi xoá item **nhập nhầm**                                                                       |

> **`ON DELETE` chỉ kích hoạt khi có câu `DELETE` thật.** Item "chết" nghiệp vụ
> (`SOLD` / `CONSUMED` / `WRITTEN_OFF`) là `UPDATE status` — row **vẫn nằm nguyên
> trong DB vĩnh viễn**, FK không đụng tới. Theo nguyên tắc #2, `DELETE` gần như
> chỉ dùng cho trường hợp nhập sai cần nhập lại.

---

## 1. `accounts` — Tài khoản Steam

| Cột               | Kiểu                  | Ghi chú                                 |
| ----------------- | --------------------- | --------------------------------------- |
| **id**            | Int (autoincrement)   | PK                                      |
| **account_name**  | VARCHAR, UNIQUE       | _`Main Acc`, `Smurf 1`_                 |
| **steam_id64**    | VARCHAR, UNIQUE, NULL | _Dùng gọi Steam API đối soát inventory_ |
| **registered_at** | DATETIME              | _Ngày tạo nick Steam thực tế_           |
| **created_at**    | DATETIME              | DEFAULT CURRENT_TIMESTAMP               |

---

## 2. `wallets` — Ví tiền

| Cột            | Kiểu                    | Ghi chú                                            |
| -------------- | ----------------------- | -------------------------------------------------- |
| **id**         | Int (autoincrement)     | PK                                                 |
| **account_id** | FK → accounts, **NULL** | _NULL = ví `CASH` ngoài đời_                       |
| **name**       | VARCHAR                 | `Steam Main (EUR)`, `Tiền mặt VND`                 |
| **kind**       | ENUM                    | `STEAM_BALANCE` \| `CASH`                          |
| **currency**   | VARCHAR                 | **_Mỗi ví CHỈ 1 loại tiền._** Muốn đổi → mở ví mới |
| **is_active**  | BOOLEAN                 | DEFAULT `true`                                     |
| **created_at** | DATETIME                | DEFAULT CURRENT_TIMESTAMP                          |

---

## 3. `wallet_transactions` — Sổ quỹ Thu/Chi

**_Nguồn sự thật duy nhất về tiền._**

| Cột             | Kiểu                          | Ghi chú                                                                                                  |
| --------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| **id**          | Int (autoincrement)           | PK                                                                                                       |
| **wallet_id**   | FK → wallets, **NOT NULL**    |                                                                                                          |
| **activity_id** | FK → activities, **NOT NULL** | _Mọi biến động tiền đều phải có biên lai_                                                                |
| **amount**      | DECIMAL                       | _Âm = chi, Dương = thu._ Đơn vị theo `wallets.currency`<br>Với `SALE`: **đã trừ phí**, là tiền thực nhận |
| **occurred_at** | DATETIME                      | _Ngày xảy ra thực tế._ **Backdate được**                                                                 |
| **created_at**  | DATETIME                      | _Ngày nhập liệu._ **Không bao giờ sửa**                                                                  |

> **Không lưu tỷ giá nạp.** `TOP_UP` luôn ghi **2 dòng cùng `activity_id`** → tỷ giá suy ra được:
>
> ```
> ví CASH  -2.100.000 VND  ┐ activity #1
> ví STEAM   +100.00 EUR   ┘  → giá nạp = 2.100.000 / 100 = 21.000
> ```
>
> Lưu thêm cột là tạo nguồn sự thật thứ hai, có ngày sẽ lệch.

---

## 4. `activities` — Nhật ký Giao dịch

| Cột              | Kiểu                | Ghi chú                                                                                                                        |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **id**           | Int (autoincrement) | PK                                                                                                                             |
| **type**         | ENUM                | _xem bảng dưới_                                                                                                                |
| **account_id**   | FK → accounts, NULL | - _Acc bỏ tiền/bỏ đồ ra._ **Không bao giờ đổi** <br> - _Luật:_ NULL chỉ khi type = OPENING_BALANCE và ví liên quan kind = CASH |
| **counterparty** | **JSON**, NULL      | `{"name":"Tuấn","fb":"...","steam_id64":"765..."}`                                                                             |
| **note**         | VARCHAR, NULL       |                                                                                                                                |
| **occurred_at**  | DATETIME            | _Ngày xảy ra thực tế._ **Backdate được**                                                                                       |
| **created_at**   | DATETIME            | _Ngày nhập liệu._ **Không sửa**                                                                                                |

| Nhóm             | `type`                         |
| ---------------- | ------------------------------ |
| _Tiền vào_       | `OPENING_BALANCE`, `TOP_UP`    |
| _Tiền ra_        | `PURCHASE`, `CONTAINER_CLAIM`  |
| _Chuyển ví_      | `WALLET_TRANSFER`              |
| _Không đổi tiền_ | `DROP`, `TRADE_UP`, `UNBOXING` |
| _Đồ → tiền_      | `SALE`                         |
| _Đồ mất trắng_   | `GIFT_OUT`, `LOST`             |

---

## 5. `inventory_items` — Kho tài sản

**_1 row = 1 item vật lý._** _Mua 50 hòm → 50 row (bulk insert)._

### Định danh

| Cột                  | Kiểu                          | Ghi chú                                                                                                          |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **id**               | Int (autoincrement)           | PK                                                                                                               |
| **name**             | VARCHAR                       | _Tên hiển thị:_ `AK-47 \| Redline`                                                                               |
| **market_hash_name** | VARCHAR                       | **_Khoá JOIN sang `item_prices` + gọi API_**<br>`AK-47 \| Redline (Field-Tested)`                                |
| **asset_id**         | VARCHAR, NULL                 | _Khoá đối soát với Steam API_<br>⚠️ **ĐỔI mỗi khi item di chuyển** — là khoá tạm, không phải định danh vĩnh viễn |
| **metadata**         | JSONB, NOT NULL, DEFAULT `{}` | _float, collection, pattern, classified, stickers_                                                               |

### Vị trí & Vòng đời

| Cột                      | Kiểu                       | Ghi chú                                                                 |
| ------------------------ | -------------------------- | ----------------------------------------------------------------------- |
| **account_id**           | FK → accounts              | **_Vị trí hiện tại._** _Cache của movement mới nhất_                    |
| **storage_unit_id**      | FK → inventory_items, NULL | _NULL = inventory thường · có giá trị = đang cất trong storage unit đó_ |
| **acquired_activity_id** | FK, **NOT NULL**           | **_Giấy khai sinh._** Transfer **không** đụng vào                       |
| **consumed_activity_id** | FK, NULL                   | **_Giấy chứng tử._** NULL = còn sống                                    |

### Giá vốn — _theo đơn vị tiền gốc, đóng băng vĩnh viễn_

| Cột                | Kiểu          | Ghi chú                                                                                                                                           |
| ------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **acquired_price** | DECIMAL, NULL | _Giá niêm yết đã trả._ `DROP` → 0 · `TRADE_UP` → **NULL**                                                                                         |
| **cost_currency**  | VARCHAR, NULL | **_Luôn = currency của ví đã trả tiền._** `DROP` → NULL                                                                                           |
| **cost_basis**     | DECIMAL       | **_Vốn thực tế theo `cost_currency`_**<br>Mua → = `acquired_price` · `DROP` → 0<br>`TRADE_UP` → tổng vốn nguyên liệu · `UNBOXING` → vốn hòm + key |

> `cost_currency` cho biết item thuộc sổ nào — không cần cột đánh dấu riêng.

### Giá bán — _chỉ có khi `status = SOLD`_

| Cột                   | Kiểu          | Ghi chú                                              |
| --------------------- | ------------- | ---------------------------------------------------- |
| **sale_price**        | DECIMAL, NULL | **_Tiền thực nhận (NET)._** Đơn vị = `sale_currency` |
| **sale_currency**     | VARCHAR, NULL | _Phải trùng currency của ví nhận tiền_               |
| **sale_ref_price**    | DECIMAL, NULL | _Giá tham chiếu, VD `100` RMB trên BUFF_             |
| **sale_ref_currency** | VARCHAR, NULL | _VD `RMB`_                                           |
| **sale_rate**         | DECIMAL, NULL | _Tỷ giá thoả thuận với người mua, VD `3.700`_        |

**Công thức lãi:**

```
cost_currency = sale_currency  →  profit = sale_price - cost_basis
cost_currency ≠ sale_currency  →  KHÔNG tính profit
                                  Hiển thị cả 2: "vốn 12.50 EUR → bán 370.000 VND"
```

> **_Không bịa ra con số lãi chung cho giao dịch xuyên sổ._** Mọi tỷ giá quy đổi đều là lựa chọn tuỳ tiện — thà hiện 2 con số thật còn hơn 1 con số ảo.

### Trạng thái

| Cột                | Kiểu           | Ghi chú                                            |
| ------------------ | -------------- | -------------------------------------------------- |
| **status**         | ENUM           | `HOLDING` \| `SOLD` \| `CONSUMED` \| `WRITTEN_OFF` |
| **acquired_at**    | DATETIME       | _Ngày item vào kho_                                |
| **tradable_after** | DATETIME, NULL | _Hết trade-hold lúc nào._ NULL = tự do             |
| **updated_at**     | DATETIME       |                                                    |

| Status        | Nghĩa                                                               |
| ------------- | ------------------------------------------------------------------- |
| `HOLDING`     | _Đang giữ — kể cả đang trade-hold, rao bán, cất trong storage unit_ |
| `SOLD`        | _Đã bán, có tiền về_                                                |
| `CONSUMED`    | _Đã tiêu thụ: trade-up, mở hòm, dùng làm key_                       |
| `WRITTEN_OFF` | _Mất trắng: tặng, bị scam, từ chối offer X-Ray_                     |

**Trade-hold là trục độc lập, KHÔNG phải status.** Tính ở tầng đọc:

> **Trade-hold = 7 ngày.** Hằng số `TRADE_HOLD_DAYS` ở `domain/trade-hold.ts`
> (không nhét vào `money.ts` — đây là luật CS2, không phải luật tiền).
> Dùng ở F4/F5/F6/F9/F10. Hàm luôn trả `Date` **mới**, không `setDate()` tại chỗ
> trên object gốc.
> ⚠️ **Chưa chốt:** tính từ `occurred_at` hay lúc nhập liệu — xem nợ kỹ thuật.

```sql
CASE WHEN tradable_after IS NULL OR tradable_after <= NOW()
     THEN true ELSE false END AS is_tradable
```

_Không cần cron job, không bao giờ lệch._

> ### Luật bắt buộc — chống lệch dữ liệu
>
> `wallet_transactions` là **_nguồn sự thật duy nhất về tiền_**. Nhóm `sale_*` chỉ là **_bản phân bổ_** để tính lãi từng món.
>
> - `SALE`: **tổng `sale_price` các item bị bán = `amount` vào ví**
> - `PURCHASE`: **tổng `cost_basis` các item tạo ra = `|amount|` ra khỏi ví**
>
> **_Luật làm tròn:_** chia đều, **phần dư dồn hết vào item cuối cùng**.

---

## 6. `item_movements` — Sổ Vận chuyển nội bộ

_Đường đi của item giữa các acc của t._ **_Không liên quan tài chính._**

| Cột                 | Kiểu                 | Ghi chú                               |
| ------------------- | -------------------- | ------------------------------------- |
| **id**              | Int (autoincrement)  | PK                                    |
| **item_id**         | FK → inventory_items |                                       |
| **from_account_id** | FK, **NOT NULL**     |                                       |
| **to_account_id**   | FK, **NOT NULL**     |                                       |
| **hold_ends_at**    | DATETIME, NULL       | _Trade-hold của riêng lần chuyển này_ |
| **note**            | VARCHAR, NULL        |                                       |
| **created_at**      | DATETIME             |                                       |

> **_CHỈ log chuyển giữa 2 acc._** Item sinh ra (drop/mở hòm/trade-up) **không** ghi movement — `acquired_activity_id` + `account_id` đã trả lời rồi.
>
> Cất vào/lấy ra storage unit **cũng không** ghi movement — không đổi acc.

---

## 7. `exchange_rates` — Tỷ giá thị trường

**_Chỉ để hiển thị tham chiếu._** _Không bao giờ tham gia tính lãi._

| Cột                | Kiểu                | Ghi chú                                    |
| ------------------ | ------------------- | ------------------------------------------ |
| **id**             | Int (autoincrement) | PK                                         |
| **base_currency**  | VARCHAR             | _Đổi TỪ._ VD `EUR`                         |
| **quote_currency** | VARCHAR             | _Đổi SANG._ VD `VND`                       |
| **rate**           | DECIMAL             | **1 base = `rate` quote**                  |
| **source**         | ENUM                | RateSource(`MANUAL` \| `EXCHANGERATE_API`) |
| **fetched_at**     | DATETIME            | _Giữ nhiều dòng, query dòng mới nhất_      |

---

## 8. `item_prices` — Giá thị trường

> _Khoá theo **`market_hash_name`** — 50 hòm giống nhau chỉ tốn 1 row giá._

| Cột                  | Kiểu                | Ghi chú                                                                   |
| -------------------- | ------------------- | ------------------------------------------------------------------------- |
| **id**               | Int (autoincrement) | PK                                                                        |
| **market_hash_name** | VARCHAR             | _Khoá JOIN sang `inventory_items`_                                        |
| **source**           | ENUM                | PriceSource(`STEAM` \| `BUFF163` \| `CSFLOAT` \| `CSMONEY` \| `SKINPORT`) |
| **price**            | DECIMAL             |                                                                           |
| **currency**         | VARCHAR             | _Tiền tệ của nguồn_                                                       |
| **fetched_at**       | DATETIME            | _Giữ nhiều dòng để vẽ lịch sử giá_                                        |

_Giá base — không tính overprice do float/pattern. Tổng giá trị kho là **cận dưới**._

---

## Unique constraints

> _5 constraint đầu khai bằng `@unique`/`@@unique` trong `schema.prisma`. 2 câu SQL dưới đây Prisma **KHÔNG sinh được** → phải viết tay vào file migration sau khi `migrate dev` chạy xong._

| Bảng             | Cột                                                   | Lý do                                                                                                                     |
| ---------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `accounts`       | `account_name`                                        | Nhãn duy nhất để phân biệt acc **bằng mắt**. Trùng tên → dropdown và `GROUP BY` mất nghĩa                                 |
| `accounts`       | `steam_id64`                                          | 2 row cùng id64 = 1 tài khoản Steam nhập 2 lần. _(Postgres cho nhiều `NULL` trong cột unique → acc chưa điền vẫn OK)_     |
| `wallets`        | `(account_id, kind, currency)`                        | Mỗi acc chỉ 1 ví/1 loại tiền. F3 đổi vùng về lại currency cũ → **reactivate ví cũ** (`is_active = true`), không đẻ ví mới |
| `item_prices`    | `(market_hash_name, source, fetched_at)`              | Chống cron chạy trùng ghi 2 dòng giá y hệt                                                                                |
| `exchange_rates` | `(base_currency, quote_currency, source, fetched_at)` | Chống cron ghi trùng 2 dòng tỷ giá y hệt                                                                                  |

```sql
-- ⚠️ Postgres coi NULL là KHÁC NHAU trong unique index → constraint
-- (account_id, kind, currency) KHÔNG chặn được ví CASH trùng.
-- Phải thêm partial unique index viết tay:
CREATE UNIQUE INDEX uq_wallet_cash ON wallets (kind, currency)
  WHERE account_id IS NULL;

-- CHECK cho invariant #11, vế DB (Prisma không sinh CHECK — viết tay vào migration)
ALTER TABLE activities ADD CONSTRAINT chk_activity_account
  CHECK (account_id IS NOT NULL OR type = 'OPENING_BALANCE');
```

---

## Index

> _Khai bằng `@@index` trong `schema.prisma` — Prisma tự sinh SQL. **Không gõ tay vào migration.** SQL dưới đây chỉ để đọc cho dễ hình dung._

### Nhóm A — cột FK

_Postgres **không** tự tạo index cho FK (khác MySQL). Có FK ⇒ sẽ JOIN ⇒ cần index._

```sql
CREATE INDEX idx_wt_activity     ON wallet_transactions(activity_id);
CREATE INDEX idx_items_account   ON inventory_items(account_id);
CREATE INDEX idx_items_storage   ON inventory_items(storage_unit_id);
CREATE INDEX idx_items_acquired  ON inventory_items(acquired_activity_id);
CREATE INDEX idx_items_consumed  ON inventory_items(consumed_activity_id);
CREATE INDEX idx_act_account     ON activities(account_id);
```

| Index                | Phục vụ                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `idx_wt_activity`    | Lấy các dòng tiền của 1 activity — `voidActivity()`, kiểm invariant #2/#3/#4   |
| `idx_items_account`  | _"Acc này đang giữ những gì"_                                                  |
| `idx_items_storage`  | Recipe _đồ đang cất trong 1 storage unit_ — `WHERE storage_unit_id = :unit_id` |
| `idx_items_acquired` | Thống kê trade-up, vế **thành phẩm** — `WHERE acquired_activity_id = :id`      |
| `idx_items_consumed` | Thống kê trade-up, vế **nguyên liệu** — `WHERE consumed_activity_id = :id`     |
| `idx_act_account`    | _"Acc nào drop/mua nhiều nhất"_ — F5, báo cáo Bước 7                           |

### Nhóm B — không phải FK, phục vụ query cụ thể

```sql
CREATE INDEX idx_items_hash      ON inventory_items(market_hash_name);
CREATE INDEX idx_items_status    ON inventory_items(status);
CREATE INDEX idx_items_asset     ON inventory_items(asset_id);
```

| Index              | Phục vụ                                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idx_items_hash`   | Khoá JOIN sang `item_prices` (recipe _tổng giá trị kho_). Không khai FK vì `item_prices` cho phép trùng tên                                                                                                            |
| `idx_items_status` | `WHERE status = 'HOLDING'` — có mặt ở 4/6 recipe kho đồ.<br>⚠️ **Đáng ngờ nhất:** `status` chỉ 4 giá trị, nếu phần lớn kho là `HOLDING` thì Postgres sẽ bỏ qua index này. Chạy `EXPLAIN` ở Bước 7 rồi quyết giữ hay bỏ |
| `idx_items_asset`  | F13 đối soát Steam API: tra ngược assetid từ API về DB. **Chỉ dùng từ Bước 9**                                                                                                                                         |

### Nhóm C — nhiều cột: lọc theo id, sắp theo thời gian

_Cột lọc đứng trước, cột `ORDER BY` đứng sau — index chỉ dùng được từ trái sang, liên tục._

```sql
CREATE INDEX idx_wt_wallet_time  ON wallet_transactions(wallet_id, occurred_at);
CREATE INDEX idx_mov_item        ON item_movements(item_id, created_at);
```

| Index                | Phục vụ                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `idx_wt_wallet_time` | Sổ kê 1 ví theo thời gian (Bước 8) — lọc `wallet_id`, sắp `occurred_at`                      |
| `idx_mov_item`       | Invariant #8 (`items.account_id` khớp movement mới nhất) — lấy movement cuối cùng của 1 item |

---

> **Chưa có index cho `item_prices` / `exchange_rates`** — unique constraint ở mục trên đã tự đẻ index đủ dùng.
>
> **Chưa có index cho `item_movements.from_account_id` / `to_account_id`** — query _"acc này đã gửi/nhận gì"_ sẽ quét cả bảng. Vài trăm movement thì không đáng kể.
>
> Cả hai đợi Bước 7: có dữ liệu thật → chạy `EXPLAIN` → thêm đúng chỗ cần. Thêm index sau chỉ tốn 1 migration, không mất data.

---

# LOGIC NGHIỆP VỤ

_Mọi luồng chạy trong **1 transaction duy nhất**._

## F1. Khởi tạo vốn (`OPENING_BALANCE`)

```
activities            type = OPENING_BALANCE
                      occurred_at = LÙI VỀ TRƯỚC ngày mua item cũ nhất
wallet_transactions   amount = +số dư đang có
```

> Backdate `occurred_at`, **KHÔNG** backdate `created_at`.

---

## F2. Nạp tiền vào Steam (`TOP_UP`)

**_Luôn 2 dòng._**

```
activities            type = TOP_UP
wallet_transactions   ví CASH   -2.100.000 VND
wallet_transactions   ví STEAM    +100.00 EUR
```

---

## F3. Chuyển ví / Đổi vùng Steam (`WALLET_TRANSFER`)

```
activities            type = WALLET_TRANSFER
wallet_transactions   ví EUR (cũ)   -50.00
wallet_transactions   ví VND (mới)  +1.400.000
wallets               ví EUR → is_active = false   (KHÔNG xoá)
                      ví VND → nếu ĐÃ TỪNG có ví (account_id, STEAM_BALANCE, VND_STEAM): UPDATE is_active = true ← reactivate, KHÔNG insert
                      ví VND → nếu chưa có: INSERT mới, cùng account_id
```

---

## F4. Mua Item (`PURCHASE`)

**Mua trên Steam bằng balance:**

```
activities            type = PURCHASE, counterparty = {"name":"Steam Market"}
wallet_transactions   ví STEAM  -12.50 EUR
inventory_items       acquired_price = 12.50, cost_currency = 'EUR', cost_basis = 12.50
                      status = HOLDING, tradable_after = NOW() + 7 ngày
```

**Mua từ người bán FB bằng tiền mặt:**

```
activities            type = PURCHASE, counterparty = {"name":"Hùng","fb":"..."}
wallet_transactions   ví CASH   -500.000 VND
inventory_items       acquired_price = 500.000, cost_currency = 'VND', cost_basis = 500.000
```

> `cost_currency` **luôn theo ví đã trả**, không theo currency của account.

**Mua lô 50 hòm** — \*1 activity, 1 dòng ví, **50 rows item\***:

```
wallet_transactions   -30.00 EUR                    (1 dòng)
inventory_items       bulk INSERT 50 rows, cost_basis = 0.60 mỗi row
                      ✓ 50 × 0.60 = 30.00
```

_Làm tròn lẻ → **dư dồn item cuối**._

---

## F5. Nhận đồ Free (`DROP`)

```
activities            type = DROP, account_id = ACC CÀY
inventory_items       acquired_price = 0, cost_basis = 0, cost_currency = NULL
                      account_id = ACC CÀY, tradable_after = NOW() + 7 ngày
wallet_transactions   KHÔNG ghi
item_movements        KHÔNG ghi
```

> `activities.account_id` giữ acc cày **vĩnh viễn** → trả lời được _"acc nào drop ra nhiều đồ giá trị nhất"_.

---

## F6. Chuyển đồ nội bộ (Transfer)

```
inventory_items       UPDATE account_id = acc đích
                      UPDATE tradable_after = NOW() + 7 ngày
item_movements        INSERT: from, to, hold_ends_at
activities + wallet   KHÔNG CHẠM
```

> **`acquired_activity_id` / `consumed_activity_id` tuyệt đối không đụng vào.**

---

## F7. Cất / Lấy đồ khỏi Storage Unit

```
inventory_items       UPDATE storage_unit_id = <id của unit> | NULL
activities + wallet + movements   KHÔNG CHẠM
```

> Item trong unit **vẫn tính vào portfolio** như bình thường.
> ⚠️ Steam API **không trả về** item bên trong unit → đối soát phải bỏ qua item có `storage_unit_id` ≠ NULL, nếu không sẽ báo mất nhầm.

---

## F8. Bán đồ (`SALE`)

**Bán trên Steam Market → ví STEAM** _(rao 12.50, phí 15%, thực nhận 10.87)_:

```
activities            type = SALE, counterparty = {"name":"Steam Market"}
inventory_items       status = SOLD, consumed_activity_id = activity
                      sale_price = 10.87, sale_currency = 'EUR'
wallet_transactions   ví STEAM  +10.87 EUR

→ profit = 10.87 - 12.50 = -1.63 EUR    (cùng sổ, con số thật)
```

**Bán cho người mua FB → ví CASH** _(tham chiếu BUFF 100 RMB, rate 3.700)_:

```
activities            type = SALE, counterparty = {"name":"Tuấn","fb":"...","steam_id64":"..."}
inventory_items       status = SOLD, consumed_activity_id = activity
                      sale_price = 370.000, sale_currency = 'VND'
                      sale_ref_price = 100, sale_ref_currency = 'RMB', sale_rate = 3.700
wallet_transactions   ví CASH  +370.000 VND
item_movements        KHÔNG ghi

→ item vốn EUR, bán VND → KHÔNG tính profit chung
  Hiển thị: "vốn 12.50 EUR → bán 370.000 VND"
```

**Bán lô nhiều món:** 1 activity, 1 dòng ví, N rows UPDATE. **_`SUM(sale_price)` phải khớp `amount`._**

> **_Luật phân biệt:_** đồ sang acc **của t** → `item_movements`.
> Đồ sang acc **người khác** → item chết, `consumed_activity_id`. **Không bao giờ cả hai.**

---

## F9. Trade-up (`TRADE_UP`)

```
activities            type = TRADE_UP
inventory_items (10)  status = CONSUMED, consumed_activity_id = activity
inventory_items (1)   INSERT mới
                      acquired_activity_id = activity
                      acquired_price = NULL          ← không mua bằng tiền
                      cost_basis = SUM(cost_basis 10 món)
                      cost_currency = currency của nguyên liệu
                      tradable_after = NOW() + 7 ngày
wallet_transactions   KHÔNG ghi
```

> **1 activity vừa là giấy chứng tử của 10 món, vừa là giấy khai sinh của 1 món.**

Thống kê lời/lỗ trade-up — _không cần cột thêm_:

```sql
SELECT * FROM inventory_items WHERE consumed_activity_id = :tradeup_id;  -- nguyên liệu
SELECT * FROM inventory_items WHERE acquired_activity_id = :tradeup_id;  -- thành phẩm
```

---

## F10. Mở hòm truyền thống (`UNBOXING`)

```
activities            type = UNBOXING
inventory_items       Hòm → CONSUMED
                      Key → CONSUMED
inventory_items       INSERT đồ mới, cost_basis = vốn hòm + vốn key
                      tradable_after = NOW() + 7 ngày
```

> **Key luôn là item** _(mua trước bằng `PURCHASE`)_. Không bao giờ trừ thẳng tiền key khỏi ví.

---

## F11. Mở hòm X-Ray / Terminal

_Soi không tốn gì. Hòm chưa mất cho tới khi claim hoặc deny._

**Claim (lấy):**

```
activities            type = CONTAINER_CLAIM
wallet_transactions   -X (tiền claim)
inventory_items       Hòm → CONSUMED
inventory_items       INSERT đồ mới, cost_basis = vốn hòm + X
```

**Deny (từ chối):**

```
activities            type = LOST, note = "deny X-Ray offer"
inventory_items       Hòm → WRITTEN_OFF
```

> Hòm đang chờ claim cứ để `HOLDING` — nó **vẫn nằm trong kho thật**.

---

## F12. Tặng đồ / Bị scam (`GIFT_OUT` / `LOST`)

```
activities            type = GIFT_OUT | LOST
                      counterparty = {"name":"Nam"} | {"name":"scammer fake MM"}
inventory_items       status = WRITTEN_OFF, consumed_activity_id = activity
                      sale_* = NULL toàn bộ
wallet_transactions   KHÔNG ghi
```

---

## F13. Đối soát Steam API

**_Không bao giờ tự động insert/delete. Luôn hỏi._**

```
API có, DB không    → item lạ. Hỏi: mua ở đâu? bao nhiêu? → tạo activity + item
DB có, API không    → đã bán/trade mà quên ghi? Hỏi trước khi làm gì
                      ⚠️ BỎ QUA item có storage_unit_id ≠ NULL
Cả hai đều có       → khớp. Cập nhật tradable_after, asset_id
```

> **API cho biết m ĐANG CÓ GÌ. Không cho biết m ĐÃ TRẢ BAO NHIÊU.**
> Endpoint inventory không có giá, không có nguồn gốc, không có lịch sử.
> _Inventory History là trang web cần login + scrape HTML → phase 2, optional._

---

# SQL RECIPES

```sql
-- ===== TIỀN THẬT (đáng tin tuyệt đối) =====

-- Vị thế tiền thật ròng: âm = đang đầu tư, dương = đã lời
SELECT SUM(wt.amount) FROM wallet_transactions wt
JOIN wallets w ON w.id = wt.wallet_id WHERE w.kind = 'CASH';

-- Tách rõ đã bỏ ra / đã thu về
SELECT
  SUM(CASE WHEN wt.amount < 0 THEN -wt.amount ELSE 0 END) AS da_bo_ra,
  SUM(CASE WHEN wt.amount > 0 THEN  wt.amount ELSE 0 END) AS da_thu_ve
FROM wallet_transactions wt
JOIN wallets w ON w.id = wt.wallet_id WHERE w.kind = 'CASH';


-- ===== SỔ STEAM =====

-- Số dư từng ví (đơn vị gốc)
SELECT w.name, w.currency, COALESCE(SUM(wt.amount), 0) AS balance
FROM wallets w LEFT JOIN wallet_transactions wt ON wt.wallet_id = w.id
GROUP BY w.id, w.name, w.currency;

-- Tỷ giá nạp của từng lần TOP_UP (suy ra, không lưu)
SELECT a.id, a.occurred_at,
       -MAX(CASE WHEN w.kind = 'CASH' THEN wt.amount END)
       / MAX(CASE WHEN w.kind = 'STEAM_BALANCE' THEN wt.amount END) AS gia_nap
FROM activities a
JOIN wallet_transactions wt ON wt.activity_id = a.id
JOIN wallets w ON w.id = wt.wallet_id
WHERE a.type = 'TOP_UP' GROUP BY a.id, a.occurred_at;


-- ===== KHO ĐỒ =====

-- Tổng vốn đang giữ, theo từng loại tiền
SELECT cost_currency, SUM(cost_basis) FROM inventory_items
WHERE status = 'HOLDING' GROUP BY cost_currency;

-- Lãi/lỗ item đã bán (chỉ tính khi cùng loại tiền)
SELECT id, name, cost_currency, cost_basis, sale_price,
       CASE WHEN cost_currency = sale_currency
            THEN sale_price - cost_basis ELSE NULL END AS profit
FROM inventory_items WHERE status = 'SOLD';

-- Lỗ do mất/tặng
SELECT cost_currency, SUM(cost_basis) FROM inventory_items
WHERE status = 'WRITTEN_OFF' GROUP BY cost_currency;

-- Item + trạng thái trade-hold
SELECT *, (tradable_after IS NULL OR tradable_after <= NOW()) AS is_tradable
FROM inventory_items WHERE status = 'HOLDING';

-- Đồ đang cất trong 1 storage unit
SELECT * FROM inventory_items WHERE storage_unit_id = :unit_id;

-- Tổng GIÁ TRỊ kho theo giá thị trường   (phase 2)
SELECT SUM(p.price)
FROM inventory_items i
JOIN LATERAL (
  SELECT price FROM item_prices
  WHERE market_hash_name = i.market_hash_name AND source = 'STEAM'
  ORDER BY fetched_at DESC LIMIT 1
) p ON true
WHERE i.status = 'HOLDING';
```

---

# INVARIANT — phải test

| #   | Luật                                                                                                | Kiểm ở đâu                                                                                        |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Mọi `wallet_transaction` có `activity_id`                                                           | DB constraint                                                                                     |
| 2   | `TOP_UP` luôn tạo đúng 2 dòng ví                                                                    | Service                                                                                           |
| 3   | `PURCHASE`: `SUM(cost_basis)` = `\|amount\|` ví                                                     | Service                                                                                           |
| 4   | `SALE`: `SUM(sale_price)` = `amount` ví                                                             | Service                                                                                           |
| 5   | Ví `STEAM_BALANCE` không âm                                                                         | Service — **_backdate thì WARNING, vẫn ghi_**                                                     |
| 6   | Item `SOLD`/`CONSUMED`/`WRITTEN_OFF` bắt buộc có `consumed_activity_id`                             | Service                                                                                           |
| 7   | Transfer không đụng `acquired_/consumed_activity_id`                                                | Test                                                                                              |
| 8   | `items.account_id` khớp movement mới nhất                                                           | Test                                                                                              |
| 9   | Trade-up: vốn nguyên liệu = vốn thành phẩm                                                          | Test                                                                                              |
| 10  | `cost_currency` = currency của ví đã trả                                                            | Service                                                                                           |
| 11  | `activities.account_id` NULL **chỉ khi** `type = OPENING_BALANCE` **và** ví liên quan `kind = CASH` | Vế 1: DB constraint (`chk_activity_account`) · Vế 2: Service — DB không tham chiếu chéo bảng được |
