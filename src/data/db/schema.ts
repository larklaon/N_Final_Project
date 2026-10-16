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
