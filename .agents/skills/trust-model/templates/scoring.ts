/**
 * Trust Model Scoring Template
 *
 * Source classification and confidence scoring system.
 */

export interface TrustFactor {
  name: string;
  weight: number;
  score: number;
}

export interface TrustScore {
  value: number;
  factors: TrustFactor[];
  confidence: number;
  timestamp: number;
}

export interface Source {
  id: string;
  name: string;
  tier: "official" | "verified" | "community" | "unverified";
  metrics: SourceMetrics;
  history: HistoryEntry[];
}

export interface SourceMetrics {
  predictions: number;
  correct: number;
  lastUpdate: number;
  averageLatency: number;
}

export interface HistoryEntry {
  timestamp: number;
  predicted: unknown;
  actual: unknown;
  correct: boolean;
}

export interface TrustConfig {
  factors: string[];
  weights: Record<string, number>;
  method: "weighted" | "min" | "bayesian";
  thresholds: {
    high: number;
    medium: number;
    low: number;
  };
  decay?: {
    type: "exponential" | "linear";
    halfLife: number;
  };
}

export class TrustModel {
  private config: TrustConfig;

  constructor(config: TrustConfig) {
    this.config = config;
    this.validateWeights();
  }

  private validateWeights(): void {
    const total = Object.values(this.config.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.001) {
      throw new Error("Weights must sum to 1");
    }
  }

  async score(source: Source): Promise<TrustScore> {
    const factors: TrustFactor[] = [];
    let totalScore = 0;

    for (const factorName of this.config.factors) {
      const weight = this.config.weights[factorName] || 0;
      const score = this.calculateFactor(factorName, source);
      factors.push({ name: factorName, weight, score });
      totalScore += weight * score;
    }

    // Apply decay if configured
    if (this.config.decay) {
      const age = (Date.now() - source.metrics.lastUpdate) / 1000;
      const decayFactor = this.calculateDecay(age);
      totalScore *= decayFactor;
    }

    return {
      value: Math.max(0, Math.min(1, totalScore)),
      factors,
      confidence: this.calculateConfidence(source),
      timestamp: Date.now(),
    };
  }

  private calculateFactor(name: string, source: Source): number {
    switch (name) {
      case "reputation":
        return source.metrics.predictions > 0
          ? source.metrics.correct / source.metrics.predictions
          : 0.5;
      case "freshness":
        const age = (Date.now() - source.metrics.lastUpdate) / 3600000;
        return 1 / (1 + age);
      case "consistency":
        if (source.history.length < 2) return 0.5;
        const recent = source.history.slice(-10);
        const correct = recent.filter((h) => h.correct).length;
        return correct / recent.length;
      case "volume":
        return Math.min(source.metrics.predictions / 100, 1);
      default:
        return 0.5;
    }
  }

  private calculateDecay(age: number): number {
    if (!this.config.decay) return 1;
    const { type, halfLife } = this.config.decay;
    if (type === "exponential") {
      return Math.pow(0.5, age / halfLife);
    }
    return Math.max(0, 1 - age / halfLife);
  }

  private calculateConfidence(source: Source): number {
    // More data = higher confidence
    const n = source.metrics.predictions;
    return Math.min(Math.sqrt(n) / 10, 1);
  }

  classify(score: TrustScore): "high" | "medium" | "low" {
    const { thresholds } = this.config;
    if (score.value >= thresholds.high) return "high";
    if (score.value >= thresholds.medium) return "medium";
    return "low";
  }

  async scoreWithCI(
    source: Source,
    options: { confidence?: number } = {},
  ): Promise<TrustScore & { lower: number; upper: number }> {
    const score = await this.score(source);
    const ci = options.confidence || 0.95;
    const z = ci === 0.95 ? 1.96 : 1;
    const margin = z * (1 - score.confidence) * 0.1;

    return {
      ...score,
      lower: Math.max(0, score.value - margin),
      upper: Math.min(1, score.value + margin),
    };
  }
}

// Risk-based action engine
export class RiskActions {
  private config: Record<string, RiskAction>;

  constructor(config: Record<string, RiskAction>) {
    this.config = config;
  }

  async handle(score: TrustScore, data: unknown): Promise<void> {
    const level =
      score.value >= 0.8 ? "high" : score.value >= 0.5 ? "medium" : "low";
    const action = this.config[level];

    if (action.alert) {
      console.log(`Alert: Trust score ${score.value} for`, data);
    }
    if (action.quarantine) {
      console.log("Quarantining data");
    }
    if (action.autoProcess) {
      console.log("Auto-processing data");
    }
  }
}

export interface RiskAction {
  autoProcess?: boolean;
  alert?: boolean;
  quarantine?: boolean;
  review?: boolean;
}

// Source registry for managing sources
export class SourceRegistry {
  private sources: Map<string, Source> = new Map();

  async register(source: Source): Promise<void> {
    this.sources.set(source.id, source);
  }

  async updateMetrics(
    id: string,
    metrics: Partial<SourceMetrics>,
  ): Promise<void> {
    const source = this.sources.get(id);
    if (source) {
      Object.assign(source.metrics, metrics);
    }
  }

  get(id: string): Source | undefined {
    return this.sources.get(id);
  }

  getAll(): Source[] {
    return Array.from(this.sources.values());
  }
}
