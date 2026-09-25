import { query } from './db.js';

async function migrate() {
  try {
    // Add needs_revision field
    await query('ALTER TABLE elearning_submissions ADD COLUMN needs_revision BOOLEAN NOT NULL DEFAULT FALSE');
    console.log('✓ Added needs_revision column');

    // Add revision_count field
    await query('ALTER TABLE elearning_submissions ADD COLUMN revision_count INT NOT NULL DEFAULT 0');
    console.log('✓ Added revision_count column');

    console.log('\n✅ E-Learning revision schema applied successfully!');
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  }
}

await migrate();
