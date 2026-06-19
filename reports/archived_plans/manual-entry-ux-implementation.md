# Manual Entry UX Implementation Plan

**status**: planned
**owner**: jules
**scope**: extension/
**method**: GOAP

## 1) Task Analysis
**Primary Goal**: Enhance the Manual Entry section with real-time feedback and cleaning.

## 2) Decomposition
- [ ] Add  to `popup.html`.
- [ ] Implement `input` event listener in `popup.js` for real-time cleaning.
- [ ] Update `manual-btn` disabled state based on input length.
- [ ] Refactor `tests/browser/extension.spec.ts` to support event-driven input.

## 3) Execution
Phase 1: UI/JS Implementation.
Phase 2: Test Suite Hardening.
