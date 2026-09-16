import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });   

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 10000,
     fileParallelism: false,  // "Test chạy chung 1 DB → fileParallelism: false trong vitest.config.ts. Song song + resetDb() = fail ngẫu nhiên."
  },
});