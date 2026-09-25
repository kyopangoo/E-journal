CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL,
  full_name     VARCHAR(128) NOT NULL,
  email         VARCHAR(190) NULL,
  role          ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  password_hash VARCHAR(255) NOT NULL,
  avatar        VARCHAR(255) NULL,
  schema_name   VARCHAR(64)  NOT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_threads (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  title      VARCHAR(200) NOT NULL,
  body       TEXT         NOT NULL,
  is_pinned  TINYINT(1)   NOT NULL DEFAULT 0,
  reply_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_threads_user (user_id),
  KEY idx_threads_created (created_at),
  CONSTRAINT fk_threads_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_replies (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_id       INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  parent_reply_id INT UNSIGNED NULL,
  body            TEXT         NOT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_replies_thread (thread_id),
  KEY idx_replies_user (user_id),
  KEY idx_replies_parent (parent_reply_id),
  CONSTRAINT fk_replies_thread FOREIGN KEY (thread_id) REFERENCES forum_threads (id) ON DELETE CASCADE,
  CONSTRAINT fk_replies_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elearning_assignments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_by  INT UNSIGNED NOT NULL,
  title       VARCHAR(200) NOT NULL,
  description TEXT         NULL,
  due_date    DATE         NULL,
  is_published TINYINT(1)  NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_assignments_creator (created_by),
  CONSTRAINT fk_assignments_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elearning_questions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id INT UNSIGNED NOT NULL,
  prompt        TEXT         NOT NULL,
  question_type ENUM('multiple_choice','essay') NOT NULL DEFAULT 'essay',
  options       JSON         NULL,
  correct_answer VARCHAR(255) NULL,
  points        INT UNSIGNED NOT NULL DEFAULT 10,
  media_url     VARCHAR(500) NULL,
  position      INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_questions_assignment (assignment_id),
  CONSTRAINT fk_questions_assignment FOREIGN KEY (assignment_id) REFERENCES elearning_assignments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elearning_feedback (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id INT UNSIGNED NOT NULL,
  staff_id      INT UNSIGNED NOT NULL,
  author_id     INT UNSIGNED NOT NULL,
  author_role   ENUM('admin','staff') NOT NULL,
  body          TEXT         NOT NULL,
  read_at       TIMESTAMP    NULL DEFAULT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_feedback_thread (assignment_id, staff_id),
  KEY idx_feedback_unread (staff_id, read_at),
  CONSTRAINT fk_feedback_assignment FOREIGN KEY (assignment_id) REFERENCES elearning_assignments (id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_staff FOREIGN KEY (staff_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id    INT UNSIGNED NOT NULL,
  theme      ENUM('light','dark') NOT NULL DEFAULT 'light',
  accent     VARCHAR(16)  NOT NULL DEFAULT '#FFEB3B',
  font_scale DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  density    ENUM('comfortable','compact') NOT NULL DEFAULT 'comfortable',
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_preferences_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS archive_folders (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id   INT UNSIGNED NULL,
  name        VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  created_by  INT UNSIGNED NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_archive_folders_parent (parent_id),
  CONSTRAINT fk_archive_folders_parent FOREIGN KEY (parent_id) REFERENCES archive_folders (id) ON DELETE CASCADE,
  CONSTRAINT fk_archive_folders_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS archive_files (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  folder_id   INT UNSIGNED  NOT NULL,
  file_name   VARCHAR(255)  NOT NULL,
  stored_name VARCHAR(255)  NOT NULL,
  mime_type   VARCHAR(160)  NULL,
  size_bytes  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  uploaded_by INT UNSIGNED  NOT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_archive_files_folder (folder_id),
  CONSTRAINT fk_archive_files_folder FOREIGN KEY (folder_id) REFERENCES archive_folders (id) ON DELETE CASCADE,
  CONSTRAINT fk_archive_files_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;