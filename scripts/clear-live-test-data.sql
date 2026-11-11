-- One-time cleanup of the previous live-streaming test data. Accounts and all
-- meeting tables are intentionally retained. Run only when the user requests it.
BEGIN;
DELETE FROM question_votes;
DELETE FROM questions;
DELETE FROM poll_votes;
DELETE FROM poll_options;
DELETE FROM polls;
DELETE FROM mic_requests;
DELETE FROM media_connections;
DELETE FROM muted_users;
DELETE FROM chat_messages;
DELETE FROM follows;
DELETE FROM live_sessions;
DELETE FROM rooms;
COMMIT;
