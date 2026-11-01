/**
 * Seed Script for Authentication and User Management
 *
 * Split by blast radius:
 *   - `seedAuth` writes the data authorization actually depends on: roles,
 *     permissions and their mappings. Safe to run against production.
 *   - `seedTestFixtures` writes placeholder users with a known hash and a
 *     wildcard API key. Development and tests only; never call it against
 *     production.
 *
 * Every statement is `INSERT OR IGNORE`, so both functions are idempotent.
 */

import { D1Database } from "@cloudflare/workers-types";

const ROLES_AND_PERMISSIONS = [
  // Roles
  `INSERT OR IGNORE INTO roles (id, name, description) VALUES
    ('admin', 'Administrator', 'Full system access'),
    ('user', 'User', 'Standard user access for submissions and research'),
    ('viewer', 'Viewer', 'Read-only access to deals and referrals');`,

  // Permissions
  `INSERT OR IGNORE INTO permissions (id, name, description) VALUES
    ('deals:view', 'View Deals', 'Ability to view deal listings'),
    ('deals:create', 'Create Deals', 'Ability to submit new deals'),
    ('deals:admin', 'Admin Deals', 'Ability to manage all deals'),
    ('referrals:view', 'View Referrals', 'Ability to view referral codes'),
    ('referrals:create', 'Create Referrals', 'Ability to submit new referral codes'),
    ('referrals:manage', 'Manage Referrals', 'Ability to deactivate/reactivate referrals'),
    ('keys:manage', 'Manage API Keys', 'Ability to create and revoke API keys'),
    ('users:manage', 'Manage Users', 'Ability to manage user accounts'),
    ('audit:view', 'View Audit Logs', 'Ability to view system audit logs');`,

  // Admin gets every permission that exists
  `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
   SELECT 'admin', id FROM permissions;`,

  // User permissions
  `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
    ('user', 'deals:view'),
    ('user', 'deals:create'),
    ('user', 'referrals:view'),
    ('user', 'referrals:create'),
    ('user', 'referrals:manage');`,

  // Viewer permissions
  `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES
    ('viewer', 'deals:view'),
    ('viewer', 'referrals:view');`,
];

/**
 * Placeholder accounts and keys. The password hash is a literal placeholder
 * (`sha256:password123hash`), not a real credential, and the API key grants
 * `["*"]`. These are for local development and tests only.
 */
const TEST_FIXTURES = [
  `INSERT OR IGNORE INTO users (id, email, name, password_hash, role, is_active) VALUES
    ('test-admin-id', 'admin@example.com', 'Test Admin', 'sha256:password123hash', 'admin', 1),
    ('test-user-id', 'user@example.com', 'Test User', 'sha256:password123hash', 'user', 1);`,

  `INSERT OR IGNORE INTO api_keys (id, user_id, key_hash, name, permissions) VALUES
    ('test-key-id', 'test-admin-id', '8edc76949392e276f5713454747ed3e4c49887756f6424e6c1e55047b312385b', 'Admin Test Key', '["*"]');`,
];

async function run(db: D1Database, queries: string[]): Promise<void> {
  for (const query of queries) {
    await db.prepare(query).run();
  }
}

/** Production-safe: roles, permissions and their mappings only. */
export async function seedAuth(db: D1Database): Promise<void> {
  console.log("Seeding authentication roles and permissions...");
  await run(db, ROLES_AND_PERMISSIONS);
  console.log("Roles and permissions seeded successfully.");
}

/** Development and tests only — creates placeholder users and an API key. */
export async function seedTestFixtures(db: D1Database): Promise<void> {
  console.log("Seeding test users and API key (NOT for production)...");
  await run(db, TEST_FIXTURES);
  console.log("Test fixtures seeded successfully.");
}
