-- E-Journey full schema (standalone, idempotent).
-- Consolidated equivalent of server/migrations/001_central.sql and 002_per_user.sql,
-- plus a routine to provision the per-user databases. Safe to re-run.
-- The canonical path remains: npm run migrate && npm run seed.

CREATE DATABASE IF NOT EXISTS `e-journey`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `e-journey`;

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
  accent     VARCHAR(16)  NOT NULL DEFAULT '#13A8FF',
  font_scale DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  density    ENUM('comfortable','compact') NOT NULL DEFAULT 'comfortable',
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_preferences_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `ej_user_template`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `ej_user_template`;

CREATE TABLE IF NOT EXISTS schedule_events (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(200) NOT NULL,
  description TEXT         NULL,
  start_at    DATETIME     NOT NULL,
  end_at      DATETIME     NULL,
  all_day     TINYINT(1)   NOT NULL DEFAULT 0,
  color       VARCHAR(16)  NOT NULL DEFAULT '#13A8FF',
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

USE `e-journey`;

DROP PROCEDURE IF EXISTS ej_provision_user_schemas;

DELIMITER $$

CREATE PROCEDURE ej_provision_user_schemas()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE uid INT UNSIGNED;
  DECLARE cur CURSOR FOR SELECT id FROM `e-journey`.users;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur;

  provision_loop: LOOP
    FETCH cur INTO uid;
    IF done = 1 THEN
      LEAVE provision_loop;
    END IF;

    SET @schema = CONCAT('ej_user_', uid);

    SET @ddl = CONCAT('CREATE DATABASE IF NOT EXISTS `', @schema,
                      '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

    SET @ddl = CONCAT('CREATE TABLE IF NOT EXISTS `', @schema,
                      '`.schedule_events LIKE `ej_user_template`.schedule_events');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

    SET @ddl = CONCAT('CREATE TABLE IF NOT EXISTS `', @schema,
                      '`.elearning_answers LIKE `ej_user_template`.elearning_answers');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

    SET @ddl = CONCAT('CREATE TABLE IF NOT EXISTS `', @schema,
                      '`.elearning_answer_media LIKE `ej_user_template`.elearning_answer_media');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

    SET @ddl = CONCAT('CREATE TABLE IF NOT EXISTS `', @schema,
                      '`.articles LIKE `ej_user_template`.articles');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

    SET @ddl = CONCAT('CREATE TABLE IF NOT EXISTS `', @schema,
                      '`.certifications LIKE `ej_user_template`.certifications');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

    SET @ddl = CONCAT('CREATE TABLE IF NOT EXISTS `', @schema,
                      '`.activity_history LIKE `ej_user_template`.activity_history');
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END LOOP;

  CLOSE cur;
END$$

DELIMITER ;

CALL ej_provision_user_schemas();

-- E-Learning discussion posts (replies to questions)
CREATE TABLE IF NOT EXISTS elearning_posts (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id INT UNSIGNED NOT NULL,
  parent_id   INT UNSIGNED NULL,
  user_id     INT UNSIGNED NOT NULL,
  body        TEXT         NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_posts_question (question_id),
  KEY idx_posts_parent (parent_id),
  KEY idx_posts_user (user_id),
  CONSTRAINT fk_posts_question FOREIGN KEY (question_id) REFERENCES elearning_questions (id) ON DELETE CASCADE,
  CONSTRAINT fk_posts_parent FOREIGN KEY (parent_id) REFERENCES elearning_posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS elearning_post_media (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id     INT UNSIGNED NOT NULL,
  media_url   VARCHAR(500) NOT NULL,
  media_type  ENUM('image','text') NOT NULL DEFAULT 'image',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_media_post (post_id),
  CONSTRAINT fk_media_post FOREIGN KEY (post_id) REFERENCES elearning_posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
