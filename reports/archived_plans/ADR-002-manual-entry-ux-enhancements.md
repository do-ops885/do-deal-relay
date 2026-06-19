# ADR 002: Manual Entry UX Enhancements

## Context
The "Manual Entry" section of the Referral Capture browser extension currently relies on post-submission validation for referral codes. This leads to a suboptimal user experience where invalid characters or excessive lengths only trigger error messages after the user attempts to add the code. Additionally, the 20-character limit is not visually communicated.

Initial attempts to implement real-time cleaning and character counting revealed that the existing Playwright E2E test suite (`tests/browser/extension.spec.ts`) is highly sensitive to DOM mutations and input event timing, leading to flakiness in the current CI/CD environment.

## Decision
We will implement real-time input cleaning (automatic uppercase conversion, alphanumeric stripping) and a character counter as a separate, isolated phase. This allows for:
1.  **UX Improvement**: Immediate feedback for the user.
2.  **Architectural Stability**: Decoupling visual/interaction logic from the core capture functionality.
3.  **Test Hardening**: Updating the test suite to use more robust event-driven assertions (e.g., `dispatchEvent('input')`) to accommodate real-time logic.

## Consequences
- **Positive**: Reduced API error rates, better user awareness of constraints, and improved UI polish.
- **Negative**: Increased complexity in the popup logic; requires updates to existing functional tests to avoid regressions.
- **Neutral**: Requires the addition of a character counter element to the DOM.
