const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function check() {
  await client.connect();
  const res = await client.query("SELECT team_id, left(access_token, 15) as prefix, right(access_token, 15) as suffix, length(access_token) as len FROM whatsapp_configs");
  console.log(res.rows);
  await client.end();
}
check().catch(console.error);
