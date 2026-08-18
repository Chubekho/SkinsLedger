import { describe, it, expect } from 'vitest';
import { resetDb } from './helpers/reset-db.js';

describe('test infra', () => {
  it('resetDb runs without throwing', async () => {
    await expect(resetDb()).resolves.not.toThrow();
  });
});