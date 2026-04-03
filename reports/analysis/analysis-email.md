# Email Integration System for Referral Code Management

## Executive Summary

This document outlines the design for an email-based system that allows users to manage referral codes through email interactions. The system prioritizes automation, security, and hands-off operation while supporting multiple email providers and formats.

---

## 1. System Architecture

### 1.1 High-Level Flow

```
User Email → Inbound Handler → Parser → Extractor → Validator → Storage
                                              ↓
                                         Auto-Reply
                                              ↓
                                        Confirmation
```

### 1.2 Core Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Inbound Handler** | Receive emails via IMAP/Webhook | Cloudflare Email Workers / IMAP client |
| **Command Parser** | Parse structured commands | Regex + NLP patterns |
| **Content Extractor** | Pull referral codes from forwarded emails | Service-specific parsers |
| **Security Validator** | DKIM, SPF, spam filtering | Built-in + custom rules |
| **Storage** | Persist extracted codes | D1 database |
| **Digest Engine** | Generate periodic summaries | Scheduled Worker |
| **Auto-Reply** | Send confirmations | SMTP/Email API |

### 1.3 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INBOUND EMAIL                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   Command    │    │   Forwarded  │    │    Digest    │                  │
│  │    Email     │    │    Email     │    │   Request    │                  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                  │
│         │                   │                   │                           │
│         ▼                   ▼                   ▼                           │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │              SECURITY VALIDATION LAYER                 │               │
│  │  • DKIM signature verification                         │               │
│  │  • SPF record check                                   │               │
│  │  • Sender whitelist/blacklist                         │               │
│  │  • Rate limiting per sender                           │               │
│  └────────────────────┬──────────────────────────────────┘               │
│                       │                                                     │
│                       ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │                 PARSING ENGINE                          │               │
│  │  • Extract structured commands (ADD, DEACTIVATE)     │               │
│  │  • Parse forwarded referral emails                     │               │
│  │  • Identify service type and code format               │               │
│  └────────────────────┬──────────────────────────────────┘               │
│                       │                                                     │
│                       ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │              PROCESSING PIPELINE                        │               │
│  │  • Execute commands on user database                   │               │
│  │  • Extract and normalize referral codes                │               │
│  │  • Enrich with metadata (expiration, service)        │               │
│  └────────────────────┬──────────────────────────────────┘               │
│                       │                                                     │
│                       ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │              RESPONSE & STORAGE                         │               │
│  │  • Save to D1 database                                 │               │
│  │  • Send confirmation email                             │               │
│  │  • Queue digest generation                             │               │
│  └─────────────────────────────────────────────────────────┘               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Email Parsing Strategies

### 2.1 Inbound Reception Options

#### Option A: Cloudflare Email Workers (Recommended)
```javascript
// wrangler.toml
[email]
address = "referrals@do-deal.app"

// worker.js
export default {
  async email(message, env, ctx) {
    const rawEmail = await message.text();
    const parsed = await parseEmail(rawEmail);
    
    // Process based on type
    if (isCommandEmail(parsed)) {
      await handleCommand(parsed, env);
    } else if (isForwardedEmail(parsed)) {
      await extractReferral(parsed, env);
    }
    
    // Send confirmation
    await sendConfirmation(message.from, parsed);
  }
};
```

**Pros**: Serverless, built-in DKIM/SPF, no infrastructure
**Cons**: Cloudflare-specific, limited to their email routing

#### Option B: IMAP Polling (Self-Hosted)
```javascript
// Using imap-simple library
const imaps = require('imap-simple');

async function pollInbox() {
  const connection = await imaps.connect({
    imap: {
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASSWORD,
      host: 'imap.gmail.com',
      port: 993,
      tls: true
    }
  });
  
  await connection.openBox('INBOX');
  const messages = await connection.search(['UNSEEN'], {
    bodies: ['HEADER', 'TEXT'],
    markSeen: true
  });
  
  for (const message of messages) {
    await processEmail(message);
  }
}
```

**Pros**: Works with any provider, full control
**Cons**: Requires polling infrastructure, more complex

#### Option C: Webhook (Third-Party Services)
```javascript
// Using services like SendGrid, Mailgun, AWS SES
// POST /webhook/inbound
export async function handleWebhook(request, env) {
  const payload = await request.json();
  
  // Verify webhook signature
  if (!verifyWebhookSignature(payload, env.WEBHOOK_SECRET)) {
    return new Response('Invalid signature', { status: 401 });
  }
  
  const email = normalizeWebhookPayload(payload);
  await processEmail(email, env);
  
  return new Response('OK', { status: 200 });
}
```

**Pros**: Real-time, scalable, reliable delivery
**Cons**: Third-party dependency, potential costs

### 2.2 Email Parsing Libraries

| Library | Platform | Strengths |
|---------|----------|-----------|
| `mailparser` | Node.js | Robust MIME parsing, attachments |
| `postal-mime` | Cloudflare Workers | Lightweight, Workers-compatible |
| `emailjs-mime-parser` | Browser/Worker | Fast, streaming capable |
| `mailgun-js` | Node.js | Native Mailgun integration |

Recommended for Cloudflare Workers:
```javascript
import PostalMime from 'postal-mime';

async function parseEmail(rawEmail) {
  const parser = new PostalMime();
  const parsed = await parser.parse(rawEmail);
  
  return {
    from: parsed.from.address,
    to: parsed.to.map(t => t.address),
    subject: parsed.subject,
    text: parsed.text,
    html: parsed.html,
    attachments: parsed.attachments,
    headers: parsed.headers
  };
}
```

---

## 3. Command Email Formats

### 3.1 Command Structure

Commands are triggered by special email addresses or subject line prefixes:

```
To: add@referrals.do-deal.app
Subject: [Optional] Service Name

Body:
Service: Dropbox
Code: REF12345
Link: https://db.tt/abc123
Expires: 2026-06-01
Notes: 500MB bonus
```

Or via subject prefix:

```
To: referrals@do-deal.app
Subject: ADD: Dropbox referral code REF12345

Body:
[Code details or leave blank]
```

### 3.2 Available Commands

#### ADD - Add Referral Code

**Format 1: Dedicated Address**
```
To: add@referrals.do-deal.app
Subject: Dropbox referral

Service: Dropbox
Code: REF123456
Referral URL: https://db.tt/abc123
Reward: 500MB storage each
Expiry: 2026-12-31
Category: Cloud Storage
```

**Format 2: Subject Prefix**
```
To: referrals@do-deal.app
Subject: ADD Dropbox REF123456

https://db.tt/abc123
Expires: Dec 31, 2026
```

**Format 3: Natural Language**
```
To: referrals@do-deal.app
Subject: New Dropbox referral

I have a Dropbox referral code: REF123456
The link is https://db.tt/abc123
It gives 500MB extra storage and expires end of year.
```

#### DEACTIVATE - Mark Code Inactive

```
To: deactivate@referrals.do-deal.app
Subject: Dropbox REF123456

Reason: Code expired
```

Or:
```
To: referrals@do-deal.app
Subject: DEACTIVATE Dropbox REF123456
```

#### SEARCH - Query Referrals

```
To: search@referrals.do-deal.app
Subject: Cloud storage referrals

Query: cloud storage
Status: active
Category: storage
```

Response:
```
From: referrals@do-deal.app
Subject: Search Results: 3 referrals found

Active Referral Codes - Cloud Storage:

1. Dropbox
   Code: REF123456
   Link: https://db.tt/abc123
   Reward: 500MB storage
   Status: Active

2. Google One
   Code: GOOGLE789
   Link: https://one.google.com/share/xyz
   Reward: 10% off
   Status: Active

[Reply to this email with USE <number> to get details]
```

#### DIGEST - Request Summary

```
To: digest@referrals.do-deal.app
Subject: Weekly summary

Frequency: weekly
Format: detailed
```

Or set up automatic digests:
```
To: preferences@referrals.do-deal.app
Subject: Auto-digest settings

Daily digest: 8:00 AM
Weekly digest: Monday 9:00 AM
Include: new, expiring-soon, popular
```

### 3.3 Command Parser Implementation

```typescript
// command-parser.ts
interface ParsedCommand {
  type: 'ADD' | 'DEACTIVATE' | 'SEARCH' | 'DIGEST' | 'HELP' | 'UNKNOWN';
  service?: string;
  code?: string;
  referralUrl?: string;
  expiry?: Date;
  reward?: string;
  category?: string;
  status?: 'active' | 'inactive' | 'all';
  query?: string;
  reason?: string;
  frequency?: 'daily' | 'weekly' | 'monthly';
}

function parseCommand(email: ParsedEmail): ParsedCommand {
  // Check recipient address first
  const commandFromAddress = parseCommandFromAddress(email.to[0]);
  if (commandFromAddress) {
    return commandFromAddress;
  }
  
  // Check subject line prefix
  const commandFromSubject = parseCommandFromSubject(email.subject);
  if (commandFromSubject) {
    return { ...commandFromSubject, ...parseBodyForDetails(email) };
  }
  
  // Try natural language parsing
  return parseNaturalLanguage(email);
}

function parseCommandFromAddress(address: string): ParsedCommand | null {
  const commandMap: Record<string, ParsedCommand['type']> = {
    'add@': 'ADD',
    'deactivate@': 'DEACTIVATE',
    'search@': 'SEARCH',
    'digest@': 'DIGEST',
    'help@': 'HELP'
  };
  
  for (const [prefix, type] of Object.entries(commandMap)) {
    if (address.startsWith(prefix)) {
      return { type };
    }
  }
  
  return null;
}

function parseCommandFromSubject(subject: string): Partial<ParsedCommand> {
  const patterns = [
    { regex: /^ADD\s+(\w+)\s*(\w*)/i, type: 'ADD' as const },
    { regex: /^DEACTIVATE\s+(\w+)\s*(\w*)/i, type: 'DEACTIVATE' as const },
    { regex: /^SEARCH\s+(.*)/i, type: 'SEARCH' as const },
    { regex: /^DIGEST/i, type: 'DIGEST' as const }
  ];
  
  for (const pattern of patterns) {
    const match = subject.match(pattern.regex);
    if (match) {
      return {
        type: pattern.type,
        service: match[1] || undefined,
        code: match[2] || undefined,
        query: match[1] || undefined
      };
    }
  }
  
  return { type: 'UNKNOWN' };
}

function parseBodyForDetails(email: ParsedEmail): Partial<ParsedCommand> {
  const text = email.text || '';
  
  return {
    service: extractField(text, /(?:Service|Company|App):\s*(.+)/i),
    code: extractField(text, /(?:Code|Referral Code|Invite Code):\s*(\S+)/i),
    referralUrl: extractField(text, /(?:Link|URL|Referral Link):\s*(\S+)/i),
    expiry: parseDate(extractField(text, /(?:Expiry|Expires|Valid Until):\s*(.+)/i)),
    reward: extractField(text, /(?:Reward|Bonus|Benefit):\s*(.+)/i),
    category: extractField(text, /(?:Category|Type):\s*(.+)/i),
    reason: extractField(text, /(?:Reason|Note):\s*(.+)/i)
  };
}
```

---

## 4. Referral Email Extraction Patterns

### 4.1 Service-Specific Parsers

#### Dropbox
```javascript
const dropboxPatterns = {
  sender: /@dropbox\.com$/,
  subject: /(invited you to join|get extra space|referral bonus)/i,
  code: {
    inUrl: /db\.tt\/(\w+)/,
    inBody: /(?:code|invite)\s*[:\-]?\s*(\w{6,})/i
  },
  reward: /(\d+(?:\.\d+)?\s*(?:GB|MB|space))/i,
  expiry: /(?:expires?|valid until)\s*[:\-]?\s*(.+)/i
};
```

#### Uber
```javascript
const uberPatterns = {
  sender: /@uber\.com$/,
  subject: /(free ride|invite|referral)/i,
  code: {
    inUrl: /uber\.com\/invite\/(\w+)/,
    inBody: /(?:promo code|invite code)\s*[:\-]?\s*(\w+)/i
  },
  reward: /(\$?\d+\s*(?:ride|credit|off))/i,
  expiry: /(?:valid until|expires?)\s*[:\-]?\s*(.+)/i
};
```

#### Airbnb
```javascript
const airbnbPatterns = {
  sender: /@airbnb\.com$/,
  subject: /(invite|credit|referral)/i,
  code: {
    inUrl: /airbnb\.com\/c\/(\w+)/,
    inBody: /(?:join with code|use code)\s*[:\-]?\s*(\w+)/i
  },
  reward: /(\$?\d+\s*(?:credit|off|discount))/i,
  expiry: /(?:expires?|valid until)\s*[:\-]?\s*(.+)/i
};
```

#### Generic Pattern
```javascript
const genericPatterns = {
  // Common referral keywords in subject
  subjectKeywords: /\b(referral|invite|bonus|credit|discount|promo|code|earn|get|free)\b/gi,
  
  // URL patterns for referral links
  referralUrls: [
    /(?:refer|invite|share)\/([a-zA-Z0-9_-]+)/,
    /r\/([a-zA-Z0-9_-]+)/,
    /ref\/([a-zA-Z0-9_-]+)/,
    /([a-zA-Z0-9_-]{6,20})\.(?:html|php)?/,
    /[?&](?:ref|referral|invite|code)=([a-zA-Z0-9_-]+)/
  ],
  
  // Code patterns in body text
  codePatterns: [
    /(?:code|promo|coupon)\s*[:\-]?\s*["']?([A-Z0-9]{4,20})/i,
    /(?:use|enter|apply)\s+code\s+["']?([A-Z0-9]{4,20})/i,
    /(?:your|my)\s+(?:referral|invite)\s+code\s*[:\-]?\s*["']?([A-Z0-9]{4,20})/i
  ],
  
  // Reward extraction
  rewardPatterns: [
    /(\$?\d+(?:\.\d+)?\s*(?:off|credit|discount|bonus))/i,
    /(\d+\s*(?:GB|MB|%|percent|days?|months?))/i,
    /(?:earn|get|receive)\s+(.+?)(?:when|if|by)/i
  ]
};
```

### 4.2 Extraction Engine

```typescript
// extraction-engine.ts
interface ExtractionResult {
  service: string;
  code: string | null;
  referralUrl: string | null;
  reward: string | null;
  expiry: Date | null;
  confidence: number;
  method: 'service-specific' | 'generic' | 'manual';
}

async function extractReferralCode(
  email: ParsedEmail,
  servicePatterns: Record<string, ServicePattern>
): Promise<ExtractionResult> {
  // Try service-specific parser first
  for (const [service, pattern] of Object.entries(servicePatterns)) {
    if (matchesPattern(email, pattern)) {
      const result = extractWithPattern(email, pattern);
      if (result.code || result.referralUrl) {
        return { ...result, service, confidence: 0.9, method: 'service-specific' };
      }
    }
  }
  
  // Fall back to generic extraction
  const genericResult = extractGeneric(email);
  if (genericResult.code || genericResult.referralUrl) {
    return { 
      ...genericResult, 
      service: detectService(email), 
      confidence: 0.6, 
      method: 'generic' 
    };
  }
  
  // Last resort: ask user for manual input
  return {
    service: detectService(email),
    code: null,
    referralUrl: null,
    reward: null,
    expiry: null,
    confidence: 0,
    method: 'manual'
  };
}

function extractWithPattern(email: ParsedEmail, pattern: ServicePattern): Partial<ExtractionResult> {
  const text = email.text || '';
  const html = email.html || '';
  
  // Extract code from URL
  let code = null;
  let referralUrl = null;
  
  // Find all URLs in email
  const urls = extractUrls(text + ' ' + html);
  
  for (const url of urls) {
    for (const [type, regex] of Object.entries(pattern.code)) {
      if (type === 'inUrl') {
        const match = url.match(regex);
        if (match) {
          code = match[1];
          referralUrl = url;
          break;
        }
      }
    }
  }
  
  // If not found in URL, search body
  if (!code) {
    const bodyMatch = text.match(pattern.code.inBody) || html.match(pattern.code.inBody);
    if (bodyMatch) {
      code = bodyMatch[1];
    }
  }
  
  // Extract reward
  const rewardMatch = text.match(pattern.reward) || html.match(pattern.reward);
  
  // Extract expiry
  const expiryMatch = text.match(pattern.expiry) || html.match(pattern.expiry);
  
  return {
    code,
    referralUrl,
    reward: rewardMatch ? rewardMatch[1] : null,
    expiry: expiryMatch ? parseDate(expiryMatch[1]) : null
  };
}

function extractGeneric(email: ParsedEmail): Partial<ExtractionResult> {
  const text = email.text || '';
  const html = email.html || '';
  const combined = text + ' ' + html;
  
  let code = null;
  let referralUrl = null;
  
  // Search for referral URLs
  const urls = extractUrls(combined);
  for (const url of urls) {
    for (const regex of genericPatterns.referralUrls) {
      const match = url.match(regex);
      if (match) {
        referralUrl = url;
        code = match[1];
        break;
      }
    }
  }
  
  // Search for codes in text
  if (!code) {
    for (const regex of genericPatterns.codePatterns) {
      const match = combined.match(regex);
      if (match) {
        code = match[1];
        break;
      }
    }
  }
  
  // Extract reward
  let reward = null;
  for (const regex of genericPatterns.rewardPatterns) {
    const match = combined.match(regex);
    if (match) {
      reward = match[1];
      break;
    }
  }
  
  return { code, referralUrl, reward, expiry: null };
}
```

### 4.3 Service Pattern Registry

```typescript
// service-patterns.ts
export const servicePatterns: Record<string, ServicePattern> = {
  dropbox: {
    sender: /@dropbox\.com$/i,
    subject: /(invited you to join|get extra space|referral bonus|invite friends)/i,
    code: {
      inUrl: /db\.tt\/([a-zA-Z0-9]+)/i,
      inBody: /(?:invite code|referral code)\s*[:\-]?\s*([a-zA-Z0-9]+)/i
    },
    reward: /(\d+(?:\.\d+)?\s*(?:GB|MB|space))/i,
    expiry: /(?:expires?|valid until)\s*[:\-]?\s*(.+)/i,
    serviceName: 'Dropbox',
    category: 'cloud_storage'
  },
  
  google_one: {
    sender: /@google\.com$/i,
    subject: /(google one|storage plan|share storage)/i,
    code: {
      inUrl: /one\.google\.com\/share\/([a-zA-Z0-9_-]+)/i,
      inBody: /(?:code|promo)\s*[:\-]?\s*([A-Z0-9]+)/i
    },
    reward: /(\d+\s*(?:GB|TB|storage))/i,
    expiry: /(?:until|before|by)\s+(.+)/i,
    serviceName: 'Google One',
    category: 'cloud_storage'
  },
  
  uber: {
    sender: /@uber\.com$/i,
    subject: /(free ride|invite|referral|credit)/i,
    code: {
      inUrl: /uber\.com\/invite\/([a-zA-Z0-9]+)/i,
      inBody: /(?:promo code|invite code|your code)\s*[:\-]?\s*([a-zA-Z0-9]+)/i
    },
    reward: /(\$?\d+\s*(?:ride|credit|off))/i,
    expiry: /(?:valid until|expires?)\s*[:\-]?\s*(.+)/i,
    serviceName: 'Uber',
    category: 'transportation'
  },
  
  lyft: {
    sender: /@lyft\.com$/i,
    subject: /(free ride|credit|invite|referral)/i,
    code: {
      inUrl: /lyft\.com\/i\/([a-zA-Z0-9]+)/i,
      inBody: /(?:code|promo)\s*[:\-]?\s*([a-zA-Z0-9]+)/i
    },
    reward: /(\$?\d+\s*(?:ride|credit|off))/i,
    expiry: /(?:expires?|valid until)\s*[:\-]?\s*(.+)/i,
    serviceName: 'Lyft',
    category: 'transportation'
  },
  
  airbnb: {
    sender: /@airbnb\.com$/i,
    subject: /(invite|credit|referral|travel)/i,
    code: {
      inUrl: /airbnb\.com\/c\/([a-zA-Z0-9]+)/i,
      inBody: /(?:join with|use code)\s*[:\-]?\s*([a-zA-Z0-9]+)/i
    },
    reward: /(\$?\d+\s*(?:credit|off|toward))/i,
    expiry: /(?:expires?|book by|travel by)\s*[:\-]?\s*(.+)/i,
    serviceName: 'Airbnb',
    category: 'travel'
  },
  
  robinhood: {
    sender: /@robinhood\.com$/i,
    subject: /(free stock|invite|referral|join robinhood)/i,
    code: {
      inUrl: /join\.robinhood\.com\/([a-zA-Z0-9]+)/i,
      inBody: /(?:code)\s*[:\-]?\s*([a-zA-Z0-9]+)/i
    },
    reward: /(free stock|\$?\d+.*stock)/i,
    expiry: null, // Usually no expiry
    serviceName: 'Robinhood',
    category: 'finance'
  },
  
  rakuten: {
    sender: /@rakuten\.com$/i,
    subject: /(cash back|invite|referral|bonus)/i,
    code: {
      inUrl: /rakuten\.com\/r\/([a-zA-Z0-9]+)/i,
      inBody: /(?:code|invite)\s*[:\-]?\s*([a-zA-Z0-9]+)/i
    },
    reward: /(\$?\d+\s*(?:bonus|cash back))/i,
    expiry: /(?:expires?|valid until)\s*[:\-]?\s*(.+)/i,
    serviceName: 'Rakuten',
    category: 'shopping'
  },
  
  // Add more services...
};
```

---

## 5. Integration Approach

### 5.1 Cloudflare Email Workers Implementation

```typescript
// worker.ts - Main email handler
export interface Env {
  REFERRAL_DB: D1Database;
  EMAIL_QUEUE: Queue;
  DKIM_PUBLIC_KEY: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    // 1. Security validation
    const securityResult = await validateSecurity(message, env);
    if (!securityResult.valid) {
      await sendErrorReply(message.from, securityResult.reason);
      return;
    }
    
    // 2. Parse email
    const rawEmail = await message.raw();
    const parsedEmail = await parseEmail(rawEmail);
    
    // 3. Determine email type and process
    const command = parseCommand(parsedEmail);
    
    switch (command.type) {
      case 'ADD':
        await handleAddCommand(command, parsedEmail, env);
        break;
      case 'DEACTIVATE':
        await handleDeactivateCommand(command, env);
        break;
      case 'SEARCH':
        await handleSearchCommand(command, parsedEmail.from, env);
        break;
      case 'DIGEST':
        await handleDigestCommand(command, parsedEmail.from, env);
        break;
      case 'FORWARDED':
        await handleForwardedEmail(parsedEmail, env);
        break;
      default:
        await handleUnknownEmail(parsedEmail, env);
    }
  }
};

async function handleForwardedEmail(
  email: ParsedEmail, 
  env: Env
): Promise<void> {
  // Extract referral code from forwarded content
  const extraction = await extractReferralCode(email, servicePatterns);
  
  if (extraction.confidence === 0) {
    // Low confidence - queue for manual review
    await env.EMAIL_QUEUE.send({
      type: 'manual_review',
      email: email,
      reason: 'Could not extract referral code'
    });
    
    await sendReply(email.from, {
      subject: 'Referral Code Extraction Failed',
      body: `We couldn't automatically extract a referral code from your forwarded email.

Please reply with:
- Service name
- Referral code or link
- Expiry date (if known)

Original email subject: ${email.subject}`
    });
    return;
  }
  
  // Save to database
  const userId = await getUserIdFromEmail(email.from, env);
  
  await env.REFERRAL_DB.prepare(`
    INSERT INTO referrals (user_id, service, code, referral_url, reward, expiry, source, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    userId,
    extraction.service,
    extraction.code,
    extraction.referralUrl,
    extraction.reward,
    extraction.expiry?.toISOString(),
    'email_forward',
    extraction.confidence
  ).run();
  
  // Send confirmation
  await sendReply(email.from, {
    subject: `✓ Added: ${extraction.service} Referral`,
    body: `Successfully extracted and saved your referral code:

Service: ${extraction.service}
${extraction.code ? `Code: ${extraction.code}` : ''}
${extraction.referralUrl ? `Link: ${extraction.referralUrl}` : ''}
${extraction.reward ? `Reward: ${extraction.reward}` : ''}
${extraction.expiry ? `Expires: ${extraction.expiry.toDateString()}` : ''}

Confidence: ${Math.round(extraction.confidence * 100)}%

Reply with DEACTIVATE to mark this code as inactive.`
  });
}

async function handleAddCommand(
  command: ParsedCommand,
  email: ParsedEmail,
  env: Env
): Promise<void> {
  const userId = await getUserIdFromEmail(email.from, env);
  
  // Validate required fields
  if (!command.service) {
    await sendReply(email.from, {
      subject: 'Missing Service Name',
      body: `Please specify the service name in your email body:

Service: [Service Name]
Code: [Your Code]
Link: [Referral URL]`
    });
    return;
  }
  
  // Insert into database
  await env.REFERRAL_DB.prepare(`
    INSERT INTO referrals (user_id, service, code, referral_url, reward, expiry, category, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'email_command', datetime('now'))
  `).bind(
    userId,
    command.service,
    command.code,
    command.referralUrl,
    command.reward,
    command.expiry?.toISOString(),
    command.category
  ).run();
  
  await sendReply(email.from, {
    subject: `✓ Added: ${command.service}`,
    body: `Your referral code has been added successfully!

Service: ${command.service}
${command.code ? `Code: ${command.code}` : ''}
${command.referralUrl ? `Link: ${command.referralUrl}` : ''}
${command.reward ? `Reward: ${command.reward}` : ''}
${command.expiry ? `Expires: ${command.expiry.toDateString()}` : ''}
${command.category ? `Category: ${command.category}` : ''}`
  });
}

async function sendReply(to: string, message: { subject: string; body: string }): Promise<void> {
  // Using Cloudflare Email Workers reply capability
  // Or integrate with external email service (SendGrid, Mailgun)
}
```

### 5.2 Security Validation

```typescript
// security-validator.ts
interface SecurityResult {
  valid: boolean;
  reason?: string;
  spamScore?: number;
}

async function validateSecurity(
  message: ForwardableEmailMessage,
  env: Env
): Promise<SecurityResult> {
  // 1. DKIM verification
  const dkimValid = await verifyDKIM(message);
  if (!dkimValid) {
    return { valid: false, reason: 'DKIM verification failed' };
  }
  
  // 2. SPF check
  const spfValid = await verifySPF(message);
  if (!spfValid) {
    return { valid: false, reason: 'SPF check failed' };
  }
  
  // 3. Sender whitelist check
  const sender = message.from;
  const isWhitelisted = await isSenderAllowed(sender, env);
  if (!isWhitelisted) {
    return { valid: false, reason: 'Sender not in whitelist' };
  }
  
  // 4. Rate limiting
  const rateLimitOk = await checkRateLimit(sender, env);
  if (!rateLimitOk) {
    return { valid: false, reason: 'Rate limit exceeded' };
  }
  
  // 5. Spam scoring
  const spamScore = await calculateSpamScore(message);
  if (spamScore > 0.7) {
    return { valid: false, reason: 'High spam probability', spamScore };
  }
  
  return { valid: true, spamScore };
}

async function verifyDKIM(message: ForwardableEmailMessage): Promise<boolean> {
  // Cloudflare Workers provide built-in DKIM verification
  // For other platforms, use dkim-verifier library
  try {
    const headers = message.headers;
    const dkimSignature = headers.get('DKIM-Signature');
    if (!dkimSignature) return false;
    
    // Verify signature against public key
    // Implementation depends on platform
    return true; // Placeholder
  } catch (error) {
    return false;
  }
}

async function isSenderAllowed(sender: string, env: Env): Promise<boolean> {
  // Check if sender is registered user
  const result = await env.REFERRAL_DB.prepare(
    'SELECT id FROM users WHERE email = ? AND email_verified = 1'
  ).bind(sender).first();
  
  return result !== null;
}

async function checkRateLimit(sender: string, env: Env): Promise<boolean> {
  // Use KV or D1 for rate limiting
  const key = `ratelimit:${sender}:${new Date().toISOString().split('T')[0]}`;
  
  // Check count
  const count = await env.RATE_LIMIT_KV.get(key);
  const currentCount = count ? parseInt(count) : 0;
  
  if (currentCount >= 50) { // 50 emails per day
    return false;
  }
  
  // Increment counter
  await env.RATE_LIMIT_KV.put(key, (currentCount + 1).toString(), {
    expirationTtl: 86400 // 24 hours
  });
  
  return true;
}
```

### 5.3 Digest Generation

```typescript
// digest-generator.ts
export async function generateDigest(
  userId: string,
  frequency: 'daily' | 'weekly',
  env: Env
): Promise<string> {
  // Get user's referrals
  const since = frequency === 'daily' 
    ? '1 day' 
    : '7 days';
  
  const { results } = await env.REFERRAL_DB.prepare(`
    SELECT * FROM referrals 
    WHERE user_id = ? 
    AND created_at >= datetime('now', '-${since}')
    ORDER BY created_at DESC
  `).bind(userId).all();
  
  // Get expiring soon
  const { results: expiring } = await env.REFERRAL_DB.prepare(`
    SELECT * FROM referrals 
    WHERE user_id = ? 
    AND status = 'active'
    AND expiry <= datetime('now', '+7 days')
    AND expiry > datetime('now')
    ORDER BY expiry ASC
  `).bind(userId).all();
  
  // Get popular/used
  const { results: popular } = await env.REFERRAL_DB.prepare(`
    SELECT r.*, COUNT(u.id) as usage_count 
    FROM referrals r
    LEFT JOIN usage_log u ON r.id = u.referral_id
    WHERE r.user_id = ?
    AND r.created_at >= datetime('now', '-30 days')
    GROUP BY r.id
    ORDER BY usage_count DESC
    LIMIT 5
  `).bind(userId).all();
  
  // Generate HTML/text email
  return formatDigestEmail({
    newReferrals: results,
    expiringSoon: expiring,
    popular,
    frequency
  });
}

function formatDigestEmail(data: DigestData): string {
  const { newReferrals, expiringSoon, popular, frequency } = data;
  
  return `
Your ${frequency === 'daily' ? 'Daily' : 'Weekly'} Referral Digest
================================================

📬 NEW REFERRALS (${newReferrals.length})
${newReferrals.map(r => `
- ${r.service}: ${r.code || r.referral_url}
  Reward: ${r.reward || 'N/A'}
  Added: ${new Date(r.created_at).toLocaleDateString()}
`).join('') || 'No new referrals this period.'}

⏰ EXPIRING SOON (${expiringSoon.length})
${expiringSoon.map(r => `
- ${r.service}: Expires ${new Date(r.expiry).toLocaleDateString()}
  Code: ${r.code || r.referral_url}
`).join('') || 'No expiring referrals.'}

🔥 POPULAR THIS MONTH (${popular.length})
${popular.map(r => `
- ${r.service}: Used ${r.usage_count} times
  Code: ${r.code || r.referral_url}
`).join('') || 'No usage data yet.'}

---
Reply with DIGEST WEEKLY or DIGEST DAILY to change frequency.
Reply with SEARCH <term> to find specific referrals.
`;
}
```

---

## 6. Sample Email Flows

### 6.1 Forward Referral Email Flow

```
┌────────────┐          ┌──────────────────┐          ┌─────────────┐
│   User     │          │  Email Provider  │          │   Worker    │
└─────┬──────┘          └─────────┬────────┘          └──────┬──────┘
      │                           │                        │
      │ Forward referral email    │                        │
      │ ─────────────────────────>│                        │
      │                           │                        │
      │                           │  Route to custom       │
      │                           │  address               │
      │                           │ ──────────────────────>│
      │                           │                        │
      │                           │                        │  Parse email
      │                           │                        │  Extract code
      │                           │                        │  Validate
      │                           │                        │  Save to DB
      │                           │                        │
      │                           │  Confirmation email    │
      │                           │ <──────────────────────│
      │                           │                        │
      │  "✓ Dropbox referral      │                        │
      │   added"                  │                        │
      │ <─────────────────────────│                        │
      │                           │                        │
```

**Timeline**:
1. 00:00 - User forwards email from Dropbox to `referrals@do-deal.app`
2. 00:01 - Email received by Cloudflare Email Worker
3. 00:01 - Security validation (DKIM, SPF)
4. 00:02 - Parser identifies as Dropbox referral
5. 00:02 - Extracts code: `abc123`, link: `db.tt/abc123`
6. 00:03 - Saves to D1 database with user association
7. 00:04 - Sends confirmation email to user

### 6.2 Command Email Flow

```
┌────────────┐          ┌──────────────────┐          ┌─────────────┐
│   User     │          │  Email Provider  │          │   Worker    │
└─────┬──────┘          └─────────┬────────┘          └──────┬──────┘
      │                           │                        │
      │ To: add@referrals.app    │                        │
      │ Subject: Uber Code       │                        │
      │ Body: Service: Uber...    │                        │
      │ ─────────────────────────>│                        │
      │                           │                        │
      │                           │                        │  Parse command
      │                           │                        │  Validate fields
      │                           │                        │  Insert to DB
      │                           │                        │
      │                           │  Confirmation          │
      │                           │ <──────────────────────│
      │                           │                        │
      │  "✓ Uber referral added" │                        │
      │ <─────────────────────────│                        │
      │                           │                        │
```

**Timeline**:
1. 00:00 - User sends email to `add@referrals.do-deal.app`
2. 00:01 - Worker parses command type from recipient address
3. 00:01 - Extracts fields from email body
4. 00:02 - Validates required fields (service name present)
5. 00:02 - Inserts into database
6. 00:03 - Sends confirmation with extracted details

### 6.3 Digest Flow

```
┌────────────┐          ┌─────────────┐          ┌─────────────┐
│  Worker    │          │    D1 DB    │          │    User     │
└─────┬──────┘          └──────┬──────┘          └──────┬──────┘
      │                        │                        │
      │  Cron trigger          │                        │
      │  (daily/weekly)        │                        │
      │                        │                        │
      │  Query new referrals   │                        │
      │ ───────────────────────>│                        │
      │ <──────────────────────│                        │
      │                        │                        │
      │  Query expiring        │                        │
      │ ───────────────────────>│                        │
      │ <──────────────────────│                        │
      │                        │                        │
      │  Generate digest       │                        │
      │  email                 │                        │
      │                        │                        │
      │                        │  Send digest email       │
      │                        │ ───────────────────────>│
      │                        │                        │
```

---

## 7. Provider Support Matrix

| Provider | Inbound Method | DKIM/SPF | Notes |
|----------|---------------|----------|-------|
| **Gmail** | IMAP / Webhook via Google Workspace | Full | Requires app-specific password or OAuth |
| **Outlook/Microsoft 365** | Microsoft Graph API / Webhook | Full | Modern auth required |
| **Cloudflare Email** | Built-in Email Workers | Full | Easiest integration |
| **Custom Domain** | Any IMAP/SMTP | Configurable | Full control over DNS records |
| **SendGrid** | Inbound Parse Webhook | Partial | Requires webhook endpoint |
| **Mailgun** | Routes + Webhook | Partial | Built-in spam filtering |
| **AWS SES** | Receipt rules + Lambda/Worker | Full | Requires S3/SNS setup |

### 7.1 Gmail Integration

```typescript
// gmail-oauth.ts
// For personal Gmail accounts, use OAuth2 instead of IMAP password

async function setupGmailIntegration(env: Env) {
  // 1. User authorizes via OAuth2
  const authUrl = generateGmailAuthUrl(env);
  
  // 2. Store refresh token securely
  // 3. Use Gmail API to watch for new emails
  // 4. Set up push notifications to webhook
}

// Or use IMAP with app-specific password
const gmailIMAP = {
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  auth: {
    user: 'user@gmail.com',
    pass: 'xxxx xxxx xxxx xxxx' // App-specific password
  }
};
```

### 7.2 Microsoft 365 Integration

```typescript
// microsoft-graph.ts
import { Client } from '@microsoft/microsoft-graph-client';

async function setupMicrosoftIntegration(env: Env) {
  const client = Client.init({
    authProvider: {
      getAccessToken: async () => {
        // Use stored refresh token to get access token
        return await getMicrosoftAccessToken(env);
      }
    }
  });
  
  // Subscribe to email notifications
  const subscription = await client.api('/subscriptions').post({
    changeType: 'created',
    notificationUrl: 'https://api.do-deal.app/webhooks/microsoft',
    resource: '/me/messages',
    expirationDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });
}
```

---

## 8. Database Schema

```sql
-- referrals table
CREATE TABLE referrals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,
  code TEXT,
  referral_url TEXT,
  reward TEXT,
  category TEXT,
  expiry DATETIME,
  status TEXT DEFAULT 'active',
  source TEXT, -- 'email_forward', 'email_command', 'manual', 'api'
  confidence REAL DEFAULT 0,
  metadata TEXT, -- JSON for additional fields
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- users table with email preferences
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  email_verified INTEGER DEFAULT 0,
  digest_frequency TEXT DEFAULT 'weekly', -- 'daily', 'weekly', 'never'
  digest_day TEXT DEFAULT 'monday', -- For weekly
  digest_time TEXT DEFAULT '09:00',
  digest_format TEXT DEFAULT 'detailed', -- 'summary', 'detailed'
  auto_parse INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- email whitelist/blacklist
CREATE TABLE email_senders (
  id TEXT PRIMARY KEY,
  email_domain TEXT NOT NULL,
  status TEXT NOT NULL, -- 'whitelisted', 'blacklisted', 'pending'
  service_type TEXT, -- e.g., 'dropbox', 'uber'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- usage tracking
CREATE TABLE usage_log (
  id TEXT PRIMARY KEY,
  referral_id TEXT NOT NULL,
  used_by TEXT,
  used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source TEXT, -- 'email', 'web', 'api'
  FOREIGN KEY (referral_id) REFERENCES referrals(id)
);

-- rate limiting
CREATE TABLE email_rate_limits (
  email TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  window_start DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. Pros and Cons

### 9.1 Advantages

| Aspect | Benefit |
|--------|---------|
| **Hands-off** | Users forward emails - no manual data entry |
| **Familiar** | Email is universal, no app learning curve |
| **Async** | Process at user's convenience |
| **Universal** | Works with any email provider |
| **Rich Data** | Full email context for extraction |
| **Audit Trail** | Emails serve as proof/receipt |
| **No App Required** | Mobile-friendly without dedicated app |
| **Integration** | Native sharing from email apps |

### 9.2 Disadvantages

| Aspect | Challenge |
|--------|-----------|
| **Parsing Complexity** | Email formats vary wildly |
| **Security Risk** | Email spoofing, phishing attempts |
| **Reliability** | Email delivery not guaranteed |
| **Rate Limits** | Providers throttle IMAP/API |
| **Spam Filtering** | Legitimate emails may be filtered |
| **Attachments** | Complex to handle inline images |
| **Privacy** | Users forwarding potentially sensitive emails |
| **Scale** | IMAP polling doesn't scale well |

### 9.3 Mitigation Strategies

| Challenge | Solution |
|-----------|----------|
| Parsing errors | Confidence scoring + manual review queue |
| Security | DKIM/SPF + sender whitelist + rate limiting |
| Reliability | Webhooks > IMAP; multiple provider support |
| Spam | Dedicated receiving domain; clear sender rules |
| Scale | Cloudflare Email Workers (serverless); queue-based |
| Privacy | Data minimization; clear retention policy |

---

## 10. Implementation Roadmap

### Phase 1: MVP (2-3 weeks)
- [ ] Cloudflare Email Worker setup
- [ ] Basic command parsing (ADD, DEACTIVATE)
- [ ] Forwarded email extraction (top 10 services)
- [ ] Auto-reply confirmations
- [ ] D1 database integration

### Phase 2: Enhanced Extraction (2 weeks)
- [ ] Expand service patterns (50+ services)
- [ ] Natural language command parsing
- [ ] Confidence scoring system
- [ ] Manual review queue UI

### Phase 3: Security & Scale (2 weeks)
- [ ] DKIM/SPF verification
- [ ] Rate limiting
- [ ] Spam filtering
- [ ] Sender whitelisting

### Phase 4: Digest & Automation (2 weeks)
- [ ] Daily/weekly digest generation
- [ ] Cron triggers
- [ ] Email template system
- [ ] Preference management

### Phase 5: Multi-Provider (Optional)
- [ ] Gmail API integration
- [ ] Microsoft Graph integration
- [ ] IMAP fallback
- [ ] Provider-specific optimizations

---

## 11. Configuration Example

```toml
# wrangler.toml
name = "do-deal-email"
main = "src/worker.ts"
compatibility_date = "2026-04-01"

[email]
address = "referrals@do-deal.app"

[[d1_databases]]
binding = "REFERRAL_DB"
database_name = "referrals"
database_id = "your-db-id"

[[queues.producers]]
binding = "EMAIL_QUEUE"
queue = "email-processing"

[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-kv-id"

[vars]
DKIM_VERIFY = "true"
SPF_VERIFY = "true"
MAX_DAILY_EMAILS = "50"
CONFIDENCE_THRESHOLD = "0.7"

# Secrets (set via wrangler secret put)
# - WEBHOOK_SECRET
# - SMTP_PASSWORD
# - ENCRYPTION_KEY
```

---

## 12. Testing Strategy

### 12.1 Unit Tests
```typescript
// test/command-parser.test.ts
describe('Command Parser', () => {
  it('should parse ADD command from address', () => {
    const email = createMockEmail({
      to: ['add@referrals.do-deal.app'],
      body: 'Service: Dropbox\nCode: ABC123'
    });
    
    const result = parseCommand(email);
    expect(result.type).toBe('ADD');
    expect(result.service).toBe('Dropbox');
    expect(result.code).toBe('ABC123');
  });
});

// test/extraction-engine.test.ts
describe('Extraction Engine', () => {
  it('should extract Dropbox referral from forwarded email', () => {
    const email = loadFixture('dropbox-referral.html');
    const result = extractReferralCode(email, servicePatterns);
    
    expect(result.service).toBe('Dropbox');
    expect(result.code).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
```

### 12.2 Integration Tests
```typescript
// Test full email flow
async function testEmailFlow() {
  // 1. Send test email
  await sendTestEmail({
    to: 'referrals@do-deal.app',
    subject: 'Forwarded: You\'ve been invited to Dropbox',
    body: loadFixture('dropbox-forward.txt')
  });
  
  // 2. Wait for processing
  await waitForProcessing(5000);
  
  // 3. Verify database entry
  const referral = await db.query(
    'SELECT * FROM referrals WHERE service = ?', 
    ['Dropbox']
  );
  expect(referral).toBeTruthy();
  
  // 4. Verify confirmation email sent
  const confirmation = await getLastEmailTo('test@example.com');
  expect(confirmation.subject).toContain('✓ Added');
}
```

---

## Conclusion

This email integration design provides a comprehensive, automated system for referral code management through email interactions. The architecture prioritizes:

1. **Hands-off operation** through intelligent parsing and extraction
2. **Security** via DKIM/SPF, rate limiting, and sender validation
3. **Flexibility** supporting multiple email providers and command formats
4. **Scalability** using serverless Cloudflare Workers
5. **User experience** with clear confirmations and digest emails

The phased implementation approach allows for iterative development and testing, starting with core functionality and expanding to advanced features.

---

## Appendix: Email Template Examples

### Confirmation Email (HTML)
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { background: #f9f9f9; padding: 20px; margin: 20px 0; }
    .detail { margin: 10px 0; }
    .label { font-weight: bold; color: #333; }
    .footer { text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✓ Referral Code Added</h1>
    </div>
    
    <div class="content">
      <p>We've successfully saved your referral code from <strong>{{service}}</strong>.</p>
      
      <div class="detail">
        <span class="label">Service:</span> {{service}}
      </div>
      {{#code}}
      <div class="detail">
        <span class="label">Code:</span> <code>{{code}}</code>
      </div>
      {{/code}}
      {{#referralUrl}}
      <div class="detail">
        <span class="label">Link:</span> <a href="{{referralUrl}}">{{referralUrl}}</a>
      </div>
      {{/referralUrl}}
      {{#reward}}
      <div class="detail">
        <span class="label">Reward:</span> {{reward}}
      </div>
      {{/reward}}
      {{#expiry}}
      <div class="detail">
        <span class="label">Expires:</span> {{expiry}}
      </div>
      {{/expiry}}
      
      <p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
        <small>Confidence: {{confidence}}% | Added via {{source}}</small>
      </p>
    </div>
    
    <div class="footer">
      <p>Reply with <strong>DEACTIVATE {{service}}</strong> to mark this code as inactive.</p>
      <p>Do-Deal | <a href="https://do-deal.app">do-deal.app</a></p>
    </div>
  </div>
</body>
</html>
```

### Digest Email (Text)
```
===============================================
YOUR WEEKLY REFERRAL DIGEST
Week of March 25 - March 31, 2026
===============================================

📬 NEW THIS WEEK (3)
-------------------
• Dropbox - Code: REF123456
  Reward: 500MB extra storage
  Added: Mar 28

• Uber - Link: uber.com/invite/john
  Reward: $20 ride credit
  Added: Mar 29

• Airbnb - Link: airbnb.com/c/sarah123
  Reward: $40 travel credit
  Added: Mar 30

⏰ EXPIRING SOON (2)
------------------
• Robinhood - Expires Apr 05
  Code: JOIN123
  [Renew this code soon!]

• DoorDash - Expires Apr 02
  Code: FOOD456
  [Expires in 2 days!]

🔥 MOST USED THIS MONTH
----------------------
• Dropbox (12 uses)
• Uber (8 uses)
• Rakuten (5 uses)

===============================================
Quick Commands:
• Reply ADD <service> to add new referral
• Reply DEACTIVATE <code> to remove
• Reply SEARCH <term> to find referrals
• Reply DIGEST DAILY for daily updates
===============================================
```

---

*Document Version: 1.0*
*Last Updated: 2026-04-01*
*Status: Design Complete - Ready for Implementation*
