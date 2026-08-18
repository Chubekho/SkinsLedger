import { prisma } from "../db/client.js";

const result = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
console.log("version:", result[0]?.version);

await prisma.$disconnect();
