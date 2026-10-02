import type { Migration } from "./types";
import { MIGRATIONS_PART_1 } from "./schema-part-1";
import { MIGRATIONS_PART_2 } from "./schema-part-2";
import { MIGRATIONS_PART_3 } from "./schema-part-3";
import { MIGRATIONS_PART_4 } from "./schema-part-4";
import { MIGRATIONS_PART_5 } from "./schema-part-5";
import { MIGRATIONS_PART_6 } from "./schema-part-6";
import { MIGRATIONS_PART_7 } from "./schema-part-7";
import { MIGRATIONS_PART_8 } from "./schema-part-8";

/**
 * Ordered union of every schema migration. Order MUST be preserved — each
 * part is appended in version order (1-2, 3-4, 5-6, 7-8, 9, 10-11, 12-14).
 * See schema-part-*.ts.
 */
export const MIGRATIONS: Migration[] = [
  ...MIGRATIONS_PART_1,
  ...MIGRATIONS_PART_2,
  ...MIGRATIONS_PART_3,
  ...MIGRATIONS_PART_4,
  ...MIGRATIONS_PART_5,
  ...MIGRATIONS_PART_6,
  ...MIGRATIONS_PART_7,
  ...MIGRATIONS_PART_8,
];
