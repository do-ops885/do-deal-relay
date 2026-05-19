export interface FetchResult {
  success: boolean;
  content: string;
  contentType: string;
  statusCode: number;
  error?: string;
  fetchDurationMs: number;
}
