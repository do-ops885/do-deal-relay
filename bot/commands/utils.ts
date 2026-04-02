/**
 * Command Utilities
 *
 * Shared helper functions for command implementations.
 */

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `❌ Error: ${error.message}`;
  }
  return "❌ An unexpected error occurred.";
}

export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}
