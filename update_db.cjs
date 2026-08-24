const pg = require('pg');
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const res = await pool.query("SELECT * FROM team_subscriptions WHERE team_id = 'team_main'");
    console.log("Current for team_main:", res.rows);
    
    await pool.query(`
      INSERT INTO team_subscriptions (team_id, stripe_customer_id, stripe_subscription_id, status, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (team_id) DO UPDATE SET
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
    `, ['team_main', 'cus_V7ZRIaP9i9Lu1T', 'sub_1U7KNS2MBgKeMrUD7eujNgLU', 'active']);
    
    console.log("Updated team_main successfully!");
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
