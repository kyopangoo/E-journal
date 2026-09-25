import mysql from 'mysql2/promise';
import { config } from '../config.js';

async function convertScheduleTimezone() {
  console.log('Converting schedule events to UTC...');

  // Connect to main database
  const mainConnection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    timezone: 'Z', // Force UTC
  });

  // Get all users
  const users = await mainConnection.query(
    'SELECT id, schema_name FROM users WHERE is_active = 1'
  );

  for (const user of users[0]) {
    const schema = user.schema_name;
    if (!schema) continue;

    console.log(`\nProcessing ${user.username} (${schema})...`);

    try {
      // Connect to user's schema with timezone support
      const userConnection = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: schema,
        timezone: 'Z',
      });

      // Get all events
      const events = await userConnection.query(
        'SELECT id, start_at, end_at FROM schedule_events'
      );

      if (events[0].length === 0) {
        console.log('  No events found');
        await userConnection.end();
        continue;
      }

      console.log(`  Found ${events[0].length} event(s)`);

      // Convert each event
      for (const event of events[0]) {
        if (event.start_at) {
          // Convert from local to UTC
          const startLocal = new Date(event.start_at);
          const startUTC = new Date(startLocal.getTime() + startLocal.getTimezoneOffset() * 60000);
          
          let endUTC = null;
          if (event.end_at) {
            const endLocal = new Date(event.end_at);
            endUTC = new Date(endLocal.getTime() + endLocal.getTimezoneOffset() * 60000);
          }

          await userConnection.execute(
            'UPDATE schedule_events SET start_at = ?, end_at = ? WHERE id = ?',
            [startUTC.toISOString().slice(0, 19).replace('T', ' '), endUTC, event.id]
          );

          console.log(`    Event ${event.id}: ${event.start_at} → ${startUTC.toISOString()}`);
        }
      }

      await userConnection.end();
      console.log('  Conversion complete');
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }

  await mainConnection.end();
  console.log('\nDone!');
}

convertScheduleTimezone();
