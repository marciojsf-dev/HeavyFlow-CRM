require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('sslmode=disable') ? '' : '?sslmode=require') });

async function checkMessages() {
  const res = await pool.query("SELECT id, whatsapp_message_id, contact_whatsapp_id, content, direction, status FROM messages ORDER BY id DESC LIMIT 20;");
  console.log("Recent messages:");
  console.table(res.rows);
  pool.end();
}
checkMessages().catch(console.error);
