/**
 * Pre-calculated fields used for deal comparison and similarity checks.
 * Stored in PipelineContext.comparisonCache to avoid redundant work.
 */
export interface ComparisonFields {
  /**
   * Normalized title (lowercase, alphanumeric only)
   */
  normalizedTitle: string;

  /**
   * Character bigrams of the normalized title
   */
  titleBigrams: Set<string>;

  /**
   * Parsed deal URL
   */
  dealUrl: URL;

  /**
   * Normalized deal URL string
   */
  normalizedUrl: string;

  /**
   * Parsed source URL
   */
  sourceUrl: URL;

  /**
   * Reward key (type:value)
   */
  rewardKey: string;
}
