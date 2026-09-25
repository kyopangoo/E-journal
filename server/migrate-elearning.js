import { query } from './db.js';

async function migrate() {
  try {
    await query('SET FOREIGN_KEY_CHECKS = 0');
    await query('DROP TABLE IF EXISTS elearning_answer_media');
    await query('DROP TABLE IF EXISTS elearning_answers');
    await query('DROP TABLE IF EXISTS elearning_feedback');
    await query('DROP TABLE IF EXISTS elearning_submissions');
    await query('DROP TABLE IF EXISTS elearning_post_media');
    await query('DROP TABLE IF EXISTS elearning_posts');
    await query('DROP TABLE IF EXISTS elearning_questions');
    await query('DROP TABLE IF EXISTS elearning_assignments');
    await query('SET FOREIGN_KEY_CHECKS = 1');

    await query(`CREATE TABLE elearning_assignments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      created_by INT UNSIGNED NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      is_published BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await query(`CREATE TABLE elearning_questions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      assignment_id INT NOT NULL,
      prompt TEXT NOT NULL,
      media_url VARCHAR(500),
      position INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await query(`CREATE TABLE elearning_posts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      question_id INT NOT NULL,
      parent_id INT,
      user_id INT UNSIGNED NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await query(`CREATE TABLE elearning_post_media (
      id INT PRIMARY KEY AUTO_INCREMENT,
      post_id INT NOT NULL,
      media_url VARCHAR(500) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    console.log('✅ E-Learning schema created successfully!');
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  }
}

await migrate();
