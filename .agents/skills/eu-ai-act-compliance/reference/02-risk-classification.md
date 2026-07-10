# Risk Classification

## Limited Risk (Article 50)

Applies to AI systems interacting with natural persons:

```typescript
const config: AIActConfig = {
  riskClassification: "limited_risk",
  obligations: {
    transparency: true, // Art. 50.1 - AI disclosure
    syntheticContent: false, // Art. 50.2 - If generating content
    biometricCategorization: false, // Art. 50.3
    deepfakeDisclosure: false, // Art. 50.4
  },
};
```

**Requirements:**

- Disclose AI interaction at first contact (Art. 50.1)
- Mark synthetic content as AI-generated (Art. 50.2)
- Inform users of emotion recognition (Art. 50.3)
- Disclose deepfake content (Art. 50.4)

## High Risk (Chapter III, Articles 8-17)

Applies to systems in Annex III (recruitment, credit scoring, etc.):

```typescript
const config: AIActConfig = {
  riskClassification: "high_risk",
  annexIIIReference: "point_4", // Recruitment
  obligations: {
    riskManagement: true, // Art. 9
    dataGovernance: true, // Art. 10
    technicalDocumentation: true, // Art. 11
    recordKeeping: true, // Art. 12
    transparency: true, // Art. 13
    humanOversight: true, // Art. 14
    accuracy: true, // Art. 15
    qualityManagement: true, // Art. 17
  },
};
```

**Full Compliance Required:**

- Risk management system (Art. 9)
- Data governance (Art. 10)
- Technical documentation (Art. 11)
- Automatic logging (Art. 12)
- Transparency to deployers (Art. 13)
- Human oversight design (Art. 14)
- Accuracy/robustness (Art. 15)
- Quality management (Art. 17)
- Conformity assessment (Art. 43)
- CE marking (Art. 48)
- EU database registration (Art. 49)


> Extracted from: ../SKILL.md
