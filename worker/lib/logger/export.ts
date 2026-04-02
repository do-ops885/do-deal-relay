import { Env } from "../../types";
import { getRecentLogs, getRecentStructuredLogs } from "./query";

export async function exportLogsAsJSONL(env: Env): Promise<string> {
  const entries = await getRecentLogs(env, 10000);
  return entries.map((e) => JSON.stringify(e)).join("\n");
}

export async function exportStructuredLogsAsJSONL(env: Env): Promise<string> {
  const entries = await getRecentStructuredLogs(env, 10000);
  return entries.map((e) => JSON.stringify(e)).join("\n");
}
