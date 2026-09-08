import { describe, expect, it } from 'vitest';
import { openHaseeb } from '@/db';

describe('local database', () => {
  it('opens, seeds and reads back', async () => {
    const h = await openHaseeb({ ephemeral: true });
    expect(h.products.list().length).toBeGreaterThan(0);
    expect(h.ops.profile()?.name).toBe('مؤسسة النور التجارية');
    h.db.close();
  });
});
