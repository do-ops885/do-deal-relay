# Referral Code Chatbot Design Document

**Version**: 1.0  
**Date**: 2026-04-01  
**Status**: Design Phase  
**Target Platforms**: Telegram, Discord

---

## 1. Executive Summary

This document outlines the design for a conversational chatbot that allows users to manage referral codes through Telegram and Discord. The bot integrates with the existing Deal Discovery API to provide seamless code management, research, and notification capabilities.

### Key Features
- Add referral codes via natural chat commands
- Search and query active codes by domain
- Deactivate codes with reason tracking
- Request AI-powered research for new domains
- Subscribe to notifications for new deals

---

## 2. Bot Framework Comparison

### 2.1 Telegram (Telegraf)

| Aspect | Details |
|--------|---------|
| **Library** | `telegraf` (v4.x) |
| **Strengths** | Excellent command parsing, built-in middleware, native MarkdownV2 support, inline keyboards |
| **Auth Model** | User ID-based, easy admin whitelist |
| **Rate Limits** | 30 messages/sec in groups, 1 message/sec in private (burst: 20) |
| **Best For** | Simple commands, broad user base, mobile-first |

### 2.2 Discord (discord.js)

| Aspect | Details |
|--------|---------|
| **Library** | `discord.js` (v14.x) |
| **Strengths** | Rich embeds, slash commands (native), role-based permissions, thread support |
| **Auth Model** | Role-based, guild permissions, command permissions |
| **Rate Limits** | Global: 50 req/sec, per-route buckets |
| **Best For** | Community features, rich formatting, permission granularity |

### 2.3 Recommendation

**Primary**: Discord for admin/management features (rich permissions, embeds)  
**Secondary**: Telegram for broad user access (simpler, more accessible)

---

## 3. Command Reference

### 3.1 Universal Commands (Both Platforms)

#### `/start` - Initialize Bot
```
User: /start
Bot: 👋 Welcome to DealRelay Bot!

I help you manage referral codes. Here's what I can do:

📝 /add <code> <url> - Add a new referral code
🔍 /search <domain> - Find codes for a domain
🚫 /deactivate <code> [reason] - Deactivate a code
🔬 /research <domain> - Research codes for a domain
🔔 /subscribe [domain] - Get new deal notifications
📊 /stats - View system statistics
❓ /help [command] - Show detailed help

Your User ID: 123456789
```

#### `/add` - Add Referral Code
```
User: /add GcCOCxbo https://trading212.com/invite/GcCOCxbo
Bot: ✅ Code added successfully!

Details:
• Code: GcCOCxbo
• Domain: trading212.com
• Status: Pending review
• ID: ref-abc123

The code will be validated and activated within 5 minutes.
```

**Syntax**: `/add <code> <url> [title] [reward]`  
**Aliases**: `/new`, `/create`  
**Permissions**: Admin, Whitelist, or Public (configurable)

#### `/search` - Search Active Codes
```
User: /search trading212.com
Bot: 🔍 Found 3 active codes for trading212.com:

1. GcCOCxbo
   Reward: Free share worth up to £100
   Status: ✅ Active
   Added: 2 days ago

2. FREESHARE2024
   Reward: £20 bonus
   Status: ✅ Active
   Added: 1 week ago

3. OLD_CODE_2023
   Reward: £10 bonus
   Status: ⏳ Expiring soon (2 days left)

Use /get <code> for full details or /deactivate to remove.
```

**Syntax**: `/search <domain>` or `/search <category>`  
**Aliases**: `/find`, `/query`  
**Options**: `--active-only`, `--expired`, `--all`

#### `/get` - Get Code Details
```
User: /get GcCOCxbo
Bot: 📋 Code Details: GcCOCxbo

🎯 Domain: trading212.com
🔗 URL: https://trading212.com/invite/GcCOCxbo
🎁 Reward: Free share worth up to £100
📊 Confidence: 85%
📅 Added: 2024-03-28
⏱️ Expires: 2024-12-31
✅ Status: Active

Categories: trading, finance, investing
Tags: popular, high-value
```

#### `/deactivate` - Deactivate Code
```
User: /deactivate GcCOCxbo expired
Bot: 🚫 Code deactivated: GcCOCxbo

Reason: Expired
Deactivated by: @username
Time: 2024-04-01 12:34 UTC

The code has been moved to inactive status.
```

**Syntax**: `/deactivate <code> [reason] [notes]`  
**Aliases**: `/disable`, `/remove`  
**Reasons**: `expired`, `invalid`, `violation`, `replaced`, `user_request`  
**Permissions**: Admin or code submitter

#### `/research` - Research Domain
```
User: /researchwise.com
Bot: 🔬 Starting research for wise.com...

I'll check:
• Product Hunt discussions
• Reddit threads
• GitHub repositories
• Company website
• Social media mentions

⏱️ Estimated time: 2-3 minutes

Use /research status for progress updates.
```

**Syntax**: `/research <domain> [depth]`  
**Depth Options**: `quick` (1 min), `thorough` (3 min), `deep` (5 min)  
**Aliases**: `/scan`, `/investigate`

**Follow-up Result**:
```
Bot: 🔬 Research complete for wise.com!

Found 2 referral codes:

1. WISEFREE2024
   Source: Reddit r/beermoney
   Reward: First transfer free
   Confidence: 78%

2. WISE50OFF
   Source: Company site
   Reward: 50% off first transfer
   Confidence: 92%

Use /add to add any of these codes.
```

#### `/subscribe` - Subscribe to Notifications
```
User: /subscribe trading212.com
Bot: 🔔 Subscription confirmed!

You'll receive notifications when:
• New codes are added for trading212.com
• Existing codes are deactivated
• High-value deals are discovered

To subscribe to all domains: /subscribe all
To unsubscribe: /unsubscribe trading212.com
```

**Syntax**: `/subscribe [domain|all]`  
**Aliases**: `/notify`, `/alerts`  
**Types**: Domain-specific or global

#### `/stats` - System Statistics
```
User: /stats
Bot: 📊 DealRelay System Statistics

📦 Total Codes: 1,247
✅ Active: 892 (71.5%)
⏳ Quarantined: 234 (18.8%)
🚫 Inactive: 121 (9.7%)

🔍 Research Sources:
• ProductHunt: 45 deals
• GitHub: 23 deals
• Reddit: 67 deals
• Manual: 812 deals

⏱️ Last Run: 2 hours ago
🔄 Next Run: 4 hours from now
```

#### `/help` - Help System
```
User: /help add
Bot: 📖 Help: /add command

Add a new referral code to the system.

Usage:
/add <code> <url> [title] [reward]

Examples:
• /add ABC123 https://example.com/invite/ABC123
• /add XYZ789 https://site.com/ref/XYZ789 "Free $20" "$20 credit"

Notes:
• Code will be validated before activation
• You'll receive a confirmation when active
• Invalid URLs will be rejected

See also: /search, /deactivate
```

### 3.2 Platform-Specific Commands

#### Discord Only

**Slash Commands** (native integration):
```
/add
  code: "GcCOCxbo"
  url: "https://trading212.com/invite/GcCOCxbo"
  domain: "trading212.com"
  reward: "Free share worth up to £100"

/search
  query: "trading212.com"
  status: "active"
  limit: 10

/bulk-add
  file: [upload CSV/JSON]

/admin
  action: "list-admins" | "add-admin" | "remove-admin"
  user: @username
```

**Context Menu**: Right-click message → "Extract Referral Code"

#### Telegram Only

**Inline Mode**:
```
User: @DealRelayBot trading212.com
Bot: [Inline results showing top 3 codes]
```

**Callback Buttons**:
```
[📋 Copy] [🔗 Open] [✅ Use This]
```

---

## 4. Bot Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chatbot Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Telegram  │  │   Discord   │  │   Webhook Handler   │  │
│  │   (Telegraf)│  │ (discord.js)│  │   (Cloudflare)      │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │             │
│         └────────────────┴────────────────────┘             │
│                          │                                  │
│              ┌───────────▼───────────┐                     │
│              │    Command Router       │                     │
│              │  • Parse commands       │                     │
│              │  • Auth middleware      │                     │
│              │  • Rate limiting        │                     │
│              └───────────┬───────────┘                     │
│                          │                                  │
│         ┌────────────────┼────────────────┐               │
│         ▼                ▼                ▼               │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐         │
│  │  State   │    │  Dialog  │    │  API Client  │         │
│  │  Manager │    │  Manager │    │  (Internal)  │         │
│  └──────────┘    └──────────┘    └──────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    DealRelay API Layer                        │
│         (Existing Cloudflare Worker Endpoints)              │
│                                                              │
│   /api/submit    /api/discover    /deals    /api/status      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Component Details

#### Command Router
```typescript
interface CommandRouter {
  // Parse incoming message/command
  parse(input: string): ParsedCommand;
  
  // Route to handler
  route(command: ParsedCommand, context: Context): Promise<Response>;
  
  // Middleware chain
  middleware: [
    rateLimiter,
    authChecker,
    conversationStateLoader,
    commandHandler
  ];
}
```

#### Conversation State Manager
```typescript
interface ConversationState {
  userId: string;
  platform: 'telegram' | 'discord';
  currentDialog: DialogType | null;
  dialogData: Record<string, unknown>;
  lastActivity: Date;
  commandHistory: string[];
}

type DialogType = 
  | 'ADD_CODE_FLOW' 
  | 'RESEARCH_FLOW' 
  | 'BULK_IMPORT_FLOW'
  | 'ADMIN_SETUP';
```

#### API Client (Internal)
```typescript
class DealRelayAPI {
  async submitDeal(body: SubmitDealBody): Promise<SubmissionResult>;
  async searchDeals(query: ReferralSearchQuery): Promise<SearchResult>;
  async deactivateDeal(code: string, reason: string): Promise<DeactivationResult>;
  async triggerResearch(domain: string, depth: ResearchDepth): Promise<ResearchJob>;
  async getResearchStatus(jobId: string): Promise<ResearchStatus>;
  async getStats(): Promise<SystemStats>;
  async subscribe(userId: string, domain?: string): Promise<SubscriptionResult>;
}
```

---

## 5. Conversation Flows

### 5.1 Add Code Flow (Interactive)

```
User: /add
Bot: Let's add a new referral code! I'll guide you through it.

Step 1/4: What's the referral code?
User: GcCOCxbo
Bot: ✓ Got it: GcCOCxbo

Step 2/4: What's the full URL?
User: https://trading212.com/invite/GcCOCxbo
Bot: ✓ URL saved

Step 3/4: What's the reward/bonus? (optional)
User: Free share worth up to £100
Bot: ✓ Reward noted

Step 4/4: Any notes or tags? (optional, skip with /skip)
User: Popular UK investing app
Bot: ✓ Notes added

─────────────────────────────
Review your submission:
• Code: GcCOCxbo
• URL: https://trading212.com/invite/GcCOCxbo
• Reward: Free share worth up to £100
• Notes: Popular UK investing app

[Confirm] [Edit] [Cancel]
─────────────────────────────

User: Confirm
Bot: ✅ Code submitted successfully!

ID: ref-abc123
Status: Pending validation
ETA: Active in ~5 minutes

You'll get a notification when it's live!
```

### 5.2 Research Flow

```
User: /research
Bot: I can research referral codes for any domain. What domain should I search?

User: wise.com
Bot: 🔬 Starting research for wise.com...

What depth should I search?
[Quick (1 min)] [Thorough (3 min)] [Deep (5 min)]

User: [Thorough]
Bot: ⏳ Researching wise.com at thorough depth...

Progress:
☑️ Product Hunt checked
☑️ Reddit scanned (3 subreddits)
☑️ GitHub repositories
⏳ Company website
⏳ Social media mentions

(2 of 5 complete, ~1 min remaining)

[Check Progress] [Cancel]

...

Bot: 🔬 Research complete! Found 2 codes:

1. WISEFREE2024
   Source: Reddit r/beermoney
   Reward: First transfer free
   Confidence: 78%
   [Add This] [Details]

2. WISE50OFF
   Source: Company site
   Reward: 50% off first transfer
   Confidence: 92%
   [Add This] [Details]

[Research Another] [View All Codes]
```

### 5.3 Bulk Import Flow (Admin)

```
User: /bulk-import
Bot: Bulk import mode activated. 

Send me a JSON file or paste the data directly.

Format:
[
  {
    "code": "ABC123",
    "url": "https://...",
    "domain": "example.com",
    "reward": "$10 credit"
  }
]

Or upload a CSV with columns: code, url, domain, reward

User: [uploads codes.json]
Bot: 📄 Received codes.json (15 codes)

Preview:
• 12 new codes
• 2 duplicates (will be skipped)
• 1 invalid URL (will be rejected)

[Import All] [Review Duplicates] [Cancel]

User: Import All
Bot: ✅ Import complete!

Successfully added: 12 codes
Skipped duplicates: 2
Rejected invalid: 1

IDs: ref-001 through ref-012
Status: Pending validation
```

---

## 6. Authentication & Permissions

### 6.1 Permission Levels

| Level | Telegram | Discord | Capabilities |
|-------|----------|---------|--------------|
| **Public** | Any user | Any user in guild | Search, get details, request research |
| **Verified** | User ID whitelist | Role: "Verified" | Add codes, subscribe |
| **Moderator** | User ID whitelist | Role: "Moderator" | Deactivate codes, view stats |
| **Admin** | Config ID | Role: "Admin" + Owner | Bulk import, manage users, all commands |

### 6.2 Auth Implementation

```typescript
// Telegram
const isAdmin = (userId: number) => 
  config.ADMIN_USER_IDS.includes(userId.toString());

// Discord  
const hasPermission = (member: GuildMember, permission: Permission) => {
  const roleMap = {
    add: ['Verified', 'Moderator', 'Admin'],
    deactivate: ['Moderator', 'Admin'],
    bulk: ['Admin'],
    admin: ['Admin']
  };
  return member.roles.cache.some(r => roleMap[permission].includes(r.name));
};
```

### 6.3 User Identification

```typescript
interface UserIdentity {
  platform: 'telegram' | 'discord';
  userId: string;
  username?: string;
  displayName: string;
  isAdmin: boolean;
  permissions: Permission[];
  createdAt: Date;
  lastActivity: Date;
}
```

---

## 7. Rate Limiting & Spam Protection

### 7.1 Rate Limit Configuration

| Platform | Limit | Window | Burst |
|----------|-------|--------|-------|
| Telegram | 30 messages | 60 seconds | 5 messages |
| Discord | 5 commands | 10 seconds | 2 commands |
| API calls | 100 requests | 60 seconds | 20 requests |

### 7.2 Rate Limiter Implementation

```typescript
class RateLimiter {
  private storage: KVNamespace;
  
  async checkLimit(
    userId: string, 
    action: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const key = `ratelimit:${userId}:${action}`;
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);
    
    // Get current count
    const data = await this.storage.get<{ count: number; resetAt: number }>(key, 'json');
    
    if (!data || data.resetAt < now) {
      // New window
      await this.storage.put(key, { count: 1, resetAt: now + (windowSeconds * 1000) });
      return { allowed: true, remaining: limit - 1, resetAt: new Date(now + (windowSeconds * 1000)) };
    }
    
    if (data.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: new Date(data.resetAt) };
    }
    
    // Increment count
    await this.storage.put(key, { ...data, count: data.count + 1 });
    return { allowed: true, remaining: limit - data.count - 1, resetAt: new Date(data.resetAt) };
  }
}
```

### 7.3 Spam Detection

```typescript
interface SpamDetector {
  // Check for repetitive commands
  detectRepetition(userId: string, command: string): boolean;
  
  // Check for suspicious patterns
  detectSuspiciousContent(content: string): {
    isSpam: boolean;
    reason?: string;
    confidence: number;
  };
  
  // Track conversation velocity
  checkVelocity(userId: string): boolean;
}

// Auto-mute after 3 spam violations
const SPAM_VIOLATIONS_THRESHOLD = 3;
const MUTE_DURATION_MINUTES = 30;
```

---

## 8. Message Formatting

### 8.1 Telegram (MarkdownV2)

```typescript
const formatTelegramMessage = (deal: Deal) => `
🎯 *${escapeMarkdown(deal.metadata.title)}*

🔗 [${escapeMarkdown(deal.domain)}](${escapeUrl(deal.url)})

🎁 *Reward:* ${escapeMarkdown(deal.reward.description || deal.reward.value)}
📊 *Confidence:* ${Math.round(deal.metadata.confidence_score * 100)}%
📅 *Added:* ${formatDate(deal.source.discovered_at)}

${deal.metadata.status === 'active' ? '✅ Active' : '⏳ Pending'}

\`Code: ${escapeMarkdown(deal.code)}\`
`;

// Escape helpers
const escapeMarkdown = (text: string) => 
  text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
```

### 8.2 Discord (Rich Embeds)

```typescript
const formatDiscordEmbed = (deal: Deal) => ({
  title: deal.metadata.title,
  url: deal.url,
  color: deal.metadata.status === 'active' ? 0x00ff00 : 0xffaa00,
  fields: [
    { name: '🎁 Reward', value: deal.reward.description || String(deal.reward.value), inline: true },
    { name: '📊 Confidence', value: `${Math.round(deal.metadata.confidence_score * 100)}%`, inline: true },
    { name: '🔗 Domain', value: deal.domain, inline: true },
    { name: '```Code```', value: `\`${deal.code}\``, inline: false },
  ],
  footer: { text: `Added: ${formatDate(deal.source.discovered_at)}` },
  timestamp: new Date().toISOString(),
});
```

### 8.3 Comparison Table

| Feature | Telegram | Discord |
|---------|----------|---------|
| Bold | `*text*` | `**text**` |
| Italic | `_text_` | `*text*` |
| Code | `` `code` `` | `` `code` `` |
| Code Block | ```` ``` ```` ```` ``` ```````` | ```` ``` ```` ```` ``` ```````` |
| Links | `[text](url)` | `[text](url)` |
| Embeds | Limited (buttons) | Rich (colors, fields, images) |
| Mentions | `@username` | `<@userId>` or `@username` |

---

## 9. Group vs Private Chat Handling

### 9.1 Telegram

| Feature | Private Chat | Group Chat |
|---------|--------------|------------|
| Commands | All commands | Limited set (search, stats) |
| Add Code | Yes | Admin only |
| Deactivate | Yes | Admin only |
| Research | Full flow | Quick search only |
| Inline Mode | N/A | Available (@botname query) |
| Notifications | Direct | Mention or reply |

**Group Command Whitelist**:
```typescript
const GROUP_ALLOWED_COMMANDS = [
  'search', 'get', 'stats', 'help', 'subscribe'
];
```

### 9.2 Discord

| Feature | DM | Guild Channel | Thread |
|---------|-----|---------------|--------|
| Commands | All | Role-based | Inherits parent |
| Slash Commands | Yes | Yes | Yes |
| Context Menus | No | Yes | Yes |
| Ephemeral Replies | Yes | Yes | Yes |
| Bulk Operations | Yes | Admin channels | No |

**Channel Configuration**:
```typescript
interface GuildConfig {
  guildId: string;
  allowedChannels: string[];
  adminChannels: string[];
  logChannel?: string;
  commandPrefix: string;
  features: {
    autoExtract: boolean;
    notifications: boolean;
    bulkImport: boolean;
  };
}
```

---

## 10. API Integration

### 10.1 Endpoint Mapping

| Bot Command | API Endpoint | Method | Notes |
|-------------|--------------|--------|-------|
| `/add` | `/api/submit` | POST | Converts to SubmitDealBody |
| `/search` | `/deals` | GET | Adds query params |
| `/get` | `/deals` + filter | GET | Filter by code |
| `/deactivate` | Internal storage | PUT | Calls `deactivateReferral()` |
| `/research` | `/api/discover` | POST | Triggers pipeline |
| `/stats` | `/deals.json` + `/metrics` | GET | Aggregates data |
| `/health` | `/health` | GET | System status |

### 10.2 API Client Implementation

```typescript
class BotAPIClient {
  private baseUrl: string;
  private apiKey?: string;
  
  constructor(env: BotEnv) {
    this.baseUrl = env.DEAL_API_URL;
    this.apiKey = env.DEAL_API_KEY;
  }
  
  async submitCode(input: ReferralInput): Promise<SubmissionResult> {
    const body: SubmitDealBody = {
      url: input.url,
      code: input.code,
      source: input.domain,
      metadata: {
        title: input.metadata.title,
        reward: {
          type: input.metadata.reward_type,
          value: input.metadata.reward_value,
          currency: input.metadata.currency,
        },
        category: input.metadata.category,
      },
    };
    
    return this.post('/api/submit', body);
  }
  
  async searchCodes(domain: string): Promise<Deal[]> {
    const response = await this.get('/deals', { 
      category: domain,
      limit: 100 
    });
    return response.filter(d => d.domain === domain);
  }
  
  async deactivateCode(
    code: string, 
    reason: string,
    userId: string
  ): Promise<DeactivationResult> {
    // Uses internal storage directly
    return this.put('/api/referrals/deactivate', {
      code,
      reason,
      deactivated_by: userId,
    });
  }
}
```

### 10.3 Error Handling

```typescript
const ERROR_RESPONSES: Record<string, string> = {
  '409': '⚠️ This code already exists in the system.',
  '400': '❌ Invalid request. Please check your input.',
  '429': '⏳ Rate limit exceeded. Please wait a moment.',
  '500': '🔧 System error. Our team has been notified.',
  '404': '🔍 No codes found matching your query.',
};

const handleAPIError = (error: APIError, platform: Platform): Response => {
  const message = ERROR_RESPONSES[error.status] || 'An unexpected error occurred.';
  
  if (platform === 'discord') {
    return {
      content: message,
      ephemeral: true,
    };
  }
  
  return { text: message };
};
```

---

## 11. Sample Interactions

### 11.1 New User Discovery Flow

```
[Private Chat - Telegram]

User: /start
Bot: 👋 Welcome to DealRelay Bot!
...

User: /search crypto
Bot: 🔍 Found 15 active codes in 'crypto' category:

Top 3:
1. Coinbase: FREEBTC → $10 in BTC
2. Binance: NEWUSER50 → 50% fee discount
3. Kraken: REF2024 → $20 credit

[View All 15] [Search Again] [Subscribe to Crypto]

User: [View All 15]
Bot: [Paginated list with buttons]

User: /get FREEBTC
Bot: [Detailed view]

User: /subscribe crypto
Bot: 🔔 You're now subscribed to crypto deals!
...
```

### 11.2 Admin Management Flow

```
[Discord Guild - #admin-channel]

Admin: /bulk-add
Bot: 📁 Please upload your import file (JSON/CSV)

Admin: [uploads new_codes.json]
Bot: 📄 Parsing new_codes.json...

Validation Results:
✅ 45 valid codes
⚠️ 3 duplicates (will be skipped)
❌ 2 invalid URLs

[Preview Duplicates] [Proceed with 45] [Cancel]

Admin: [Proceed with 45]
Bot: ⏳ Importing 45 codes...

✅ Import Complete!
Added: 45 codes
Skipped: 3 duplicates
Failed: 2 invalid

All codes are now pending validation.
ETA: 5-10 minutes until active.
```

### 11.3 Group Chat Interaction

```
[Telegram Group - @DealSharing]

User1: Anyone have a Trading 212 code?
User2: @DealRelayBot trading212.com
Bot: 🔍 Found 3 active codes for trading212.com:

1. GcCOCxbo - Free share up to £100
2. SHARE2024 - £20 bonus
3. INVESTNOW - £10 starter bonus

[Get GcCOCxbo] [View All] [Add New Code]

User1: Thanks!
[Click: Get GcCOCxbo]
Bot: 📋 Code: GcCOCxbo
🔗 URL: https://trading212.com/invite/GcCOCxbo
🎁 Reward: Free share worth up to £100

(Copied to your clipboard!)
```

---

## 12. Pros and Cons Summary

### 12.1 Telegram Bot

**Pros:**
- ✅ Simple to implement with Telegraf
- ✅ Built-in command parsing and middleware
- ✅ Inline mode for quick searches
- ✅ Broad user adoption globally
- ✅ Native mobile experience
- ✅ Low latency for notifications
- ✅ Easy to share bot via username

**Cons:**
- ❌ Limited rich formatting (no embeds)
- ❌ Less granular permission system
- ❌ No native slash command UI
- ❌ Group management is limited
- ❌ File handling is less robust
- ❌ Markdown escaping complexity

**Best For:**
- Quick, mobile-first interactions
- Broad public access
- Simple command flows
- Global reach

### 12.2 Discord Bot

**Pros:**
- ✅ Rich embeds with colors and fields
- ✅ Native slash commands with UI
- ✅ Role-based permission system
- ✅ Thread support for conversations
- ✅ Better file handling
- ✅ Context menus (right-click actions)
- ✅ Ephemeral replies (private in public)
- ✅ Webhook integration for notifications

**Cons:**
- ❌ More complex setup
- ❌ Discord-specific terminology learning curve
- ❌ Guild-centric (requires server membership)
- ❌ Higher rate limit complexity
- ❌ More verbose code
- ❌ Less mobile-optimized than Telegram

**Best For:**
- Admin/management interfaces
- Community features
- Rich data presentation
- Permission-sensitive operations

### 12.3 Hybrid Approach Recommendation

**Recommended Architecture:**
```
Shared Core Logic
├─ Telegram Bot (Public Access)
│  ├─ Search codes
│  ├─ View details
│  ├─ Request research
│  └─ Subscribe to notifications
│
└─ Discord Bot (Admin + Community)
   ├─ Full admin controls
   ├─ Bulk operations
   ├─ Rich reporting
   ├─ Community features
   └─ Audit logging
```

---

## 13. Implementation Roadmap

### Phase 1: Core Telegram Bot (Week 1-2)
- [ ] Set up Telegraf project structure
- [ ] Implement `/search`, `/get`, `/help`
- [ ] Basic API integration
- [ ] Rate limiting
- [ ] Error handling

### Phase 2: Advanced Features (Week 3)
- [ ] Interactive `/add` flow
- [ ] `/research` command
- [ ] `/subscribe` notifications
- [ ] Inline mode
- [ ] Group chat support

### Phase 3: Discord Bot (Week 4-5)
- [ ] Set up discord.js project
- [ ] Slash command registration
- [ ] Rich embed formatting
- [ ] Role-based permissions
- [ ] Admin features

### Phase 4: Polish & Integration (Week 6)
- [ ] Shared state management
- [ ] Notification system
- [ ] Analytics/logging
- [ ] Documentation
- [ ] Testing

---

## 14. Configuration

### 14.1 Environment Variables

```bash
# Shared
DEAL_API_URL=https://your-worker.workers.dev
DEAL_API_KEY=your-api-key

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234...
TELEGRAM_ADMIN_IDS=123456789,987654321
TELEGRAM_WEBHOOK_URL=https://your-bot.workers.dev/telegram

# Discord
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id
DISCORD_GUILD_ID=your-guild-id
DISCORD_ADMIN_ROLES=Admin,Moderator
DISCORD_ALLOWED_CHANNELS=deals,admin

# Rate Limiting
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60

# Notifications
NOTIFICATION_CHANNEL=deals-alerts
```

### 14.2 Bot Configuration Schema

```typescript
interface BotConfig {
  features: {
    telegram: {
      enabled: boolean;
      publicCommands: string[];
      adminCommands: string[];
      inlineMode: boolean;
    };
    discord: {
      enabled: boolean;
      slashCommands: boolean;
      contextMenus: boolean;
      ephemeralErrors: boolean;
    };
  };
  
  permissions: {
    public: string[];
    verified: string[];
    moderator: string[];
    admin: string[];
  };
  
  limits: {
    maxCodesPerBulk: number;
    maxSearchResults: number;
    researchTimeoutSeconds: number;
  };
}
```

---

## 15. Security Considerations

### 15.1 Input Validation
```typescript
// Command validation
const validateCode = (code: string): boolean => {
  // Max 100 chars, alphanumeric + some symbols
  return /^[a-zA-Z0-9_-]{1,100}$/.test(code);
};

const validateUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};
```

### 15.2 Secrets Management
- Bot tokens stored in Cloudflare Secrets Store
- API keys rotated monthly
- Webhook endpoints verified with signatures
- No sensitive data in logs

### 15.3 Audit Logging
```typescript
interface AuditLog {
  timestamp: string;
  userId: string;
  platform: 'telegram' | 'discord';
  action: string;
  target?: string;
  result: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}
```

---

## 16. Testing Strategy

### 16.1 Unit Tests
- Command parsing
- Message formatting
- Rate limiting logic
- API client methods

### 16.2 Integration Tests
- End-to-end flows
- API error handling
- Rate limit behavior
- Webhook processing

### 16.3 Load Testing
- Concurrent user simulation
- Rate limit stress tests
- Memory leak detection

---

## Appendix A: File Structure

```
bot/
├── src/
│   ├── telegram/
│   │   ├── bot.ts
│   │   ├── commands/
│   │   │   ├── search.ts
│   │   │   ├── add.ts
│   │   │   └── ...
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── rateLimit.ts
│   │   └── formatters/
│   │       └── markdown.ts
│   ├── discord/
│   │   ├── bot.ts
│   │   ├── commands/
│   │   │   ├── search.ts
│   │   │   └── ...
│   │   ├── handlers/
│   │   └── formatters/
│   │       └── embeds.ts
│   ├── shared/
│   │   ├── api-client.ts
│   │   ├── state-manager.ts
│   │   ├── types.ts
│   │   └── validators.ts
│   └── index.ts
├── tests/
├── wrangler.toml
└── package.json
```

## Appendix B: API Extensions Needed

The following endpoints would need to be added to the existing DealRelay API:

```typescript
// POST /api/referrals/deactivate
// Body: { code, reason, deactivated_by }

// POST /api/research
// Body: { domain, depth, sources }

// POST /api/subscriptions
// Body: { user_id, platform, domain?, action: 'subscribe' | 'unsubscribe' }

// GET /api/subscriptions/:user_id
// Returns: Subscription[]
```

---

**Document End**
