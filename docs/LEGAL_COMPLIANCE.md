# Legal Compliance Guide for Deal Discovery System

## Overview
This system aggregates and shares referral deals and affiliate links. This guide ensures compliance with relevant laws and regulations.

## Key Legal Frameworks

### 1. FTC Endorsement Guides (United States)

**Source**: Federal Trade Commission
**Applies To**: US-based operations and any content reaching US consumers

#### Core Requirements:

**Disclosure Obligations**:
- Must clearly disclose material connections between endorsers and advertisers
- Disclosure must be "clear and conspicuous" (visible, unavoidable, understandable)
- Cannot be buried in terms of service or hidden in hashtags
- Must appear before users click affiliate links

**Material Connections to Disclose**:
- Payment or commission for referrals
- Free products or services received
- Employment relationships
- Family/business connections
- Stock ownership in the company

**Example Disclosures** (from FTC):
- "This is an ad for [Brand]"
- "[Brand] paid me to tell you about this"
- "I earn a commission if you use this link"
- "#Ad" or "#Sponsored" (must be clear, not buried)

**Clear and Conspicuous Standard** (2023 Update):
- Visible to consumers without scrolling/searching
- Sufficiently noticeable (size, color, location)
- Understandable language (no legalese)
- Appears before the purchasing decision point
- Durable (remains visible if content is reused)

**Prohibited Practices**:
- Fake reviews or testimonials
- Undisclosed material connections
- Misleading claims about typical results
- Hiding disclosures behind "Read More" or similar
- Using unclear abbreviations like "#sp" or "#spon"

### 2. GDPR (European Union)

**Source**: General Data Protection Regulation
**Applies To**: Any processing of EU residents' personal data

#### Core Requirements:

**Data Minimization**:
- Only collect necessary data
- Don't store PII (Personally Identifiable Information) unless essential
- Implement data retention limits

**Legal Basis for Processing**:
- Legitimate interest (recommendation system)
- Consent (if collecting user data)

**User Rights**:
- Right to be informed (privacy policy)
- Right to access their data
- Right to erasure ("right to be forgotten")
- Right to data portability

**Transparency Requirements**:
- Clear privacy policy
- Explain data collection and use
- Disclose third-party sharing
- Cookie consent if applicable

### 3. ePrivacy Directive (EU Cookie Law)

**Requirements**:
- Cookie consent for tracking cookies
- Clear explanation of cookie purposes
- Granular consent options

### 4. CCPA/CPRA (California, USA)

**Source**: California Consumer Privacy Act / Privacy Rights Act
**Applies To**: California residents

#### Core Requirements:

**Disclosure Requirements**:
- Privacy policy must disclose:
  - Categories of personal information collected
  - Categories of sources
  - Business/commercial purposes
  - Third parties shared with
  - Consumer rights

**Consumer Rights**:
- Right to know what data is collected
- Right to delete personal information
- Right to opt-out of sale of personal information
- Right to non-discrimination

**"Do Not Sell" Requirement**:
- If sharing data with affiliates, may need "Do Not Sell My Info" link
- Applies to "valuable consideration" (could include affiliate commissions)

### 5. CAN-SPAM Act (US Email)

**If sending emails**:
- Accurate header information
- Clear subject lines
- Identify message as advertisement
- Include physical address
- Provide opt-out mechanism
- Honor opt-out requests promptly

### 6. Platform-Specific Rules

**YouTube**:
- "Includes paid promotion" checkbox required
- Disclosure in description

**Instagram/Facebook**:
- "Paid partnership" tag for branded content
- Clear disclosure in caption

**TikTok**:
- "Paid partnership" toggle
- #ad hashtag requirement

**Twitter/X**:
- "Ad" indicator for promoted content
- Disclosure in tweet text

## Compliance Implementation

### System-Level Requirements

#### 1. Automated Disclosure
```typescript
// Add disclosure field to Deal type
interface Deal {
  // ... existing fields
  disclosure: {
    required: boolean;
    text: string;
    type: 'affiliate' | 'referral' | 'sponsored' | 'none';
  };
}
```

#### 2. Disclosure Templates
```typescript
const DISCLOSURE_TEMPLATES = {
  affiliate: "I may earn a commission if you use this referral code",
  referral: "Use my referral code - I may receive a reward",
  sponsored: "This content is sponsored by {brand}",
  employee: "I'm an employee of {company}",
  received_free: "I received this product/service for free",
  friend_family: "I have a personal relationship with this company"
};
```

#### 3. API Response Changes
```typescript
// Every deal response includes disclosure
{
  "id": "...",
  "title": "Trading212",
  "code": "GcCOCxbo",
  "disclosure": {
    "required": true,
    "text": "Referral code - user may receive a free share, referrer may receive reward",
    "type": "referral",
    "ftc_compliant": true
  }
}
```

### Data Privacy Requirements

#### Minimal Data Collection
- Don't store IP addresses
- Don't track individual users
- Don't collect personal information
- Use aggregated data only

#### Privacy Policy Requirements
Must include:
1. What data is collected (minimal)
2. How it's used (recommendations only)
3. How it's stored (encrypted KV)
4. Retention period (24 hours for logs)
5. Third parties (none, except Cloudflare)
6. User rights (access, delete)
7. Contact information

#### Data Retention
```typescript
const DATA_RETENTION = {
  deals: 'indefinite', // Public data
  logs: '90_days',     // Rotate old logs
  personal_data: 'never_stored',
  ip_addresses: 'not_logged'
};
```

### Jurisdiction-Specific Features

#### US Compliance
- FTC disclosure on every deal
- Clear and conspicuous placement
- Material connection disclosure

#### EU Compliance
- GDPR privacy notice
- No PII collection
- Cookie consent if tracking
- Data portability features

#### California Compliance
- CCPA privacy policy
- "Do Not Sell" link (if applicable)
- Consumer rights page

### Implementation Code

#### Enhanced Deal Type
```typescript
export interface Deal {
  id: string;
  source: {
    url: string;
    domain: string;
    discovered_at: string;
    trust_score: number;
    // NEW: Disclosure requirements
    requires_disclosure: boolean;
    disclosure_reason?: string;
  };
  title: string;
  description: string;
  code: string;
  url: string;
  reward: {
    type: 'cash' | 'credit' | 'percent' | 'item';
    value: number | string;
    currency?: string;
    description?: string;
  };
  // NEW: Legal compliance
  compliance: {
    ftc_disclosure: {
      required: boolean;
      text: string;
      placement: 'before_link' | 'with_link' | 'after_link';
    };
    gdpr_data_category: 'public' | 'business_contact' | 'none';
    jurisdiction_restrictions: string[]; // ['US', 'EU', 'UK', etc.]
  };
  metadata: {
    category: string[];
    tags: string[];
    normalized_at: string;
    confidence_score: number;
    status: 'active' | 'quarantined' | 'rejected';
  };
}
```

#### Disclosure Generator
```typescript
export function generateDisclosure(deal: Deal): string {
  if (!deal.compliance.ftc_disclosure.required) {
    return '';
  }

  const templates = {
    referral: `Referral code: Use "${deal.code}" - referrer may receive ${deal.reward.type === 'cash' ? 'cash reward' : 'benefit'}`,
    affiliate: `Affiliate link: I may earn commission if you sign up`,
    sponsored: `Sponsored: ${deal.source.domain} provided this offer`,
    employee: `Employee referral: I'm employed by ${deal.source.domain}`,
    received_free: `Disclosure: I received this product/service free`
  };

  return templates[deal.compliance.ftc_disclosure.type] ||
         deal.compliance.ftc_disclosure.text ||
         'This is a referral/affiliate link';
}
```

#### Privacy-Focused Logging
```typescript
export function privacySafeLog(entry: LogEntry): LogEntry {
  // Remove any potential PII
  return {
    ...entry,
    // Don't log IP addresses
    ip_address: undefined,
    // Don't log user agents with PII
    user_agent: undefined,
    // Anonymize any personal data
    personal_data: undefined
  };
}
```

## Legal Risk Mitigation

### High-Risk Scenarios

1. **Financial Products**
   - Higher disclosure requirements
   - Investment disclaimers needed
   - Not financial advice statements

2. **Health Products**
   - FDA approval status
   - "Results may vary" disclaimers
   - Medical disclaimer

3. **Subscription Services**
   - Auto-renewal disclosures
   - Cancellation terms
   - Trial period clarity

4. **Gambling/Gaming**
   - Age restrictions
   - Responsible gaming messages
   - Jurisdiction restrictions

### Automated Risk Detection
```typescript
export function assessLegalRisk(deal: Deal): RiskAssessment {
  const risks: string[] = [];
  const required_disclosures: string[] = [];

  // Financial products
  if (deal.metadata.category.includes('financial') ||
      deal.metadata.category.includes('investment')) {
    risks.push('financial_product');
    required_disclosures.push('not_financial_advice');
  }

  // Health products
  if (deal.metadata.category.includes('health') ||
      deal.metadata.category.includes('medical')) {
    risks.push('health_claim');
    required_disclosures.push('not_medical_advice');
    required_disclosures.push('fda_not_evaluated');
  }

  // Subscription
  if (deal.description.toLowerCase().includes('subscription') ||
      deal.description.toLowerCase().includes('auto-renew')) {
    risks.push('subscription_terms');
    required_disclosures.push('auto_renewal_terms');
  }

  // High value
  if (typeof deal.reward.value === 'number' && deal.reward.value > 500) {
    risks.push('high_value_offer');
    required_disclosures.push('terms_and_conditions');
  }

  return {
    risk_level: risks.length > 2 ? 'high' : risks.length > 0 ? 'medium' : 'low',
    risks,
    required_disclosures,
    requires_manual_review: risks.length > 0
  };
}
```

## Compliance Checklist

### Pre-Deployment
- [ ] Privacy policy created
- [ ] FTC disclosure system implemented
- [ ] GDPR compliance verified (no PII collection)
- [ ] CCPA compliance (if targeting CA)
- [ ] Terms of service created
- [ ] DMCA policy (if user-submitted content)
- [ ] Cookie consent (if using cookies)
- [ ] Accessibility check (WCAG 2.1)

### Ongoing Compliance
- [ ] Quarterly disclosure review
- [ ] Monthly legal risk assessment
- [ ] Weekly content audit for prohibited items
- [ ] Automated PII scanning
- [ ] User rights request handling system
- [ ] Data breach response plan

### API Documentation
Add to every API response:
- Disclosure requirements
- Jurisdiction restrictions
- Risk level indicators
- Compliance status

## Sample Privacy Policy

```markdown
# Privacy Policy

## Data We Collect
We collect minimal data necessary to provide deal recommendations:
- Deal metadata (public information)
- Anonymous usage statistics
- No personal information

## How We Use Data
- Improve recommendation algorithms
- Monitor system performance
- Generate aggregate statistics

## Data Sharing
We do not sell or share personal data. Data is stored with Cloudflare.

## Your Rights
Under GDPR/CCPA, you have the right to:
- Access your data (we store none)
- Delete your data (automatic after 90 days)
- Opt-out of tracking (we don't track)

## Contact
For privacy questions: [contact info]
```

## Enforcement & Penalties

### FTC Violations
- Civil penalties up to $50,120 per violation (2024)
- Injunctions requiring compliance
- Refund requirements for consumers
- Reputational damage

### GDPR Violations
- Up to €20 million or 4% of global revenue
- Data protection authority investigations
- Required data protection officer

### CCPA Violations
- Up to $7,500 per intentional violation
- Private right of action for data breaches
- Class action lawsuits possible

## Recommended Actions

1. **Immediate**: Implement FTC disclosure system
2. **Week 1**: Create privacy policy
3. **Week 2**: Add legal risk detection
4. **Week 3**: Jurisdiction filtering
5. **Week 4**: Compliance audit system

## Documentation

### For Consumers
- How disclosures work
- What data is collected
- How to exercise rights
- How to report concerns

### For Developers
- API compliance requirements
- Disclosure formatting
- Risk assessment integration
- Jurisdiction handling

## Updates & Maintenance

- Monitor FTC/ regulatory updates
- Quarterly legal review
- Annual compliance audit
- Update disclosure templates as laws change
