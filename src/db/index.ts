/**
 * The database façade the app talks to: one open handle plus the
 * repositories over it.
 */

import { HaseebDatabase, type OpenOptions } from './database';
import { ProductRepository } from './repositories/products';
import { SalesRepository } from './repositories/sales';
import { CustomerRepository } from './repositories/customers';
import { OperationsRepository } from './repositories/operations';
import { AnalyticsRepository } from './repositories/analytics';
import { seed } from './seed';

export interface Haseeb {
  db: HaseebDatabase;
  products: ProductRepository;
  sales: SalesRepository;
  customers: CustomerRepository;
  ops: OperationsRepository;
  analytics: AnalyticsRepository;
}

export function repositories(db: HaseebDatabase): Haseeb {
  return {
    db,
    products: new ProductRepository(db),
    sales: new SalesRepository(db),
    customers: new CustomerRepository(db),
    ops: new OperationsRepository(db),
    analytics: new AnalyticsRepository(db),
  };
}

/**
 * Open (or create) the local database and make sure it has data.
 *
 * `seedIfEmpty` is what makes a fresh install look like the design instead of
 * a wall of empty states; an existing file is never touched.
 */
export async function openHaseeb(
  options: OpenOptions & { seedIfEmpty?: boolean } = {},
): Promise<Haseeb> {
  const db = await HaseebDatabase.open(options);
  if ((options.seedIfEmpty ?? true) && (await db.isEmpty())) {
    await seed(db);
    await db.flush();
  }
  return repositories(db);
}

export { HaseebDatabase } from './database';
export type { SqlDriver, SqlTx } from './drivers';
export { seed, resetToSeed } from './seed';
export * from './types';
export { ProductRepository, SalesRepository, CustomerRepository, OperationsRepository, AnalyticsRepository };
