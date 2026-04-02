# DealRelay Chat Bot

Telegram and Discord bot implementations for managing referral codes through conversational interfaces.

## Features

- **Complete URL Preservation**: All URLs are stored and displayed in their entirety
- **Dual Platform Support**: Telegram and Discord implementations
- **Rich Interactions**: Conversational flows, buttons, and rich embeds
- **Role-Based Permissions**: Admin, Moderator, Verified, and Public access levels
- **Rate Limiting**: Built-in protection against spam
- **API Integration**: Direct integration with DealRelay REST API

## Supported Commands

| Command              | Description                     | Permissions | Platforms |
| -------------------- | ------------------------------- | ----------- | --------- |
| `/start`             | Initialize bot and show welcome | Public      | Both      |
| `/help [command]`    | Show help information           | Public      | Both      |
| `/add <url>`         | Add a new referral code         | Verified+   | Both      |
| `/search <domain>`   | Search referrals by domain      | Public      | Both      |
| `/get <code>`        | Get referral details            | Public      | Both      |
| `/deactivate <code>` | Deactivate a code               | Moderator+  | Both      |
| `/reactivate <code>` | Reactivate a code               | Moderator+  | Both      |
| `/research <domain>` | Web research for codes          | Public      | Both      |
| `/stats`             | View system statistics          | Public      | Both      |

## URL Preservation (CRITICAL)

All URLs are handled with complete preservation:

```
# Input
/add https://picnic.app/de/freunde-rabatt/DOMI6869

# Stored and Returned
{
  "code": "DOMI6869",
  "url": "https://picnic.app/de/freunde-rabatt/DOMI6869",
  "domain": "picnic.app"
}
```

Never use partial URLs like `picnic.app/DOMI6869` - always include the complete URL with protocol and path.

## Setup

### Prerequisites

```bash
# Install dependencies
npm install telegraf discord.js
```

### Environment Variables

Create a `.env` file:

```bash
# API Configuration
DEAL_API_URL=https://your-worker.workers.dev
DEAL_API_KEY=your-api-key

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234...
TELEGRAM_ADMIN_IDS=123456789,987654321

# Discord
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id
DISCORD_GUILD_ID=your-guild-id  # Optional, for guild commands
DISCORD_ADMIN_ROLES=Admin
DISCORD_MODERATOR_ROLES=Moderator
DISCORD_VERIFIED_ROLES=Verified
```

## Usage

### Running the Telegram Bot

```typescript
import { launchTelegramBot } from "./bot/telegram";

const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  apiUrl: process.env.DEAL_API_URL!,
  apiKey: process.env.DEAL_API_KEY,
  adminUserIds: process.env.TELEGRAM_ADMIN_IDS?.split(",") || [],
};

await launchTelegramBot(config);
```

### Running the Discord Bot

```typescript
import { launchDiscordBot } from "./bot/discord";

const config = {
  botToken: process.env.DISCORD_BOT_TOKEN!,
  clientId: process.env.DISCORD_CLIENT_ID!,
  guildId: process.env.DISCORD_GUILD_ID, // Optional
  apiUrl: process.env.DEAL_API_URL!,
  apiKey: process.env.DEAL_API_KEY,
  adminRoleIds: ["admin-role-id"],
  moderatorRoleIds: ["mod-role-id"],
  verifiedRoleIds: ["verified-role-id"],
};

await launchDiscordBot(config);
```

## Conversation Flows

### Add Code Flow (Interactive)

```
User: /add (no arguments)
Bot: Step 1/4: What's the referral code?

User: DOMI6869
Bot: ✓ Got it: DOMI6869
     Step 2/4: What's the complete referral URL?

User: https://picnic.app/de/freunde-rabatt/DOMI6869
Bot: ✓ URL saved
     Step 3/4: What's the reward/bonus? (optional)

User: Free €10 credit
Bot: ✓ Reward noted
     Step 4/4: Any notes or tags? (optional)

User: Popular in Netherlands
Bot: ✅ Referral Added Successfully!
     Code: DOMI6869
     URL: https://picnic.app/de/freunde-rabatt/DOMI6869
     Domain: picnic.app
```

## File Structure

```
bot/
├── README.md           # This file
├── api-client.ts       # API client wrapper
├── commands.ts         # Command definitions
├── conversations.ts    # Conversation flows
├── telegram/
│   └── index.ts        # Telegram bot implementation
└── discord/
    └── index.ts        # Discord bot implementation
```

## API Integration

The bot uses these DealRelay API endpoints:

- `POST /api/referrals` - Create referral
- `GET /api/referrals/:code` - Get referral by code
- `GET /api/referrals?domain=X` - Search referrals
- `POST /api/referrals/:code/deactivate` - Deactivate
- `POST /api/referrals/:code/reactivate` - Reactivate
- `POST /api/research` - Web research
- `GET /health` - Health check

## Permissions

| Level     | Telegram  | Discord        | Capabilities                |
| --------- | --------- | -------------- | --------------------------- |
| Public    | Any user  | Any user       | Search, view, research      |
| Verified  | Whitelist | Verified role  | Add codes                   |
| Moderator | Whitelist | Moderator role | Deactivate, reactivate      |
| Admin     | Config ID | Admin role     | Bulk import, admin commands |

## Rate Limits

| Platform  | Requests | Window     |
| --------- | -------- | ---------- |
| Telegram  | 30       | 60 seconds |
| Discord   | 5        | 10 seconds |
| API calls | 100      | 60 seconds |

## Error Handling

Common error responses:

- `400` - Invalid request
- `404` - Referral not found
- `409` - Duplicate referral code
- `429` - Rate limit exceeded
- `500` - System error

## Development

### Testing

```bash
# Run TypeScript check
npx tsc --noEmit

# Run tests (if available)
npm test
```

### Type Safety

All bot code is written in TypeScript with full type safety:

- Command context validation
- API response typing
- Permission checking
- Conversation state management

## License

MIT License - See LICENSE file for details.
