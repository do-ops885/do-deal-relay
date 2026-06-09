export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

export interface MigrationRecord {
  version: number;
  name: string;
  applied_at: number;
}

export interface MigrationResult {
  success: boolean;
  applied: number[];
  rolledBack: number[];
  currentVersion: number;
  error?: string;
}

export interface MigrationStatus {
  currentVersion: number;
  pending: number[];
  applied: number[];
  latestVersion: number;
}
