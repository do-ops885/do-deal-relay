# EU AI Act Article Reference Guide

Detailed reference for key articles of Regulation (EU) 2024/1689 (EU AI Act).

## Article 12: Record-Keeping

**Key Requirements:**

1. **Automatic Recording Capability** (12.1)
   - High-risk AI systems must allow automatic recording of events (logs) over lifetime
   - Must be built into system design from outset

2. **Traceability** (12.2)
   - Enable identifying situations that may result in risks or substantial modifications
   - Facilitate post-market monitoring (Article 72)
   - Monitor operation (Article 26(5))

3. **Minimum Requirements** (12.3) - For biometric systems:
   - Period of each use (start/end timestamps)
   - Reference database checked
   - Input data that led to match
   - Human verifier identification

**Implementation Notes:**

- Logs must be immutable and tamper-evident
- Minimum 6-month retention (Article 19, 26.6)
- Must comply with GDPR
- Authorities must have access when required

## Article 13: Transparency to Deployers

**Required Information:**

1. **Identity** (13.3(a))
   - Provider contact details
   - Authorized representative (if applicable)

2. **System Characteristics** (13.3(b))
   - Intended purpose
   - Accuracy, robustness, cybersecurity levels (Article 15)
   - Circumstances affecting performance
   - Risks to health, safety, fundamental rights (Article 9(2))
   - Technical capabilities for explaining output
   - Performance regarding specific persons/groups
   - Input data specifications
   - Training data information

3. **Change Documentation** (13.3(c))
   - Pre-determined changes to system

4. **Human Oversight Measures** (13.3(d))
   - Technical measures to facilitate interpretation

5. **Operational Information** (13.3(e))
   - Computational and hardware resources needed
   - Expected lifetime
   - Maintenance and care measures
   - Software update procedures

6. **Log Collection Mechanisms** (13.3(f))
   - Mechanisms for deployers to collect, store, interpret logs

## Article 14: Human Oversight

**Design Requirements:**

1. **Designed for Oversight** (14.1)
   - Effectively overseen by natural persons
   - Appropriate human-machine interface tools

2. **Oversight Objectives** (14.2)
   - Prevent/minimize risks to health, safety, fundamental rights
   - Address residual risks

3. **Oversight Measures** (14.3)
   - Commensurate with risks, autonomy level, context
   - Implemented through provider and deployer measures

4. **Deployer Capabilities** (14.4)
   Overseers must be able to:
   - Understand system capacities and limitations
   - Monitor operation, detect anomalies/dysfunctions
   - Be aware of automation bias
   - Correctly interpret outputs
   - Decide not to use or disregard/override/reverse output
   - Intervene via "stop" button or similar

5. **Two-Person Verification** (14.5)
   - For biometric identification: 2 natural persons must verify
   - Exception: Law enforcement, migration, border control

## Article 19: Automatically Generated Logs

**Provider Obligations:**

- Keep logs automatically generated when under provider control
- Maintain for appropriate period (minimum 6 months)
- Comply with GDPR and national data protection law

## Article 50: Transparency Obligations

**Applies to ALL AI systems interacting with natural persons:**

1. **AI Interaction Disclosure** (50.1)
   - Users informed they're interacting with AI
   - Clear and distinguishable at first interaction
   - Unless obvious from context

2. **Synthetic Content Marking** (50.2)
   - AI-generated content must be marked as artificially generated
   - Machine-readable and detectable
   - Effective, interoperable, robust, reliable technical solutions

3. **Emotion Recognition/Biometric Categorization** (50.3)
   - Natural persons informed of system operation
   - GDPR compliance required

4. **Deepfake Disclosure** (50.4)
   - Must disclose artificially generated/manipulated content
   - Exception: Artistic, creative, satirical works (limited disclosure)
   - Text on public interest matters must be disclosed as AI-generated

5. **Timing and Accessibility** (50.5)
   - Information at latest at time of first interaction
   - Accessible formats

## Annex III: High-Risk Use Cases

**Potentially Relevant to do-deal-relay:**

| Point | Use Case                  | Trigger                                 |
| ----- | ------------------------- | --------------------------------------- |
| 4(a)  | Recruitment/selection     | Analyzing/filtering candidates          |
| 4(b)  | Work-related decisions    | Making decisions affecting workers      |
| 5(a)  | Essential public services | Evaluating access to essential services |
| 5(b)  | Credit scoring            | Evaluating creditworthiness             |

**Important:** Systems are ALWAYS high-risk if they profile individuals (automated processing to assess aspects of person's life).

## Article 6: Classification Rules

**High-risk if:**

1. Safety component of product under Union harmonization legislation (Annex I) AND requires third-party conformity assessment; OR
2. Listed under Annex III use cases (unless exempted by Article 6(3))

**Exemptions** (Article 6(3)):

- Narrow procedural task
- Improve result of previously completed human activity
- Detect decision-making patterns without replacing human assessment
- Perform preparatory task to assessment

## Timeline

| Date             | Event                                          |
| ---------------- | ---------------------------------------------- |
| February 2, 2025 | Prohibited AI systems ban effective            |
| August 2, 2025   | GPAI model obligations apply                   |
| August 2, 2026   | High-risk AI systems obligations (Chapter III) |
| August 2, 2027   | Annex I high-risk systems obligations          |

## Key Compliance Principles

1. **Risk-Based Approach** - Obligations scale with risk level
2. **By Design** - Compliance built into system from outset
3. **Transparency** - Users and deployers informed about AI use
4. **Human Oversight** - Humans can always intervene
5. **Documentation** - Technical documentation maintained
6. **Post-Market Monitoring** - Continuous monitoring after deployment
7. **Data Governance** - High-quality, unbiased training data
8. **Authority Access** - Regulators can inspect systems and logs

## Source

- **Official Text:** https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689
- **AI Act Explorer:** https://artificialintelligenceact.eu/
- **EU AI Office:** https://digital-strategy.ec.europa.eu/en/policies/ai-office
