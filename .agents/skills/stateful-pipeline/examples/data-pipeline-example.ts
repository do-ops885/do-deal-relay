import { createPipeline } from '../templates/state-machine';

/**
 * Example: Data ETL Pipeline
 * 
 * Demonstrates a 4-phase pipeline for extracting, transforming,
 * validating, and loading data.
 */

interface RawRecord {
  id: string;
  raw: string;
}

interface CleanRecord {
  id: string;
  name: string;
  value: number;
  validated: boolean;
}

interface PipelineInput {
  source: string;
  records: RawRecord[];
}

interface PipelineOutput {
  records: CleanRecord[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
  };
}

async function runDataPipeline(
  input: PipelineInput
): Promise<void> {
  const pipeline = createPipeline<PipelineInput, PipelineOutput>(
    [
      'extract',
      'transform',
      'validate',
      'load'
    ],
    {
      maxRetries: 3,
      onFailure: 'revert',
      enableMetrics: true,
      enableStructuredLogging: true
    }
  );

  const result = await pipeline.execute(input);

  if (result.success) {
    console.log('Pipeline completed successfully');
    console.log('Output:', result.data);
    console.log('Metrics:', result.metrics);
    console.log('Duration:', result.duration, 'ms');
  } else {
    console.error('Pipeline failed:', result.error);
    console.error('Failure path:', result.failurePath);
  }
}

// Example usage
const exampleInput: PipelineInput = {
  source: 'api-endpoint',
  records: [
    { id: '1', raw: 'name1|value1' },
    { id: '2', raw: 'name2|value2' }
  ]
};

// Run the pipeline
runDataPipeline(exampleInput).catch(console.error);

/**
 * Example Output:
 * 
 * Pipeline completed successfully
 * Output: {
 *   records: [
 *     { id: '1', name: 'name1', value: 100, validated: true },
 *     { id: '2', name: 'name2', value: 200, validated: true }
 *   ],
 *   stats: { total: 2, valid: 2, invalid: 0 }
 * }
 * Metrics: {
 *   phases: {
 *     extract: { duration: 150 },
 *     transform: { duration: 230 },
 *     validate: { duration: 120 },
 *     load: { duration: 89 }
 *   },
 *   totalDuration: 589,
 *   retryCount: 0
 * }
 */
