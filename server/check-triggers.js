import { query } from './db.js';
try {
  const triggers = await query("SHOW TRIGGERS FROM `e-journey`");
  console.log("Triggers:", JSON.stringify(triggers, null, 2));
} catch (e) {
  console.error(e.message);
}
