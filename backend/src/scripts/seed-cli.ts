import { seed } from "../db/seed.js";
import { prisma } from "../db/client.js";

seed()
  .then(async (data) => {
    console.log(
      `Seeded: ${data.accountsLen} accounts, ${data.walletsLen} wallets`,
    );
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("Error occured: ", err);
    await prisma.$disconnect();
    process.exit(1);
  });
