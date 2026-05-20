# Track D - Documentation
## Missing JSDoc for Public Exports
worker/config.ts:149:export const DEFAULT_SOURCES = [
worker/config.ts:266:export const ERROR_MESSAGES = {
worker/config.ts:280:export const VALIDATION_GATES = [
worker/config.ts:292:export type ValidationGate = [typeof VALIDATION_GATES](number);
worker/validation/types.ts:3:export interface ValidationResult {
worker/validation/types.ts:16:export interface GateResult {
worker/email/templates/commands.ts:3:export function createSuccessConfirmation(
worker/email/templates/commands.ts:117:export function createDeactivationConfirmation(
worker/email/templates/responses.ts:3:export function createSearchResultsEmail(
worker/email/templates/responses.ts:89:export function createErrorEmail(
worker/email/templates/responses.ts:167:export function createHelpEmail(): EmailTemplate {
worker/email/templates/responses.ts:289:export function createLowConfidenceEmail(
worker/email/templates/index.ts:8:export function createConfirmationEmail(
worker/email/templates/types.ts:3:export interface EmailTemplate {
worker/email/templates/types.ts:9:export type { ConfirmationEmailData };
worker/email/types.ts:7:export const EmailCommandTypeSchema = z.enum([
worker/email/types.ts:17:export const ParsedEmailSchema = z.object({
worker/email/types.ts:29:export const ParsedCommandSchema = z.object({
worker/email/types.ts:44:export const ExtractionResultSchema = z.object({
worker/email/types.ts:54:export const EmailProcessingResultSchema = z.object({
worker/email/types.ts:63:export type EmailCommandType = z.infer<typeof EmailCommandTypeSchema>;
worker/email/types.ts:64:export type ParsedEmail = z.infer<typeof ParsedEmailSchema>;
worker/email/types.ts:65:export type ParsedCommand = z.infer<typeof ParsedCommandSchema>;
worker/email/types.ts:66:export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
worker/email/types.ts:67:export type EmailProcessingResult = z.infer<typeof EmailProcessingResultSchema>;
worker/email/types.ts:73:export interface ServicePattern {
worker/email/types.ts:93:export interface SecurityResult {
worker/email/types.ts:101:export interface RateLimitStatus {
worker/email/types.ts:111:export interface ConfirmationEmailData {
worker/email/patterns/index.ts:4:export const DOMAIN_TO_SERVICE: Record<string, string> = {
worker/email/patterns/command.ts:3:export function parseCommand(email: {
worker/email/patterns/command.ts:145:export const GENERIC_PATTERNS = {
worker/email/patterns/referral.ts:3:export const SERVICE_PATTERNS: Record<string, ServicePattern> = {
worker/routes/mcp/utils.ts:32:export const SERVER_INFO = {
worker/routes/mcp/utils.ts:37:export const SERVER_CAPABILITIES = {
worker/routes/mcp/utils.ts:51:export const SERVER_INSTRUCTIONS = `
worker/routes/mcp/utils.ts:95:export const MCP_CORS_HEADERS = {
worker/routes/mcp/utils.ts:118:export function createSuccessResponse(
worker/routes/mcp/utils.ts:129:export function createErrorResponse(
worker/routes/mcp/utils.ts:146:export function createJSONResponse(
worker/routes/mcp/utils.ts:165:export function validateJSONRPCRequest(body: unknown): JSONRPCRequest | null {
worker/routes/mcp/utils.ts:170:export function validateInitializeParams(
worker/routes/mcp/utils.ts:177:export function validateToolCallParams(params: unknown): ToolCallParams | null {
worker/routes/mcp/utils.ts:182:export function validateResourceReadParams(
worker/routes/bulk/import.ts:60:export interface BulkImportResult {
worker/routes/bulk/index.ts:11:export type { BulkImportResult } from "./import";
worker/routes/webhooks/types.ts:18:export interface SubscribeRequest {
worker/routes/webhooks/types.ts:27:export interface CreatePartnerRequest {
worker/routes/webhooks/types.ts:33:export interface CreateSyncConfigRequest {
worker/routes/webhooks/types.ts:44:export interface UnsubscribeRequest {
worker/routes/webhooks/types.ts:52:export const VALID_WEBHOOK_EVENTS: WebhookEventType[] = [
worker/routes/webhooks/types.ts:66:export function jsonResponse(data: unknown, status: number = 200): Response {
worker/routes/nlq/utils.ts:10:export const ENDPOINT_PATH = "/api/nlq";
worker/types.ts:8:export const RewardTypeSchema = z.enum(["cash", "credit", "percent", "item"]);
worker/types.ts:10:export const RewardSchema = z.object({
worker/types.ts:17:export const SourceSchema = z.object({
worker/types.ts:24:export const ExpirySchema = z.object({
worker/types.ts:30:export const DealMetadataSchema = z.object({
worker/types.ts:38:export const DealSchema = z.object({
worker/types.ts:51:export type RewardType = z.infer<typeof RewardTypeSchema>;
worker/types.ts:52:export type Reward = z.infer<typeof RewardSchema>;
worker/types.ts:53:export type Source = z.infer<typeof SourceSchema>;
worker/types.ts:54:export type Expiry = z.infer<typeof ExpirySchema>;
worker/types.ts:55:export type DealMetadata = z.infer<typeof DealMetadataSchema>;
worker/types.ts:56:export type Deal = z.infer<typeof DealSchema>;
worker/types.ts:62:export const SnapshotStatsSchema = z.object({
worker/types.ts:70:export const SnapshotSchema = z.object({
worker/types.ts:82:export type SnapshotStats = z.infer<typeof SnapshotStatsSchema>;
worker/types.ts:83:export type Snapshot = z.infer<typeof SnapshotSchema>;
worker/types.ts:89:export const LogEntrySchema = z.object({
worker/types.ts:128:export type LogEntry = z.infer<typeof LogEntrySchema>;
worker/types.ts:134:export const SourceClassificationSchema = z.enum([
worker/types.ts:141:export const SourceConfigSchema = z.object({
worker/types.ts:154:export type SourceClassification = z.infer<typeof SourceClassificationSchema>;
worker/types.ts:155:export type SourceConfig = z.infer<typeof SourceConfigSchema>;
worker/types.ts:161:export const PipelinePhaseSchema = z.enum([
worker/types.ts:174:export const FailurePathSchema = z.enum([
worker/types.ts:182:export type PipelinePhase = z.infer<typeof PipelinePhaseSchema>;
worker/types.ts:183:export type FailurePath = z.infer<typeof FailurePathSchema>;
worker/types.ts:187:export interface PipelineContext {
worker/types.ts:208:export interface PipelineMetrics {
worker/types.ts:243:export const ErrorClassSchema = z.enum([
worker/types.ts:254:export type ErrorClass = z.infer<typeof ErrorClassSchema>;
worker/types.ts:256:export class PipelineError extends Error {
worker/types.ts:272:export const GetDealsQuerySchema = z.object({
worker/types.ts:278:export const SubmitDealBodySchema = z.object({
worker/types.ts:285:export type GetDealsQuery = z.infer<typeof GetDealsQuerySchema>;
worker/types.ts:286:export type SubmitDealBody = z.infer<typeof SubmitDealBodySchema>;
worker/types.ts:292:export interface NotificationEvent {
worker/types.ts:309:export interface Env {
worker/types.ts:341:export interface HealthStatus {
worker/types.ts:380:export interface Metrics {
worker/types.ts:395:export interface WorldState {
worker/types.ts:406:export type WorldStateKey = keyof WorldState;
worker/types.ts:408:export interface GOAPAction {
worker/types.ts:419:export interface ReferralInput {
worker/types.ts:455:export interface ReferralDeactivateBody {
worker/types.ts:462:export interface ReferralSearchQuery {
worker/types.ts:473:export interface ReferralResearchResult {
worker/types.ts:494:export interface WebResearchRequest {
worker/types.ts:508:export interface ExpiringDeal {
worker/types.ts:526:export const ReferralDeactivateBodySchema = z.object({
worker/types.ts:533:export const ReferralSearchQuerySchema = z.object({
worker/types.ts:544:export const WebResearchRequestSchema = z.object({
worker/types.ts:564:export const ExperienceEventTypeSchema = z.enum([
worker/types.ts:571:export type ExperienceEventType = z.infer<typeof ExperienceEventTypeSchema>;
worker/types.ts:573:export const ExperienceEventInputSchema = z.object({
worker/types.ts:581:export type ExperienceEventInput = z.infer<typeof ExperienceEventInputSchema>;
worker/types.ts:583:export interface ExperienceEvent {
worker/types.ts:593:export interface ExperienceAggregate {
worker/lib/referral-storage/index.ts:6:export type { ReferralStorageKeys } from "./types";
worker/lib/referral-storage/types.ts:8:export const REFERRAL_KEYS = {
worker/lib/referral-storage/types.ts:19:export type ReferralStorageKeys = typeof REFERRAL_KEYS;
worker/lib/circuit-breaker.ts:8:export type CircuitState = "closed" | "open" | "half-open";
worker/lib/circuit-breaker.ts:10:export interface CircuitBreakerOptions {
worker/lib/circuit-breaker.ts:94:export class CircuitBreaker {
worker/lib/circuit-breaker.ts:340:export class CircuitBreakerOpenError extends Error {
worker/lib/circuit-breaker.ts:380:export function getSourceCircuitBreaker(
worker/lib/circuit-breaker.ts:408:export function getAllCircuitBreakerMetrics(): Record<
worker/lib/circuit-breaker.ts:419:export function resetAllMetrics(): void {
worker/lib/rate-limit.ts:59:export interface RateLimitResult {
worker/lib/webhook/types.ts:7:export interface WebhookSubscription {
worker/lib/webhook/types.ts:21:export type WebhookEventType =
worker/lib/webhook/types.ts:30:export interface RetryPolicy {
worker/lib/webhook/types.ts:37:export interface WebhookFilters {
worker/lib/webhook/types.ts:42:export interface WebhookEvent {
worker/lib/webhook/types.ts:54:export interface WebhookDelivery {
worker/lib/webhook/types.ts:63:export interface WebhookAttempt {
worker/lib/webhook/types.ts:70:export interface IncomingWebhookPayload {
worker/lib/webhook/types.ts:77:export interface ReferralWebhookData {
worker/lib/webhook/types.ts:93:export interface WebhookPartner {
worker/lib/webhook/types.ts:103:export interface IncomingWebhookResult {
worker/lib/webhook/types.ts:111:export interface SyncConfig {
worker/lib/webhook/types.ts:129:export interface SyncState {
worker/lib/webhook/types.ts:139:export interface RateLimitResult {
worker/lib/webhook/types.ts:144:export interface IdempotencyCheck {
worker/lib/webhook/types.ts:149:export interface IdempotencyRecord {
worker/lib/webhook/types.ts:157:export interface DeadLetterEvent {
worker/lib/webhook/types.ts:168:export const DEFAULT_RETRY_POLICY: RetryPolicy = {
worker/lib/webhook/types.ts:175:export const WEBHOOK_RATE_LIMIT_TTL = 3600; // 1 hour
worker/lib/webhook/types.ts:181:export function getWebhookKV(env: Env): KVNamespace | null {
worker/lib/webhook/types.ts:190:export function generateId(): string {
worker/lib/validation/url-validator.ts:24:export interface UrlValidationResult {
worker/lib/validation/url-validator.ts:37:export interface BatchValidationResult {
worker/lib/validation/code-validator.ts:23:export interface CodeValidationResult {
worker/lib/validation/code-validator.ts:40:export interface PageValidationResult {
worker/lib/validation/code-validator.ts:49:export interface RedemptionTestResult {
worker/lib/validation/reward-scraper.ts:23:export interface RewardScrapeResult {
worker/lib/validation/reward-scraper.ts:40:export interface RewardChange {
worker/lib/mcp/handlers/report.ts:9:export const ReportDealInputSchema = z.object({
worker/lib/mcp/handlers/discovery.ts:8:export const GetSimilarDealsInputSchema = z.object({
worker/lib/mcp/handlers/logging.ts:6:export const GetLogsInputSchema = z.object({
worker/lib/mcp/handlers/referrals.ts:9:export const GetDealInputSchema = z.object({
worker/lib/mcp/handlers/referrals.ts:13:export const AddReferralInputSchema = z.object({
worker/lib/mcp/handlers/validation.ts:6:export const ValidateDealInputSchema = z.object({
worker/lib/mcp/handlers/categories.ts:5:export const ListCategoriesInputSchema = z.object({
worker/lib/mcp/handlers/experience.ts:16:export const ExperienceDealInputSchema = z.object({
worker/lib/mcp/handlers/nlq.ts:6:export const NaturalLanguageQueryInputSchema = z.object({
worker/lib/mcp/handlers/search.ts:7:export const SearchDealsInputSchema = z.object({
worker/lib/mcp/handlers/research.ts:6:export const ResearchDomainInputSchema = z.object({
worker/lib/mcp/resources.ts:34:export const MCP_RESOURCES: Resource[] = [
worker/lib/mcp/resources.ts:51:export const MCP_RESOURCE_TEMPLATES: ResourceTemplate[] = [
worker/lib/mcp/types.ts:76:export const MCP_PROTOCOL_VERSION_FALLBACK = "2025-03-26";
worker/lib/mcp/types.ts:469:export const MCPErrorCodes = {
worker/lib/mcp/tools/user.ts:21:export const userTools: Tool[] = [
worker/lib/mcp/tools/user.ts:162:export const userToolHandlers: Record<string, ToolHandler> = {
worker/lib/mcp/tools/system.ts:24:export const systemTools: Tool[] = [
worker/lib/mcp/tools/system.ts:170:export const systemToolHandlers: Record<string, ToolHandler> = {
worker/lib/mcp/tools/deals.ts:19:export const dealTools: Tool[] = [
worker/lib/mcp/tools/deals.ts:186:export const dealToolHandlers: Record<string, ToolHandler> = {
worker/lib/mcp/tools/research.ts:22:export const researchTools: Tool[] = [
worker/lib/mcp/tools/research.ts:123:export const researchToolHandlers: Record<string, ToolHandler> = {
worker/lib/cache.ts:8:export interface CacheEntry<T> {
worker/lib/cache.ts:18:export interface CacheMetrics {
worker/lib/cache.ts:36:export class KVCache {
worker/lib/categorization/definitions.ts:5:export interface CategoryDefinition {
worker/lib/categorization/definitions.ts:11:export const CATEGORY_DEFINITIONS: Record<string, CategoryDefinition> = {
worker/lib/categorization/index.ts:8:export function autoCategorize(deal: Deal): DealMetadata {
worker/lib/categorization/index.ts:70:export function batchAutoCategorize(deals: Deal[]): Deal[] {
worker/lib/categorization/index.ts:81:export function getCategoryStats(deals: Deal[]): Record<string, number> {
worker/lib/categorization/index.ts:93:export function getTagStats(deals: Deal[]): Record<string, number> {
worker/lib/categorization/scoring.ts:8:export interface TagDefinition {
worker/lib/categorization/scoring.ts:13:export const TAG_DEFINITIONS: Record<string, TagDefinition> = {
worker/lib/categorization/scoring.ts:69:export function calculateCategoryScores(deal: Deal): Map<string, number> {
worker/lib/categorization/scoring.ts:108:export function calculateTagScores(deal: Deal): Map<string, number> {
worker/lib/guard-rails.ts:8:export interface GuardRailCheck {
worker/lib/guard-rails.ts:14:export interface GuardRailResult {
worker/lib/guard-rails.ts:20:export interface GuardRailReport {
worker/lib/rate-limit-kv.ts:25:export interface RateLimitKVResult {
worker/lib/rate-limit-kv.ts:102:export interface RateLimitStore {
worker/lib/ranking.ts:7:export type SortField = "confidence" | "recency" | "value" | "expiry" | "trust";
worker/lib/ranking.ts:8:export type SortOrder = "asc" | "desc";
worker/lib/ranking.ts:10:export interface RankOptions {
worker/lib/github/types.ts:11:export interface GitHubContent {
worker/lib/github/types.ts:16:export interface WorkflowRun {
worker/lib/github/types.ts:33:export interface WorkflowStatus {
worker/lib/github/core.ts:27:export function getGitHubLogger(env?: Env) {
worker/lib/github/core.ts:43:export function initGitHubCircuitBreaker(env?: GitHubCacheEnv): void {
worker/lib/github/core.ts:50:export function setGitHubToken(token: string): void {
worker/lib/github/core.ts:54:export function resetGitHubToken(): void {
worker/lib/github/core.ts:58:export function getGitHubConfig() {
worker/lib/metrics/stats.ts:376:export interface PhaseTimingStats {
worker/lib/metrics/core.ts:4:export function createMetrics(run_id: string): PipelineMetrics {
worker/lib/metrics/core.ts:58:export function recordPhaseTiming(
worker/lib/metrics/core.ts:68:export function recordDealCount(
worker/lib/metrics/core.ts:83:export function recordError(metrics: PipelineMetrics): void {
worker/lib/metrics/core.ts:86:export function recordRetry(metrics: PipelineMetrics): void {
worker/lib/metrics/core.ts:90:export function recordValidationGateRejection(
worker/lib/metrics/core.ts:102:export function recordValidationGatePass(
worker/lib/metrics/core.ts:114:export function recordValidationCacheMetric(
worker/lib/metrics/core.ts:131:export function finalizeMetrics(
worker/lib/hmac.ts:5:export interface HmacConfig {
worker/lib/hmac.ts:10:export interface SignatureResult {
worker/lib/logger/legacy.ts:53:export function createLogBuilder(run_id: string, trace_id: string): LogBuilder {
worker/lib/logger/legacy.ts:57:export class LogBuilder {
worker/lib/logger/structured.ts:117:export function createStructuredLogger(
worker/lib/logger/types.ts:3:export const LOG_KEY_PREFIX = "log:";
worker/lib/logger/types.ts:4:export const LOG_INDEX_KEY = "log:index";
worker/lib/logger/types.ts:5:export const STRUCTURED_LOG_PREFIX = "logs:";
worker/lib/logger/types.ts:6:export const TRACE_INDEX_PREFIX = "trace:";
worker/lib/logger/types.ts:8:export interface LogIndex {
worker/lib/logger/types.ts:14:export interface StructuredLogEntry {
worker/lib/logger/types.ts:30:export interface Logger {
worker/lib/auth.ts:15:export interface AuthResult {
worker/lib/auth.ts:22:export interface ApiKeyConfig {
worker/lib/webhook-sdk.ts:48:export type WebhookEventType =
worker/lib/webhook-sdk.ts:57:export interface ReferralWebhookData {
worker/lib/webhook-sdk.ts:73:export interface WebhookEvent {
worker/lib/webhook-sdk.ts:85:export interface WebhookClientConfig {
worker/lib/webhook-sdk.ts:93:export interface WebhookServerConfig {
worker/lib/webhook-sdk.ts:102:export class WebhookClient {
worker/lib/webhook-sdk.ts:278:export class WebhookServer {
worker/lib/webhook-sdk.ts:446:export function isReferralCreatedEvent(
worker/lib/webhook-sdk.ts:455:export function isReferralUpdatedEvent(
worker/lib/webhook-sdk.ts:464:export function isReferralDeactivatedEvent(
worker/lib/webhook-sdk.ts:473:export function isPingEvent(
worker/lib/analytics/calculators.ts:9:export function calculateDealsOverTime(
worker/lib/analytics/calculators.ts:72:export function calculateCategoryBreakdown(
worker/lib/analytics/calculators.ts:115:export function calculateSourcePerformance(
worker/lib/analytics/calculators.ts:163:export function calculateValueDistribution(
worker/lib/analytics/calculators.ts:197:export function calculateExpiringSoon(
worker/lib/analytics/calculators.ts:238:export function calculateQualityMetrics(
worker/lib/analytics/types.ts:7:export interface DealAnalytics {
worker/lib/analytics/types.ts:55:export interface AnalyticsSummary {
worker/lib/analytics/dashboard.ts:7:export function generateDashboardHTML(analytics: DealAnalytics): string {
worker/lib/d1/client.ts:15:export interface D1ErrorInfo {
worker/lib/d1/client.ts:21:export interface QueryResult<T> {
worker/lib/d1/client.ts:34:export interface SingleResult<T> {
worker/lib/d1/client.ts:44:export interface D1ClientConfig {
worker/lib/d1/client.ts:58:export class D1Client {
worker/lib/d1/experience.ts:6:export interface ExperienceEventResult {
worker/lib/d1/experience.ts:12:export interface ExperienceAggregateResult {
worker/lib/d1/experience.ts:18:export interface AggregationResult {
worker/lib/d1/queries.ts:14:export interface DealSearchResult {
worker/lib/d1/queries.ts:33:export interface DealStats {
worker/lib/d1/queries.ts:53:export interface ExpiringDeal {
worker/lib/d1/queries.ts:63:export interface ReferralCodeResult {
worker/lib/d1/migrations.ts:13:export interface Migration {
worker/lib/d1/migrations.ts:20:export interface MigrationRecord {
worker/lib/d1/migrations.ts:26:export interface MigrationResult {
worker/lib/d1/migrations.ts:34:export interface MigrationStatus {
worker/lib/d1/migrations.ts:45:export const MIGRATIONS: Migration[] = [
worker/lib/d1/migrations.ts:414:export class MigrationRunner {
worker/lib/d1/migrations.ts:622:export function createMigrationRunner(db: D1Database): MigrationRunner {
worker/lib/expiration/scheduling.ts:8:export const EXPIRY_CHECK_KEY = "meta:last_expiry_check";
worker/lib/expiration/scheduling.ts:9:export const EXPIRED_DEALS_KEY = "meta:expired_deals";
worker/lib/expiration/scheduling.ts:10:export const NOTIFIED_EXPIRING_KEY = "meta:notified_expiring";
worker/lib/expiration/scheduling.ts:11:export const VALIDATION_STATS_KEY = "meta:validation_stats";
worker/lib/expiration/scheduling.ts:12:export const LAST_VALIDATION_KEY = "meta:last_validation";
worker/lib/expiration/index.ts:138:export function isExpiringSoon(deal: Deal, days: number): boolean {
worker/lib/expiration/index.ts:152:export function calculateExpiryUrgency(deal: Deal): number {
worker/lib/feature-flags.ts:53:export interface FeatureFlag {
worker/lib/feature-flags.ts:63:export interface FeatureFlagResult {
worker/lib/validation-cache/key.ts:3:export function normalizeUrl(input: string): string {
worker/lib/validation-cache/index-repository.ts:13:export class ValidationIndexRepository {
worker/lib/validation-cache/repository.ts:13:export class ValidationCacheRepository {
worker/lib/validation-cache/repository.ts:32:export function ttlForStatus(status: ValidationCacheEntry["status"]): number {
worker/lib/research-agent/orchestrator.ts:555:export type { ExtractedReferral };
worker/lib/research-agent/fetcher.ts:16:export interface FetchResult {
worker/lib/research-agent/fetcher.ts:25:export interface ExtractedReferral {
worker/lib/research-agent/types.ts:7:export interface ResearchSource {
worker/lib/research-agent/types.ts:43:export interface ResearchCacheEntry {
worker/lib/research-agent/types.ts:70:export interface ProductHuntResponse {
worker/lib/research-agent/types.ts:94:export interface GitHubSearchResponse {
worker/lib/research-agent/types.ts:114:export interface HackerNewsSearchResponse {
worker/lib/research-agent/types.ts:140:export interface RedditListingChild {
worker/lib/research-agent/types.ts:145:export interface RedditListingResponse {
worker/lib/research-agent/types.ts:214:export const KNOWN_REFERRAL_PROGRAMS: {
worker/lib/research-agent/types.ts:280:export const RESEARCH_SOURCES: ResearchSource[] = [
worker/lib/research-agent/types.ts:406:export function normalizeResearchQuery(query: string, domain?: string): string {
worker/lib/research-agent/types.ts:423:export function generateSearchQueries(
worker/lib/research-agent/types.ts:465:export function generatePotentialCodes(
worker/lib/research-agent/types.ts:493:export function generateSampleCode(domain: string, index: number): string {
worker/lib/research-agent/types.ts:533:export function generateSimulatedCode(source: string, index: number): string {
worker/lib/research-agent/types.ts:553:export function generateSimulatedReward(source: string): string {
worker/lib/research-agent/types.ts:572:export function deduplicateCodes(
worker/lib/research-agent/types.ts:584:export function extractRewardValue(rewardSummary?: string): number | undefined {
worker/lib/eu-ai-act-logger.ts:20:export interface AIActLogEntry {
worker/lib/eu-ai-act-logger.ts:63:export interface ComplianceConfig {
worker/lib/eu-ai-act-logger.ts:77:export class EUAIActLogger {
worker/lib/global-logger.ts:5:export type LogLevel = "debug" | "info" | "warn" | "error";
worker/lib/global-logger.ts:88:export const logger = {
worker/lib/nlq/hybrid-classifier.ts:16:export type { ClassifierResult, HybridClassifierOptions } from "./hybrid";
worker/lib/nlq/ai-enhancer.ts:17:export type {
worker/lib/nlq/index.ts:15:export type {
worker/lib/nlq/index.ts:32:export type { ClassifierResult, HybridClassifierOptions } from "./hybrid";
worker/lib/nlq/types.ts:15:export const NLQIntentSchema = z.enum([
worker/lib/nlq/types.ts:25:export type NLQIntent = z.infer<typeof NLQIntentSchema>;
worker/lib/nlq/types.ts:27:export interface IntentClassification {
worker/lib/nlq/types.ts:38:export const RewardTypeSchema = z.enum(["cash", "credit", "percent", "item"]);
worker/lib/nlq/types.ts:39:export type RewardType = z.infer<typeof RewardTypeSchema>;
worker/lib/nlq/types.ts:41:export const ComparisonOperatorSchema = z.enum([
worker/lib/nlq/types.ts:50:export type ComparisonOperator = z.infer<typeof ComparisonOperatorSchema>;
worker/lib/nlq/types.ts:52:export interface ExtractedEntity {
worker/lib/nlq/types.ts:66:export interface ParsedQuery {
worker/lib/nlq/types.ts:78:export const SortOrderSchema = z.enum(["asc", "desc"]);
worker/lib/nlq/types.ts:79:export type SortOrder = z.infer<typeof SortOrderSchema>;
worker/lib/nlq/types.ts:81:export const SortFieldSchema = z.enum([
worker/lib/nlq/types.ts:89:export type SortField = z.infer<typeof SortFieldSchema>;
worker/lib/nlq/types.ts:91:export interface FilterCondition {
worker/lib/nlq/types.ts:97:export interface StructuredQuery {
worker/lib/nlq/types.ts:117:export const NLQRequestSchema = z.object({
worker/lib/nlq/types.ts:131:export type NLQRequest = z.infer<typeof NLQRequestSchema>;
worker/lib/nlq/types.ts:133:export interface NLQExplanation {
worker/lib/nlq/types.ts:145:export interface NLQResult {
worker/lib/nlq/types.ts:156:export interface NLQError {
worker/lib/nlq/types.ts:167:export interface Token {
worker/lib/nlq/types.ts:184:export interface NLQConfig {
worker/lib/nlq/ai/index.ts:17:export type {
worker/lib/nlq/ai/index.ts:60:export class AIQueryEnhancer {
worker/lib/nlq/ai/index.ts:292:export function isComplexQuery(query: string): boolean {
worker/lib/nlq/ai/types.ts:5:export interface Entity {
worker/lib/nlq/ai/types.ts:12:export interface ExtractedIntent {
worker/lib/nlq/ai/types.ts:18:export interface QueryExpansion {
worker/lib/nlq/ai/types.ts:24:export interface EnhancedQuery {
worker/lib/nlq/ai/types.ts:35:export interface QueryFilters {
worker/lib/nlq/ai/types.ts:50:export interface AIEnhancerOptions {
worker/lib/nlq/hybrid/ai-decision.ts:8:export interface HybridClassifierOptions {
worker/lib/nlq/hybrid/index.ts:23:export interface ClassifierResult {
worker/lib/nlq/hybrid/index.ts:31:export type { HybridClassifierOptions } from "./ai-decision";
worker/lib/nlq/hybrid/index.ts:37:export class HybridClassifier {
worker/types/validation-cache.ts:8:export interface ValidationCacheEntry {
