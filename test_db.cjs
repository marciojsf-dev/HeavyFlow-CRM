require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('sslmode=disable') ? '' : '?sslmode=require') });
pool.connect().then(() => {
  return pool.query(`
    INSERT INTO messages (whatsapp_message_id, contact_whatsapp_id, content, type, direction, status, timestamp, team_id, metadata)
    VALUES ('test_1', '123', 'test', 'text', 'outbound', 'sent', CURRENT_TIMESTAMP, 'main-team', '{}')
    ON CONFLICT (whatsapp_message_id) 
    DO UPDATE SET 
      content = EXCLUDED.content,
      type = EXCLUDED.type,
      metadata = EXCLUDED.metadata,
      status = EXCLUDED.status,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `);
}).then(res => {
  console.log('Success:', res.rows[0]);
  pool.end();
}).catch(err => {
  console.error('Error:', err.message);
  pool.end();
});
