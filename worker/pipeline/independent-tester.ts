// worker/pipeline/independent-tester.ts
// Independent tester role for the PEV loop.
// Tests are written from acceptance criteria, NOT from the author's code.
// This prevents the conflict of interest where author grades own work.
// Note: verification helpers removed (zero importers, see #911); types retained
// for future use.

// ============================================================================
// Test Result Types
// ============================================================================

export interface TestResult {
  gate: string;
  passed: boolean;
  message: string;
  details?: string[] | undefined;
  timestamp: string;
}

export interface VerificationReport {
  run_id: string;
  overall_pass: boolean;
  results: TestResult[];
  passed_count: number;
  failed_count: number;
  coverage_floor: number;
  timestamp: string;
}
