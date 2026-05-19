# Webhook Signature Verification

The Referral Discovery System uses HMAC-SHA256 signatures to ensure the authenticity and integrity of incoming webhooks.

## Headers

Every webhook request must include the following security headers:

- `X-Webhook-Signature`: The HMAC-SHA256 signature, prefixed with `sha256=`.
- `X-Webhook-Timestamp`: The Unix timestamp (in seconds) when the request was generated.
- `X-Webhook-Id`: A unique identifier for the webhook event.

## Signature Generation

The signature is generated using a shared secret key and the request payload.

### Step 1: Prepare the Signed Payload

Concatenate the timestamp and the raw request body with a period (`.`) separator:

```
signed_payload = timestamp + "." + request_body
```

### Step 2: Compute the HMAC

Compute the HMAC-SHA256 of the `signed_payload` using your secret key.

### Step 3: Hex Encode the Result

Convert the resulting HMAC binary to a hexadecimal string.

### Step 4: Add the Prefix

Prepend `sha256=` to the hex-encoded signature.

## Implementation Examples

### Node.js

```javascript
const crypto = require('crypto');

function generateSignature(secret, timestamp, body) {
  const signedPayload = `${timestamp}.${body}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signedPayload);
  const signature = hmac.digest('hex');
  return `sha256=${signature}`;
}
```

### Python

```python
import hmac
import hashlib

def generate_signature(secret, timestamp, body):
    signed_payload = f"{timestamp}.{body}".encode('utf-8')
    signature = hmac.new(
        secret.encode('utf-8'),
        signed_payload,
        hashlib.sha256
    ).hexdigest()
    return f"sha256={signature}"
```

## Replay Protection

The system enforces a 5-minute (300 seconds) tolerance for the `X-Webhook-Timestamp`. Requests with a timestamp older than this will be rejected with a `401 Unauthorized` response to prevent replay attacks.
