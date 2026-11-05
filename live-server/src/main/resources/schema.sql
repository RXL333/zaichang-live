CREATE TABLE IF NOT EXISTS app_users (
 id VARCHAR(40) PRIMARY KEY, username VARCHAR(32) NOT NULL UNIQUE,
 password_hash VARCHAR(100) NOT NULL, nickname VARCHAR(40) NOT NULL, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
 id VARCHAR(40) PRIMARY KEY, owner_id VARCHAR(40) NOT NULL REFERENCES app_users(id),
 title VARCHAR(80) NOT NULL, description VARCHAR(500) NOT NULL DEFAULT '',
 category VARCHAR(30) NOT NULL, cover_style VARCHAR(20) NOT NULL DEFAULT 'tomato', created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS live_sessions (
 id VARCHAR(40) PRIMARY KEY, room_id VARCHAR(40) NOT NULL REFERENCES rooms(id),
 status VARCHAR(20) NOT NULL, started_at BIGINT NOT NULL, ended_at BIGINT,
 host_identity VARCHAR(180), chat_seq BIGINT NOT NULL DEFAULT 0, viewer_count INT NOT NULL DEFAULT 0
);
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS viewer_count_updated_at BIGINT;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS last_host_seen_at BIGINT;
CREATE INDEX IF NOT EXISTS idx_sessions_room ON live_sessions(room_id, started_at);
CREATE TABLE IF NOT EXISTS chat_messages (
 id VARCHAR(40) PRIMARY KEY, session_id VARCHAR(40) NOT NULL REFERENCES live_sessions(id),
 user_id VARCHAR(40) NOT NULL REFERENCES app_users(id), nickname VARCHAR(40) NOT NULL,
 content VARCHAR(300) NOT NULL, client_id VARCHAR(100) NOT NULL, seq BIGINT NOT NULL,
 created_at BIGINT NOT NULL, deleted BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE(session_id, user_id, client_id), UNIQUE(session_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, seq);
CREATE TABLE IF NOT EXISTS follows (
 user_id VARCHAR(40) NOT NULL REFERENCES app_users(id), room_id VARCHAR(40) NOT NULL REFERENCES rooms(id),
 created_at BIGINT NOT NULL, PRIMARY KEY(user_id, room_id)
);
CREATE TABLE IF NOT EXISTS polls (
 id VARCHAR(40) PRIMARY KEY, session_id VARCHAR(40) NOT NULL REFERENCES live_sessions(id),
 question VARCHAR(150) NOT NULL, status VARCHAR(20) NOT NULL, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_options (
 id VARCHAR(40) PRIMARY KEY, poll_id VARCHAR(40) NOT NULL REFERENCES polls(id),
 label VARCHAR(100) NOT NULL, sort_order INT NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_votes (
 poll_id VARCHAR(40) NOT NULL REFERENCES polls(id), user_id VARCHAR(40) NOT NULL REFERENCES app_users(id),
 option_id VARCHAR(40) NOT NULL REFERENCES poll_options(id), PRIMARY KEY(poll_id, user_id)
);
CREATE TABLE IF NOT EXISTS questions (
 id VARCHAR(40) PRIMARY KEY, session_id VARCHAR(40) NOT NULL REFERENCES live_sessions(id),
 user_id VARCHAR(40) NOT NULL REFERENCES app_users(id), nickname VARCHAR(40) NOT NULL,
 content VARCHAR(300) NOT NULL, status VARCHAR(20) NOT NULL, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS question_votes (
 question_id VARCHAR(40) NOT NULL REFERENCES questions(id), user_id VARCHAR(40) NOT NULL REFERENCES app_users(id),
 PRIMARY KEY(question_id, user_id)
);
CREATE TABLE IF NOT EXISTS muted_users (
 room_id VARCHAR(40) NOT NULL REFERENCES rooms(id), user_id VARCHAR(40) NOT NULL REFERENCES app_users(id),
 until_at BIGINT NOT NULL, PRIMARY KEY(room_id, user_id)
);
CREATE TABLE IF NOT EXISTS media_connections (
 identity VARCHAR(180) PRIMARY KEY, session_id VARCHAR(40) NOT NULL REFERENCES live_sessions(id),
 viewer_key VARCHAR(100) NOT NULL, user_id VARCHAR(40), role VARCHAR(20) NOT NULL, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS mic_requests (
 id VARCHAR(40) PRIMARY KEY, session_id VARCHAR(40) NOT NULL REFERENCES live_sessions(id),
 user_id VARCHAR(40) NOT NULL REFERENCES app_users(id), nickname VARCHAR(40) NOT NULL,
 identity VARCHAR(180) NOT NULL, status VARCHAR(20) NOT NULL, created_at BIGINT NOT NULL
);
ALTER TABLE mic_requests ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT FALSE;
