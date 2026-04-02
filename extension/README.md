# Referral Capture - Browser Extension

A Chrome/Firefox/Safari browser extension for capturing referral codes from any webpage with one-click submission to the do-deal-relay API.

## Features

- **Auto-Detection**: Automatically detects referral codes from:
  - URL paths (e.g., `/invite/CODE`, `/ref/CODE`, `/freunde-rabatt/CODE`)
  - Query parameters (e.g., `?ref=CODE`, `?referral=CODE`)
  - DOM elements (e.g., `[data-referral-code]`, `.referral-code`)
  - Text patterns (e.g., "Your referral code is: CODE")

- **One-Click Capture**: Click the extension icon to see detected codes and capture them instantly

- **Context Menu Integration**: Right-click to capture:
  - Referral codes from the current page
  - Selected text as a referral code
  - Referral links

- **Keyboard Shortcut**: Press `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac) for quick capture

- **Complete URL Preservation**: Always sends the **complete URL** to the API:
  - ✅ `https://picnic.app/de/freunde-rabatt/DOMI6869`
  - ✅ `https://www.trading212.com/invite/ABCDEF123`

## Installation

### Chrome (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `extension/` folder from this directory
5. The extension icon will appear in your toolbar

### Firefox (Temporary Installation)

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from the `extension/` folder

### Safari

Safari extensions require additional setup and packaging. See [Apple's documentation](https://developer.apple.com/documentation/safariservices/safari_web_extensions) for details.

## Usage

### Via Popup

1. Visit any webpage with a referral code (e.g., https://picnic.app/de/freunde-rabatt/DOMI6869)
2. Click the extension icon in your toolbar
3. The popup will show detected referral codes
4. Click "Capture Selected" to submit to the API
5. Or enter a code manually and click "Add Code Manually"

### Via Context Menu

1. Right-click anywhere on a page with a referral code
2. Select "🎁 Capture Referral Code"
3. The code will be automatically detected and submitted

### Via Selection

1. Select text that contains a referral code
2. Right-click and select "Capture Selection as Referral Code"
3. The selected text will be validated and submitted

### Via Keyboard Shortcut

1. Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. The highest-confidence detection will be captured automatically

## Configuration

### API Endpoint

By default, the extension connects to `http://localhost:8787` (local development). To change this:

1. Click the extension icon
2. Click "Settings"
3. Enter your API endpoint URL (e.g., `https://your-worker.workers.dev`)
4. Click "Save Settings"

### Permissions

The extension requires these permissions:

- **activeTab**: To access the current page for detection
- **storage**: To save your settings and statistics
- **contextMenus**: To add right-click menu items
- **scripting**: To inject detection scripts on pages

## File Structure

```
extension/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker for API communication
├── content.js             # Content script for detection
├── popup.html             # Popup UI markup
├── popup.js               # Popup logic
├── icons/                 # Extension icons
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── README.md              # This file
```

## API Integration

The extension communicates with the do-deal-relay API:

```
POST /api/referrals
Content-Type: application/json

{
  "code": "DOMI6869",
  "url": "https://picnic.app/de/freunde-rabatt/DOMI6869",
  "domain": "picnic.app",
  "source": "extension",
  "submitted_by": "browser-extension",
  "metadata": {
    "title": "Page Title",
    "reward_type": "unknown",
    "category": ["general"],
    "confidence_score": 0.9,
    "detection_source": "url_path"
  }
}
```

**CRITICAL**: The `url` field always contains the **complete URL** as per the system requirements.

## Detection Patterns

### URL Patterns

The extension detects codes in URLs matching:

- `/invite/CODE` - Trading212, Airbnb, etc.
- `/referral/CODE` - Many services
- `/ref/CODE` - Crypto.com, etc.
- `/join/CODE` - Robinhood, etc.
- `/promo/CODE` - Uber, etc.
- `/freunde-rabatt/CODE` - Picnic (German)
- `/app/CODE` - Crypto.com app links
- `?ref=CODE`, `?referral=CODE`, `?invite=CODE` - Query parameters

### DOM Selectors

The extension scans for:

- `[data-referral-code]` - Data attributes
- `.referral-code`, `.invite-code`, `.ref-code` - CSS classes
- `input[name*="referral"]` - Form inputs
- `[class*="referral"] code` - Nested patterns

### Text Patterns

The extension recognizes:

- "Your referral code is: CODE"
- "Referral code: CODE"
- "Use code CODE"
- "Sign up with CODE"

## Testing

### Test with Known Referral URLs

1. Visit: `https://picnic.app/de/freunde-rabatt/DOMI6869`
2. Click extension icon
3. Verify code "DOMI6869" is detected
4. Capture and verify complete URL is sent

### Test with Trading212

1. Visit: `https://www.trading212.com/invite/YOURCODE`
2. Verify detection works
3. Capture and verify complete URL is preserved

## Troubleshooting

### Extension Not Detecting Codes

1. Refresh the page
2. Click the refresh button (🔄) in the popup
3. Check the console for errors (right-click popup → Inspect)

### API Submission Fails

1. Verify the API endpoint is correct in Settings
2. Check that the API is running and accessible
3. Check the browser console for error messages

### Context Menu Not Appearing

1. Try reloading the extension
2. Check that you have the required permissions enabled
3. Restart the browser

## Development

### Building Icons

Icons should be PNG format in these sizes:

- 16x16 (toolbar icon)
- 32x32 (retina toolbar)
- 48x48 (extension management)
- 128x128 (Chrome Web Store)

### Testing Changes

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test the updated functionality

### Debug Logging

Enable debug logging by opening the popup and pressing F12 to see console output.

## Security

- All codes are validated (alphanumeric only, 4-20 characters)
- URLs are validated before submission
- Only referral codes are captured, no personal data
- Communication with API is over HTTPS in production

## License

Part of the do-deal-relay project. See main repository for license details.

## Contributing

Contributions welcome! Please ensure:

1. Complete URL preservation is maintained
2. Code follows existing patterns
3. Detection patterns are tested on real sites
4. Error handling is robust
