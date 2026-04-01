---
name: crypto-utils
description: Cryptographic utilities for hashing, encryption, and secure operations. Use for HMAC signing, password hashing, token generation, and secure random values.
---

# Crypto Utils

Secure cryptographic operations for hashing, encryption, and signing.

## Quick Start

```typescript
import { hash, hmac, generateToken } from './crypto-utils';

// Hash data
const digest = await hash.sha256('sensitive data');

// HMAC signature
const signature = await hmac.sign('payload', secret);
const isValid = await hmac.verify('payload', signature, secret);

// Secure token
const token = generateToken({ length: 32, encoding: 'base64url' });
```

## Hash Functions

| Algorithm | Use Case | Speed |
|-----------|----------|-------|
| SHA-256 | Data integrity | Fast |
| SHA-512 | Higher security | Fast |
| Argon2 | Password hashing | Slow (intentional) |
| bcrypt | Legacy passwords | Slow |

**SHA-256**:
```typescript
import { hash } from './crypto-utils';

const data = 'hello world';
const digest = await hash.sha256(data);
// hex: a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e
```

**Argon2 (Passwords)**:
```typescript
const password = 'userPassword123';
const hashed = await hash.argon2(password);
// Store hashed, verify later
const isValid = await hash.verifyArgon2(password, hashed);
```

## HMAC

**Sign and Verify**:
```typescript
import { hmac } from './crypto-utils';

const secret = 'my-webhook-secret';
const payload = JSON.stringify(data);

// Sign
const signature = await hmac.sign(payload, secret, 'sha256');
// Send: payload + signature

// Verify (receiver side)
const isValid = await hmac.verify(payload, signature, secret, 'sha256');
```

**Timestamped Signatures**:
```typescript
const signature = await hmac.signWithTimestamp(payload, secret, {
  timestamp: Date.now(),
  tolerance: 300000  // 5 minutes
});

// Verify (checks timestamp)
const result = await hmac.verifyWithTimestamp(payload, signature, secret);
// { valid: true, timestamp: 1234567890 }
```

## Token Generation

**Secure Random**:
```typescript
import { generateToken } from './crypto-utils';

// API key
const apiKey = generateToken({ length: 32, encoding: 'hex' });
// abc123...

// URL-safe
const token = generateToken({ length: 24, encoding: 'base64url' });
// Good for URLs

// Numeric (OTP)
const otp = generateToken({ length: 6, numeric: true });
// 123456
```

**UUID**:
```typescript
const id = generateUUID();  // v4 random
const timeId = generateUUID({ version: 7 });  // Time-sortable
```

## Encryption

**AES-256-GCM**:
```typescript
import { encrypt, decrypt } from './crypto-utils';

const key = await generateKey();  // 256-bit
const plaintext = 'sensitive data';

// Encrypt
const encrypted = await encrypt.aes256gcm(plaintext, key);
// { ciphertext, iv, tag }

// Decrypt
const decrypted = await decrypt.aes256gcm(encrypted, key);
```

**Key Derivation**:
```typescript
// Derive key from password
const key = await deriveKey('password', salt, { iterations: 100000 });
```

## Password Hashing

**Argon2id (Recommended)**:
```typescript
const hashed = await hash.password('userPass', {
  type: 'argon2id',
  memory: 65536,   // 64MB
  iterations: 3,
  parallelism: 4
});

const isValid = await verifyPassword('userPass', hashed);
```

## Encoding

```typescript
import { encode, decode } from './crypto-utils';

// Base64
const b64 = encode.base64(data);
const original = decode.base64(b64);

// Base64 URL-safe
const b64url = encode.base64url(data);

// Hex
const hex = encode.hex(data);
```

## Constant-Time Comparison

```typescript
// Prevent timing attacks
const isEqual = constantTimeEqual(a, b);
```

## Secure Random

```typescript
// Bytes
const bytes = secureRandom(32);

// Integer range
const n = secureRandomInt(1, 100);

// Shuffle array
const shuffled = secureShuffle(array);
```

## Configuration

```typescript
interface HashConfig {
  algorithm: 'sha256' | 'sha512' | 'argon2id' | 'bcrypt';
  encoding: 'hex' | 'base64';
}

interface EncryptionConfig {
  algorithm: 'aes-256-gcm';
  keySize: number;
  ivSize: number;
  tagSize: number;
}
```

## Best Practices

1. **Use Argon2id** for passwords
2. **Never roll your own crypto**
3. **Use constant-time comparison** for secrets
4. **Keep keys separate** from code
5. **Rotate keys** regularly

See [templates/crypto.ts](templates/crypto.ts) and [examples/signing.ts](examples/signing.ts) for complete examples.
