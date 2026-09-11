// Mọi service function nhận tx làm tham số đầu tiên, tự nó không bao giờ gọi withTx. Ai gọi service thì người đó mở withTx. Lý do: nếu service tự mở transaction bên trong, ghép 2 service vào chung 1 luồng (ví dụ Bước 4 gọi cả "trừ kho" và "cộng ví" trong 1 lần SALE) sẽ vô tình tạo ra 2 transaction rời nhau — sai đúng cái ROADMAP gọi là "activity ghi xong mà item ghi hỏng".
// Vai trò: Bọc gọn prisma.$transaction() — nơi duy nhất "mở" một transaction thật (BEGIN/COMMIT/ROLLBACK)
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./client.js";

export function withTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn);
}
