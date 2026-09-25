CREATE TABLE IF NOT EXISTS schedule_events (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(200) NOT NULL,
  description TEXT         NULL,
  start_at    DATETIME     NOT NULL,
  end_at      DATETIME     NULL,
  all_day     TINYINT(1)   NOT NULL DEFAULT 0,
  color       VARCHAR(16)  NOT NULL DEFAULT '#FFEB3B',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_schedule_start (start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elearning_answers (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id INT UNSIGNED NOT NULL,
  question_id   INT UNSIGNED NOT NULL,
  answer        TEXT         NULL,
  is_correct    TINYINT(1)   NULL,
  score         INT UNSIGNED NOT NULL DEFAULT 0,
  submitted_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_answer_question (question_id),
  KEY idx_answer_assignment (assignment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elearning_answer_media (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  answer_id   INT UNSIGNED NOT NULL,
  media_url   VARCHAR(500) NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_media_answer (answer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS articles (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(200) NOT NULL,
  url         VARCHAR(500) NOT NULL,
  description TEXT         NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_articles_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS certifications (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(200) NOT NULL,
  issuer        VARCHAR(200) NULL,
  credential_id VARCHAR(190) NULL,
  issued_date   DATE         NULL,
  expiry_date   DATE         NULL,
  file_path     VARCHAR(500) NULL,
  file_name     VARCHAR(255) NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cert_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_history (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  action     VARCHAR(100) NOT NULL,
  detail     VARCHAR(500) NULL,
  ip_address VARCHAR(64)  NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;