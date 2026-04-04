# Email Integration for Referral Code Management

This module provides email-based referral code input and management. Users can forward referral emails or send commands via email to manage their referral codes.

## Overview

The email integration system:

- Receives forwarded referral emails
- Parses HTML/text to extract codes and URLs
- Uses service-specific patterns for 20+ services
- Sends complete URLs to the API
- Sends confirmation replies via email

## Architecture

```
Incoming Email → Security Validation → Parser → Extractor → API → Confirmation
```

### Components

| Component  | File                         | Purpose                       |
| ---------- | ---------------------------- | ----------------------------- |
| Types      | `worker/email/types.ts`      | TypeScript type definitions   |
| Patterns   | `worker/email/patterns.ts`   | 20+ service-specific patterns |
| Extraction | `worker/email/extraction.ts` | Code/URL extraction logic     |
| Security   | `worker/email/security.ts`   | DKIM, SPF, rate limiting      |
| Templates  | `worker/email/templates.ts`  | Confirmation emails           |
| Handler    | `worker/email/handler.ts`    | Main processing logic         |
| Routes     | `worker/routes/email.ts`     | API endpoints                 |

## Supported Services (20+)

### Food & Grocery

- Picnic (German: `https://picnic.app/de/freunde-rabatt/CODE`)
- DoorDash
- Uber Eats
- Grubhub

### Transportation

- Uber (`https://uber.com/invite/CODE`)
- Lyft
- Lime
- Bird

### Travel

- Airbnb (`https://airbnb.com/c/CODE`)
- Booking.com
- Expedia

### Finance

- Robinhood
- Trading212
- Crypto.com
- Coinbase
- Revolut

### Shopping

- Rakuten
- Honey
- Ibotta

### Cloud Storage

- Dropbox (`https://db.tt/CODE`)
- Google One
- pCloud

### Communication

- Discord
- Telegram

### Entertainment

- Spotify
- Netflix

### Health

- Headspace
- Calibrate

## Email Commands

### Forward Referral Emails

Simply forward any referral email to: `referrals@your-domain.com`

The system will automatically extract:

- Service name
- Referral code
- Complete referral URL (CRITICAL: full URL preserved)
- Reward description
- Expiry date

### Manual Commands

#### ADD

```
To: add@your-domain.com
Subject: Service Name

Service: Uber
Code: ABC123
Link: https://uber.com/invite/ABC123
Reward: $20 ride credit
Expires: 2026-12-31
```

#### DEACTIVATE

```
To: deactivate@your-domain.com
Subject: Uber ABC123

Reason: Code expired
```

#### SEARCH

```
To: search@your-domain.com
Subject: uber
```

#### DIGEST

```
To: digest@your-domain.com
Subject: weekly
```

#### HELP

```
To: help@your-domain.com
```

## API Endpoints

### POST /api/email/incoming

Receive email via webhook from email providers:

```bash
curl -X POST https://your-worker.com/api/email/incoming \
  -H "Content-Type: application/json" \
  -d '{
    "from": "user@example.com",
    "to": "referrals@your-domain.com",
    "subject": "Fwd: You have been invited to Dropbox",
    "text": "...",
    "html": "..."
  }'
```

### POST /api/email/parse

Test email parsing (returns extraction results without storing):

```bash
curl -X POST https://your-worker.com/api/email/parse \
  -H "Content-Type: application/json" \
  -d '{
    "from": "invite@dropbox.com",
    "subject": "You have been invited to Dropbox",
    "text": "Use my referral link: https://db.tt/ABC123"
  }'
```

### GET /api/email/help

Returns help email content.

## Cloudflare Email Workers

To enable Cloudflare Email Workers, add to `wrangler.jsonc`:

```toml
[email]
address = "referrals@your-domain.com"
```

The `emailWorkerHandler` function will be called automatically when emails are received.

## Security Features

1. **DKIM Validation**: Verifies email authenticity
2. **SPF Check**: Validates sender domain
3. **Rate Limiting**: Max 50 emails per sender per day
4. **Spam Detection**: Content-based spam scoring
5. **Sender Validation**: Whitelist/blacklist support

## URL Preservation (CRITICAL)

All URLs are preserved exactly as they appear in the email:

```javascript
// Input from email
"https://picnic.app/de/freunde-rabatt/DOMI6869";

// Extracted and stored as-is
{
  url: "https://picnic.app/de/freunde-rabatt/DOMI6869";
}
```

Never reconstructed or shortened URLs.

## Confidence Scoring

Extraction results include confidence scores:

- **0.9**: Service-specific pattern matched
- **0.7**: Service matched but generic extraction
- **0.6**: Generic pattern matched
- **0.0**: Manual review required

## Error Handling

Low confidence extractions trigger manual review emails requesting:

- Service name
- Referral code
- Complete referral URL
- Expiry date

## Configuration

Environment variables:

```
EMAIL_WEBHOOK_SECRET - Secret for webhook verification
MAX_EMAILS_PER_DAY - Rate limit (default: 50)
SPAM_THRESHOLD - Spam score threshold (default: 0.7)
```

## Testing

Run the test suite:

```bash
npm test -- worker/email
```

## Integration Example

```typescript
import { processEmail } from "./worker/email";

const result = await processEmail(
  {
    from: "user@example.com",
    to: ["referrals@do-deal.app"],
    subject: "Fwd: Uber invite",
    text: "Your Uber invite code: ABC123",
    html: "<p>Your Uber invite code: ABC123</p>",
  },
  env,
);

console.log(result);
// {
//   success: true,
//   message: "Referral extracted and stored successfully",
//   referralId: "ref-...",
//   extracted: {
//     service: "Uber",
//     code: "ABC123",
//     referralUrl: "https://uber.com/invite/ABC123",
//     confidence: 0.9
//   },
//   confirmationSent: true
// }
```

## License

MIT
