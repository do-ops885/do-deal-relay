# Anti-AI-Slop: Detailed Examples

Extended catalog of AI slop patterns with before/after comparisons.

---

## Code Patterns

### 1. Generic Comments

**Slop:**

```javascript
// This function processes the data
function processData(data) {
  // Loop through each item
  for (let item of data) {
    // Process the item
    process(item);
  }
}
```

**Better:**

```javascript
// Transform raw API response into normalized deal objects
// Handles ProductHunt v1/v2 API format differences
function normalizeDeals(apiResponse) {
  for (let rawDeal of apiResponse.posts) {
    process(rawDeal);
  }
}
```

---

### 2. Placeholder Error Handling

**Slop:**

```javascript
try {
  doSomething();
} catch (error) {
  console.log(error);
}
```

**Better:**

```javascript
try {
  const deals = await fetchProductHuntDeals();
} catch (error) {
  if (error.status === 429) {
    await backoffAndRetry(error);
  } else {
    logger.error("ProductHunt API failed", { error, context: "daily-sync" });
    notifyOps("Deal source degraded: ProductHunt");
  }
}
```

---

### 3. Empty Implementations

**Slop:**

```javascript
function getUserPreferences() {
  // TODO: Implement this function
  return {};
}
```

**Better:**

```javascript
function getUserPreferences() {
  throw new Error("Not implemented: getUserPreferences requires user context");
}
```

---

### 4. Overly Generic Names

**Slop:**

```javascript
function handleData(data) {
  let result = process(data);
  return result;
}
```

**Better:**

```javascript
function extractDealMetrics(rawPost) {
  let dealScore = calculateMomentumScore(rawPost);
  return dealScore;
}
```

---

## Content Patterns

### 1. Fluffy Introductions

**Slop:**

```markdown
In today's fast-paced world, businesses are constantly looking for
ways to improve their processes and stay ahead of the competition...
```

**Better:**

```markdown
## Why Deal Discovery Relay?

Finding high-quality deals requires monitoring 10+ sources continuously.
Manual research takes 4+ hours daily. This system automates it to 5 minutes.
```

---

### 2. Vague Lists

**Slop:**

```markdown
## Features

- Easy to use
- Fast performance
- Great support
- Flexible configuration
```

**Better:**

```markdown
## Features

- **Multi-source monitoring**: ProductHunt, GitHub, Hacker News in one pipeline
- **AI ranking**: ML model scores deal quality based on 12 factors
- **Slack integration**: Real-time deal alerts to your team channel
- **Custom filters**: Define your own deal criteria (funding, tech stack, etc.)
```

---

### 3. Meaningless Boilerplate

**Slop:**

```markdown
## Getting Started

1. Install the package
2. Configure your settings
3. Run the application
4. Enjoy!
```

**Better:**

````markdown
## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure API keys (see .env.example)
cp .env.example .env
# Edit .env with your ProductHunt + GitHub tokens

# 3. Run first deal scan
npm run research -- --sources producthunt --days 7
```
````

````

---

## Deal Discovery Examples

### Generic vs Specific Research Output

**Slop:**

```markdown
## Research Results

We found several interesting companies this week. They seem to be
doing innovative work in the AI space and have good engagement.
````

**Better:**

```markdown
## Weekly Deal Report (Jan 15-21)

### Top Deals

1. **CodeRabbit AI** (code review bot)
   - Source: ProductHunt
   - Upvotes: 1,247 (↑89% vs avg)
   - Signal: YC W24 applicant, 3-person team, TypeScript/Svelte stack
   - Deal Score: 8.7/10
   - Action: Reach out to founders (contact in notes/)

2. **LLM Pricing** (API cost calculator)
   - Source: GitHub Trending
   - Stars: 3.4k (gained 800 this week)
   - Signal: Open source, gaining traction on HN
   - Deal Score: 7.2/10
   - Action: Monitor for funding announcement
```

---

## Detection Scripts

### Automated Checks

```bash
#!/bin/bash
# anti_slop_check.sh

check_generic_comments() {
    grep -r "This function" --include="*.js" --include="*.ts" .
    grep -r "Process the" --include="*.js" --include="*.ts" .
    grep -r "Handle the" --include="*.js" --include="*.ts" .
}

check_empty_catches() {
    grep -r "catch.*console.log" --include="*.js" --include="*.ts" .
}

check_todos() {
    grep -rn "TODO\|FIXME\|XXX" --include="*.js" --include="*.ts" .
}

check_fluff() {
    grep -r "In today's world" --include="*.md" .
    grep -r "fast-paced" --include="*.md" .
    grep -r "innovative solution" --include="*.md" .
}
```

---

## Manual Review Questions

Ask yourself:

1. Would I understand this if I read it 6 months from now?
2. Could a competitor copy this without understanding our domain?
3. Are there numbers/metrics or just adjectives?
4. Would a human expert write it this way?
5. Is there a clear next action?
