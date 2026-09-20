PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- users: account identity, credentials, and storage quota tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL COLLATE NOCASE,
  password_hash     TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  avatar_url        TEXT,
  bio               TEXT,
  role              TEXT NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'admin')),
  storage_quota_bytes INTEGER NOT NULL DEFAULT 5368709120,
  storage_used_bytes  INTEGER NOT NULL DEFAULT 0
                    CHECK (storage_used_bytes >= 0),
  is_active         INTEGER NOT NULL DEFAULT 1
                    CHECK (is_active IN (0, 1)),
  email_verified_at TEXT,
  last_login_at     TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

-- ---------------------------------------------------------------------------
-- refresh_tokens: long-lived login sessions (JWT refresh rotation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  device_info   TEXT,
  ip_address    TEXT,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- folders: nested directory tree per user (parent_id NULL = root)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folders (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  parent_id   TEXT,
  name        TEXT NOT NULL,
  path        TEXT NOT NULL,
  is_trashed  INTEGER NOT NULL DEFAULT 0
              CHECK (is_trashed IN (0, 1)),
  trashed_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES folders (id) ON DELETE CASCADE,
  UNIQUE (user_id, parent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders (user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders (parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders (user_id, path);
CREATE INDEX IF NOT EXISTS idx_folders_trashed ON folders (user_id, is_trashed);

-- ---------------------------------------------------------------------------
-- files: stored objects with metadata and soft-delete (trash)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  folder_id       TEXT,
  name            TEXT NOT NULL,
  mime_type       TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes      INTEGER NOT NULL DEFAULT 0
                  CHECK (size_bytes >= 0),
  storage_key     TEXT NOT NULL UNIQUE,
  checksum_sha256 TEXT,
  version         INTEGER NOT NULL DEFAULT 1
                  CHECK (version >= 1),
  is_trashed      INTEGER NOT NULL DEFAULT 0
                  CHECK (is_trashed IN (0, 1)),
  trashed_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE SET NULL,
  UNIQUE (user_id, folder_id, name)
);

CREATE INDEX IF NOT EXISTS idx_files_user_id ON files (user_id);
CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files (folder_id);
CREATE INDEX IF NOT EXISTS idx_files_trashed ON files (user_id, is_trashed);
CREATE INDEX IF NOT EXISTS idx_files_mime_type ON files (mime_type);

-- ---------------------------------------------------------------------------
-- file_versions: previous versions when a file is overwritten
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_versions (
  id              TEXT PRIMARY KEY,
  file_id         TEXT NOT NULL,
  version         INTEGER NOT NULL
                  CHECK (version >= 1),
  size_bytes      INTEGER NOT NULL DEFAULT 0
                  CHECK (size_bytes >= 0),
  storage_key     TEXT NOT NULL UNIQUE,
  checksum_sha256 TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  UNIQUE (file_id, version)
);

CREATE INDEX IF NOT EXISTS idx_file_versions_file_id ON file_versions (file_id);

-- ---------------------------------------------------------------------------
-- shares: link-based or user-to-user sharing for files and folders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shares (
  id              TEXT PRIMARY KEY,
  resource_type   TEXT NOT NULL
                  CHECK (resource_type IN ('file', 'folder')),
  resource_id     TEXT NOT NULL,
  owner_id        TEXT NOT NULL,
  shared_with_id  TEXT,
  permission      TEXT NOT NULL DEFAULT 'view'
                  CHECK (permission IN ('view', 'edit', 'download')),
  share_token     TEXT UNIQUE,
  password_hash   TEXT,
  expires_at      TEXT,
  max_downloads   INTEGER,
  download_count  INTEGER NOT NULL DEFAULT 0
                  CHECK (download_count >= 0),
  is_active       INTEGER NOT NULL DEFAULT 1
                  CHECK (is_active IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (shared_with_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shares_owner_id ON shares (owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_shared_with_id ON shares (shared_with_id);
CREATE INDEX IF NOT EXISTS idx_shares_resource ON shares (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares (share_token);

-- ---------------------------------------------------------------------------
-- activity_logs: audit trail for security and debugging
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id            TEXT PRIMARY KEY,
  user_id       TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  metadata      TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs (action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs (created_at);
