/**
 * TIER 2 EXTENSION POINT: JUDGING ENGINE INTERFACES
 *
 * This module defines the architectural interfaces and types for Tier 2.
 * Actual execution logic is deferred to the Tier 2 implementation prompt.
 */

export interface RubricCriterion {
  id: string;
  eventId: string;
  name: string;
  description: string;
  weight: number; // percentage or multiplier (e.g. 0.3 for 30%)
  maxPoints: number; // e.g. 10 or 100
}

export interface JudgeAssignment {
  id: string;
  eventId: string;
  judgeUserId: string;
  projectId: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  assignedAt: string;
}

export interface RubricScore {
  id: string;
  assignmentId: string;
  criterionId: string;
  score: number;
  feedback?: string;
  submittedAt: string;
}

export interface NormalizationResult {
  projectId: string;
  rawScore: number;
  zScore: number;
  trimmedMean: number;
  finalRank: number;
}

export interface IJudgingService {
  assignJudgesToProjects(eventId: string, strategy: 'ROUND_ROBIN' | 'TRACK_SPECIALIZED'): Promise<JudgeAssignment[]>;
  recordScore(judgeId: string, score: RubricScore): Promise<void>;
  computeNormalizedRankings(eventId: string): Promise<NormalizationResult[]>;
  exportResultsCsv(eventId: string): Promise<string>;
}
