import type { Migration } from "./types";
import { MIGRATIONS_PART_1 } from "./schema-part-1";
import { MIGRATIONS_PART_2 } from "./schema-part-2";
import { MIGRATIONS_PART_3 } from "./schema-part-3";
import { MIGRATIONS_PART_4 } from "./schema-part-4";

/**
 * Ordered union of every schema migration. Order MUST be preserved — each
 * part is appended in version order (1-2, 3-4, 5-6, 7-8). See schema-part-*.ts.
 */
export const MIGRATIONS: Migration[] = [
  ...MIGRATIONS_PART_1,
  ...MIGRATIONS_PART_2,
  ...MIGRATIONS_PART_3,
  ...MIGRATIONS_PART_4,
];
