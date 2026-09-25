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
