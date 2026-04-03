# Test Fixtures

This directory contains test fixtures and mock data for the Deal Discovery System.

## Files

### deals.ts
Provides sample deal data, sources, and helper functions for testing:

- `sampleDeals`: Array of realistic deal objects covering multiple categories
- `sampleSources`: Registered deal sources with trust scores
- `categoryKeywords`: Keywords used for deal categorization
- `invalidDeals`: Edge cases including invalid URLs, expired deals, high-value deals
- `analyticsFixtures`: Pre-computed analytics data

### Helper Functions

- `createMockDeal(overrides)`: Create a custom mock deal with default values
- `getDealsByCategory(category)`: Filter deals by category
- `getValidDeals()`: Get only non-expired valid deals
- `getExpiredDeals()`: Get expired deals
- `getHighValueDeals(threshold)`: Get deals above value threshold

## Usage

```typescript
import { sampleDeals, createMockDeal, getValidDeals } from '../fixtures/deals';

// Use pre-defined sample data
const deals = sampleDeals;

// Create custom mock deal
const customDeal = createMockDeal({
  title: "Custom Test Deal",
  value: 100,
  category: "finance"
});

// Get filtered data
const validOnly = getValidDeals();
const highValue = getHighValueDeals(50);
```

## Data Coverage

The fixtures include:

- **8 sample deals** across 7 categories (finance, food_delivery, transportation, travel, cloud_storage, entertainment, other)
- **5 data sources** with varying trust scores
- **12 category definitions** with keywords
- **Edge cases** for validation testing
