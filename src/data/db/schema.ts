export const schema = `
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE learners (id TEXT PRIMARY KEY, profileId TEXT UNIQUE, createdAt INTEGER NOT NULL);
CREATE TABLE learner_settings (learnerId TEXT PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE concepts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE quizzes (id TEXT PRIMARY KEY, conceptId TEXT NOT NULL REFERENCES concepts(id), data TEXT NOT NULL);
CREATE TABLE memory_state (learnerId TEXT PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE concept_progress (learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, conceptId TEXT NOT NULL REFERENCES concepts(id), dueAt INTEGER NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(learnerId,conceptId));
CREATE INDEX progress_due ON concept_progress(learnerId,dueAt);
CREATE TABLE learning_sessions (id TEXT PRIMARY KEY, learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, conceptId TEXT NOT NULL REFERENCES concepts(id), occurrenceId TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE attempts (id TEXT PRIMARY KEY, learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, sessionId TEXT NOT NULL UNIQUE REFERENCES learning_sessions(id) ON DELETE CASCADE, conceptId TEXT NOT NULL, quizId TEXT NOT NULL, occurrenceId TEXT NOT NULL, selectedOptionId TEXT NOT NULL, correct INTEGER NOT NULL CHECK(correct IN (0,1)), isGraded INTEGER NOT NULL CHECK(isGraded IN (0,1)), answeredAt INTEGER NOT NULL, localDate TEXT NOT NULL, timezoneAtAnswer TEXT NOT NULL);
CREATE UNIQUE INDEX graded_occurrence ON attempts(learnerId,occurrenceId) WHERE isGraded=1;
CREATE INDEX attempts_time ON attempts(learnerId,answeredAt);
CREATE TABLE ai_cache (learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, key TEXT NOT NULL, text TEXT NOT NULL, createdAt INTEGER NOT NULL, accessedAt INTEGER NOT NULL, PRIMARY KEY(learnerId,key));
CREATE TABLE automation_jobs (learnerId TEXT PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE, revision INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE scheduled_notifications (id TEXT PRIMARY KEY, learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, fingerprint TEXT NOT NULL);
CREATE TABLE consumed_notification_events (eventId TEXT PRIMARY KEY, consumedAt INTEGER NOT NULL);
PRAGMA user_version=1;
`;

/** V3: answers from gap surfaces and their spacing, separate from app grading. */
export const gapSchema = `
CREATE TABLE IF NOT EXISTS gap_progress (learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, conceptId TEXT NOT NULL REFERENCES concepts(id), dueAt INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(learnerId,conceptId));
CREATE INDEX IF NOT EXISTS gap_due ON gap_progress(learnerId,dueAt);
CREATE TABLE IF NOT EXISTS gap_events (id TEXT PRIMARY KEY, learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, conceptId TEXT NOT NULL REFERENCES concepts(id), questionId TEXT NOT NULL, selectedOptionId TEXT NOT NULL, correct INTEGER NOT NULL CHECK(correct IN (0,1)), answeredAt INTEGER NOT NULL, localDate TEXT NOT NULL);
DROP TABLE IF EXISTS scheduled_notifications;
PRAGMA user_version=3;
`;

/** V4: per-concept conversations with the AI, kept until the learner resets. */
export const chatSchema = `
CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, conceptId TEXT NOT NULL REFERENCES concepts(id), role TEXT NOT NULL CHECK(role IN ('user','assistant')), text TEXT NOT NULL, quote TEXT, createdAt INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS chat_by_concept ON chat_messages(learnerId,conceptId,createdAt);
PRAGMA user_version=4;
`;

/** V5: installed subjects, per-knowledge resolution, and AI 7-day plans. */
export const v3Schema = `
CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, installedAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS knowledge_state (learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, conceptId TEXT NOT NULL REFERENCES concepts(id), data TEXT NOT NULL, PRIMARY KEY(learnerId,conceptId));
CREATE TABLE IF NOT EXISTS plans (learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, subjectId TEXT NOT NULL, createdAt INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(learnerId,subjectId));
PRAGMA user_version=5;
`;

/**
 * V6 (app V4): confusion memories with their evidence, AI-made questions (immutable once
 * approved), personalization jobs, per-day budgets and the daily check assignment.
 * The budget survives "reset learning" so a reset cannot reopen today's quota.
 */
export const v6Schema = `
CREATE TABLE IF NOT EXISTS confusion_memories (id TEXT PRIMARY KEY, learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, subjectId TEXT NOT NULL, conceptId TEXT NOT NULL REFERENCES concepts(id), skillKey TEXT NOT NULL, summary TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('candidate','active','improving','resolved','archived')), revision INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL, lastEvidenceAt INTEGER NOT NULL, lastCheckAt INTEGER, data TEXT NOT NULL DEFAULT '{}', UNIQUE(learnerId,subjectId,conceptId,skillKey));
CREATE TABLE IF NOT EXISTS confusion_evidence (id TEXT PRIMARY KEY, memoryId TEXT NOT NULL REFERENCES confusion_memories(id) ON DELETE CASCADE, learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, sourceKind TEXT NOT NULL CHECK(sourceKind IN ('attempt','gap','chat')), sourceId TEXT NOT NULL, sourceVersion TEXT NOT NULL, quizId TEXT, localDate TEXT NOT NULL, occurredAt INTEGER NOT NULL, evidenceType TEXT NOT NULL CHECK(evidenceType IN ('wrong-answer','learner-statement','check-right','check-wrong')), UNIQUE(memoryId,sourceKind,sourceId));
CREATE TABLE IF NOT EXISTS evidence_checkpoints (learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, sourceKind TEXT NOT NULL, sourceId TEXT NOT NULL, processedAt INTEGER NOT NULL, ignored INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(learnerId,sourceKind,sourceId));
CREATE TABLE IF NOT EXISTS generated_questions (id TEXT PRIMARY KEY, learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, subjectId TEXT NOT NULL, conceptId TEXT NOT NULL REFERENCES concepts(id), memoryId TEXT REFERENCES confusion_memories(id) ON DELETE SET NULL, kind TEXT NOT NULL CHECK(kind IN ('gap','check')), quiz TEXT NOT NULL, basisId TEXT NOT NULL, basisVersion INTEGER NOT NULL, factIds TEXT NOT NULL, promptVersion TEXT NOT NULL, model TEXT NOT NULL, contentHash TEXT NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','hidden','expired')), review TEXT NOT NULL DEFAULT '{}', UNIQUE(learnerId,subjectId,contentHash));
CREATE INDEX IF NOT EXISTS generated_by_owner ON generated_questions(learnerId,subjectId,status);
CREATE TABLE IF NOT EXISTS personalization_jobs (id TEXT PRIMARY KEY, learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, subjectId TEXT NOT NULL, capturedScope TEXT NOT NULL, inputFingerprint TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled')), attemptCount INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, errorCode TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS job_success ON personalization_jobs(learnerId,inputFingerprint) WHERE status='succeeded';
CREATE TABLE IF NOT EXISTS personalization_budget (learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, localDate TEXT NOT NULL, timezone TEXT NOT NULL, dispatchCount INTEGER NOT NULL DEFAULT 0, pipelineAttempts INTEGER NOT NULL DEFAULT 0, gapApprovedCount INTEGER NOT NULL DEFAULT 0, checkApprovedCount INTEGER NOT NULL DEFAULT 0, checkServedCount INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(learnerId,localDate));
CREATE TABLE IF NOT EXISTS check_assignments (learnerId TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE, localDate TEXT NOT NULL, sessionId TEXT NOT NULL, quizId TEXT NOT NULL, memoryId TEXT NOT NULL, assignedAt INTEGER NOT NULL, PRIMARY KEY(learnerId,localDate));
PRAGMA user_version=6;
`;
