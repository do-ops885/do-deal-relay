import type { EmailTemplate, ConfirmationEmailData } from "./types";
import {
  createSuccessConfirmation,
  createDeactivationConfirmation,
} from "./commands";
import { createSearchResultsEmail, createErrorEmail } from "./responses";

export function createConfirmationEmail(
  data: ConfirmationEmailData,
): EmailTemplate {
  switch (data.action) {
    case "added":
      return createSuccessConfirmation(data);
    case "deactivated":
      return createDeactivationConfirmation(
        data.service,
        data.code || "N/A",
        "User request",
      );
    case "found":
      return createSearchResultsEmail(
        data.service, // In this case, service is the query
        data.searchResults || [],
      );
    case "error":
      return createErrorEmail(
        data.errorMessage || "Unknown error",
        data.notes ? [data.notes] : undefined,
      );
    default:
      return createSuccessConfirmation(data);
  }
}

export * from "./types";
export * from "./commands";
export * from "./responses";
