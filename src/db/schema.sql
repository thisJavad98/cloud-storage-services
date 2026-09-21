-- Postgres schema for cloud-storage-services (Neon)

CREATE TABLE IF NOT EXISTS users (
  id                   TEXT PRIMARY KEY,
  email                TEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  full_name            TEXT NOT NULL,
  avatar_url           TEXT,
  bio                  TEXT,
  role                 TEXT NOT NULL DEFAULT 'user'
                       CHECK (role IN ('user', 'admin')),
  storage_quota_bytes  BIGINT NOT NULL DEFAULT 5368709120,
  storage_used_bytes   BIGINT NOT NULL DEFAULT 0
                       CHECK (storage_used_bytes >= 0),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified_at    TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  device_info   TEXT,
  ip_address    TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

CREATE TABLE IF NOT EXISTS folders (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES folders (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  path        TEXT NOT NULL,
  is_trashed  BOOLEAN NOT NULL DEFAULT FALSE,
  trashed_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (user_id, parent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders (user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders (parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_path ON folders (user_id, path);
CREATE INDEX IF NOT EXISTS idx_folders_trashed ON folders (user_id, is_trashed);

CREATE TABLE IF NOT EXISTS files (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  folder_id        TEXT REFERENCES folders (id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  mime_type        TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes       BIGINT NOT NULL DEFAULT 0
                   CHECK (size_bytes >= 0),
  storage_key      TEXT NOT NULL UNIQUE,
  checksum_sha256  TEXT,
  version          INTEGER NOT NULL DEFAULT 1
                   CHECK (version >= 1),
  is_trashed       BOOLEAN NOT NULL DEFAULT FALSE,
  trashed_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (user_id, folder_id, name)
);

CREATE INDEX IF NOT EXISTS idx_files_user_id ON files (user_id);
CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files (folder_id);
CREATE INDEX IF NOT EXISTS idx_files_trashed ON files (user_id, is_trashed);
CREATE INDEX IF NOT EXISTS idx_files_mime_type ON files (mime_type);

CREATE TABLE IF NOT EXISTS file_versions (
  id               TEXT PRIMARY KEY,
  file_id          TEXT NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  version          INTEGER NOT NULL CHECK (version >= 1),
  size_bytes       BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  storage_key      TEXT NOT NULL UNIQUE,
  checksum_sha256  TEXT,
  created_by       TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id, version)
);

CREATE INDEX IF NOT EXISTS idx_file_versions_file_id ON file_versions (file_id);

CREATE TABLE IF NOT EXISTS shares (
  id              TEXT PRIMARY KEY,
  resource_type   TEXT NOT NULL CHECK (resource_type IN ('file', 'folder')),
  resource_id     TEXT NOT NULL,
  owner_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  shared_with_id  TEXT REFERENCES users (id) ON DELETE CASCADE,
  permission      TEXT NOT NULL DEFAULT 'view'
                  CHECK (permission IN ('view', 'edit', 'download')),
  share_token     TEXT UNIQUE,
  password_hash   TEXT,
  expires_at      TIMESTAMPTZ,
  max_downloads   INTEGER,
  download_count  INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shares_owner_id ON shares (owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_shared_with_id ON shares (shared_with_id);
CREATE INDEX IF NOT EXISTS idx_shares_resource ON shares (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares (share_token);

CREATE TABLE IF NOT EXISTS activity_logs (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users (id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  metadata      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs (action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs (created_at);
