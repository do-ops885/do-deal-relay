export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
}

export interface GitHubContent {
  content: string;
  sha: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  head_sha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "cancelled"
    | "skipped"
    | "timed_out"
    | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStatus {
  total_runs: number;
  completed_runs: number;
  successful_runs: number;
  failed_runs: number;
  pending_runs: number;
  latest_run?: WorkflowRun;
}
