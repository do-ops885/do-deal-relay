// Templates module - re-exports from templates/ subdirectory
// Original file split to maintain <500 line limit

export {
  EmailTemplate,
  ConfirmationEmailData,
  createSuccessConfirmation,
  createDeactivationConfirmation,
  createSearchResultsEmail,
  createErrorEmail,
  createHelpEmail,
  createLowConfidenceEmail,
  createConfirmationEmail,
} from "./templates/index";
