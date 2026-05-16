worker/pipeline/score.ts:export function calculateSourceDiversity(deals: Deal[]): number {
worker/pipeline/score.ts:export function calculateUniquenessScore(
worker/pipeline/validate-fast-path.ts:export interface FastPathResult {
worker/pipeline/normalize.ts:export function normalize(deals: Deal[], ctx: PipelineContext): Deal[] {
worker/pipeline/normalize.ts:export function verifyNormalization(deals: Deal[]): {
worker/pipeline/stage.ts:export function prepareSnapshot(
worker/pipeline/dedupe.ts:export function deduplicate(
worker/pipeline/comparison.ts:export interface ComparisonFields {
worker/config.ts:export const CONFIG = {
worker/config.ts:export const DEFAULT_SOURCES = [
worker/config.ts:export const ERROR_MESSAGES = {
worker/config.ts:export const VALIDATION_GATES = [
worker/config.ts:export type ValidationGate = (typeof VALIDATION_GATES)[number];
worker/validation/pipeline.ts:export function shouldQuarantine(deal: Deal): boolean {
worker/validation/pipeline.ts:export function calculateValidationRatio(result: ValidationResult): number {
worker/validation/types.ts:export interface ValidationResult {
worker/validation/types.ts:export interface GateResult {
worker/validation/types.ts:export interface ContextWithHashes extends PipelineContext {
worker/validation/types.ts:export function getContextHash(
worker/validation/types.ts:export function setContextHash(
