// ============================================================================
// Hybrid Query Classifier
// ============================================================================
// Combines rule-based classification with AI for optimal speed/accuracy tradeoff
//
// @deprecated Use ./hybrid/index.ts instead

export {
  HybridClassifier,
  classifyQuery,
  classifyQueriesBatch,
  shouldUseAI,
  createClassifier,
} from "./hybrid";

export type { ClassifierResult, HybridClassifierOptions } from "./hybrid";
