-- New centralized E-Learning schema (replaces per-user structure)

-- Drop old per-user tables if they exist
DROP TABLE IF EXISTS `ej_user_template`.`elearning_answers`;
DROP TABLE IF EXISTS `ej_user_template`.`elearning_answer_media`;

-- Check if columns exist before adding (run manually if needed)
-- ALTER TABLE `e-journey`.`elearning_questions` 
--   ADD COLUMN `media_url` VARCHAR(500) NULL AFTER `points`,
--   ADD COLUMN `position` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `media_url`;

-- Centralized submissions table (replaces per-user elearning_answers)
CREATE TABLE IF NOT EXISTS `e-journey`.`elearning_submissions` (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  submitted_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_submission (assignment_id, user_id),
  KEY idx_submission_user (user_id),
  CONSTRAINT fk_submission_assignment FOREIGN KEY (assignment_id) REFERENCES elearning_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_submission_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Answer details per question
CREATE TABLE IF NOT EXISTS `e-journey`.`elearning_answers` (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  submission_id INT UNSIGNED NOT NULL,
  question_id INT UNSIGNED NOT NULL,
  answer      TEXT         NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_answer_question (question_id),
  CONSTRAINT fk_answer_submission FOREIGN KEY (submission_id) REFERENCES elearning_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Media attachments for answers
CREATE TABLE IF NOT EXISTS `e-journey`.`elearning_answer_media` (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  answer_id   INT UNSIGNED NOT NULL,
  media_url   VARCHAR(500) NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_media_answer (answer_id),
  CONSTRAINT fk_media_answer FOREIGN KEY (answer_id) REFERENCES elearning_answers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Update feedback table to be simpler
-- ALTER TABLE `e-journey`.`elearning_feedback` 
--   MODIFY COLUMN `staff_id` INT UNSIGNED NULL AFTER `assignment_id`,
--   ADD COLUMN `submission_id` INT UNSIGNED NULL AFTER `staff_id`,
--   ADD KEY idx_feedback_submission (`submission_id`);

-- Update feedback foreign keys
-- ALTER TABLE `e-journey`.`elearning_feedback`
--   DROP FOREIGN KEY `fk_feedback_staff`,
--   ADD CONSTRAINT fk_feedback_submission FOREIGN KEY (submission_id) REFERENCES elearning_submissions(id) ON DELETE CASCADE;
