# Browser Tests

Browser-based UI and integration tests using Playwright.

## Overview

These tests validate the browser extension UI and content script functionality:
- Extension popup UI behavior
- Content script detection logic
- API integration and error handling
- User interaction flows

## Test Files

### extension.spec.ts
Tests for the browser extension:
- Popup UI elements (title, URL, status, buttons)
- Detection list rendering
- Settings panel toggle
- Manual code input
- Stats counters
- Content script detection logic
- API error handling
- Input validation

## Running Tests

```bash
# Run all browser tests
npx playwright test tests/browser/

# Run with UI mode
npx playwright test tests/browser/ --ui

# Run specific test
npx playwright test tests/browser/extension.spec.ts
```

## Configuration

Tests use the extension files directly from `extension/` directory.
Chrome APIs are mocked for testing.

## Notes

- Tests mock the Chrome extension API
- Content script tests inject detection logic directly
- API integration tests use Playwright's route interception
