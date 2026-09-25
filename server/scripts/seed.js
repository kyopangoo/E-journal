import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { connectServer, closePool } from '../db.js';
import { createUserSchema } from '../schema.js';

const SEED_USERS = [
  {
    username: 'admin',
    fullName: 'Administrator',
    email: 'admin@e-journey.local',
    role: 'admin',
    password: 'Admin#12345',
  },
  {
    username: 'staff',
    fullName: 'Staff Demo',
    email: 'staff@e-journey.local',
    role: 'staff',
    password: 'Staff#12345',
  },
  {
    username: 'nadia',
    fullName: 'Nadia Pramudita',
    email: 'nadia@e-journey.local',
    role: 'staff',
    password: 'Staff#12345',
  },
  {
    username: 'bima',
    fullName: 'Bima Saputra',
    email: 'bima@e-journey.local',
    role: 'staff',
    password: 'Staff#12345',
  },
];

async function ensureUser(connection, definition) {
  const [existing] = await connection.execute(
    'SELECT id FROM users WHERE username = ? LIMIT 1',
    [definition.username]
  );

  if (existing.length > 0) {
    const userId = existing[0].id;
    console.log(`- ${definition.username}: already present (id ${userId})`);
    return userId;
  }

  const passwordHash = await bcrypt.hash(definition.password, 12);
  const [result] = await connection.execute(
    `INSERT INTO users (username, full_name, email, role, password_hash, schema_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [definition.username, definition.fullName, definition.email, definition.role, passwordHash, 'pending']
  );

  const userId = result.insertId;
  await connection.execute('UPDATE users SET schema_name = ? WHERE id = ?', [
    `ej_user_${userId}`,
    userId,
  ]);
  console.log(`- ${definition.username}: created (id ${userId}, ${definition.role})`);
  return userId;
}

async function main() {
  const connection = await connectServer();
  const created = [];

  try {
    await connection.query(`USE \`${config.db.name}\``);
    for (const definition of SEED_USERS) {
      created.push({ definition, userId: await ensureUser(connection, definition) });
    }
  } finally {
    await connection.end();
  }

  for (const { definition, userId } of created) {
    const schemaName = await createUserSchema(userId);
    console.log(`  schema ready: ${schemaName}`);
    console.log(`  login: ${definition.username} / ${definition.password}`);
  }

  await closePool();
}

main().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
