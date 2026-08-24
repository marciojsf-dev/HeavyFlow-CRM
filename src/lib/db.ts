import pg from 'pg';

const { Pool } = pg;

// Use DATABASE_URL if available, otherwise fallback to individual components
// The platform usually provides DATABASE_URL for Cloud SQL.
let connString = process.env.DATABASE_URL;
// Workaround for literal %40 in password not being properly percent-encoded as %2540
if (connString && connString.includes('7.%40k')) {
  connString = connString.replace('7.%40k', '7.%2540k');
}

const pool = new Pool({
  connectionString: connString,
  ssl: connString?.includes('sslmode=disable') ? false : {
    rejectUnauthorized: false
  }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export async function initDb() {
  try {
    // Create teams table
    await query(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        documento TEXT,
        telefone TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create contacts table
    await query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        whatsapp_id TEXT UNIQUE NOT NULL,
        name TEXT,
        phone TEXT NOT NULL,
        team_id TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        tags TEXT[] DEFAULT '{}',
        last_message_content TEXT,
        last_message_at TIMESTAMP,
        last_received_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure columns exist if table already exists
    try {
      await query("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open'");
      await query("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'");
      await query("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_message_content TEXT");
      await query("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP");
      await query("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_received_at TIMESTAMP");
      await query("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opt_out BOOLEAN DEFAULT FALSE");
      await query("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0");
      await query("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT");
      await query("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS agent_id TEXT");
      await query("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS department_id TEXT");
    } catch (e) {
      console.warn("Could not add columns to contacts", e);
    }

    // Create messages table
    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        whatsapp_message_id TEXT UNIQUE NOT NULL,
        contact_whatsapp_id TEXT NOT NULL,
        content TEXT,
        type TEXT NOT NULL,
        direction TEXT NOT NULL, -- 'inbound' or 'outbound'
        status TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        timestamp TIMESTAMP NOT NULL,
        team_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create templates table
    await query(`
      CREATE TABLE IF NOT EXISTS templates (
        id SERIAL PRIMARY KEY,
        whatsapp_id TEXT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'pt_BR',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        components JSONB DEFAULT '[]',
        variables JSONB DEFAULT '{}',
        team_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, language, team_id)
      );
    `);

    // Create statuses table (funnels)
    await query(`
      CREATE TABLE IF NOT EXISTS custom_statuses (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#e4e4e7',
        display_order INTEGER DEFAULT 0,
        team_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, team_id)
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        template_id TEXT,
        template_name TEXT,
        status TEXT DEFAULT 'DRAFT',
        total_contacts INTEGER DEFAULT 0,
        sent_count INTEGER DEFAULT 0,
        delivered_count INTEGER DEFAULT 0,
        read_count INTEGER DEFAULT 0,
        replied_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        scheduled_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS campaign_contacts (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
        whatsapp_id TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        error TEXT,
        sent_at TIMESTAMP WITH TIME ZONE,
        delivered_at TIMESTAMP WITH TIME ZONE,
        read_at TIMESTAMP WITH TIME ZONE,
        replied_at TIMESTAMP WITH TIME ZONE,
        message_id TEXT,
        variables JSONB DEFAULT '{}'
      );
    `);

    // Add columns if missing
    try {
      await query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'");
      await query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]'");
      await query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_details TEXT");
      await query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
      await query("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT");
    } catch (e) {
      console.warn("Could not add metadata columns to messages", e);
    }
    try {
      await query("ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS replied_count INTEGER DEFAULT 0");
      await query("ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP WITH TIME ZONE");
    } catch (e) {
      console.warn("Could not add replied columns", e);
    }

    // Create whatsapp_configs table
    await query(`
      CREATE TABLE IF NOT EXISTS whatsapp_configs (
        team_id TEXT PRIMARY KEY,
        access_token TEXT,
        phone_number_id TEXT,
        business_account_id TEXT,
        verify_token TEXT,
        meta_app_id TEXT,
        meta_app_secret TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create team_subscriptions table
    await query(`
      CREATE TABLE IF NOT EXISTS team_subscriptions (
        team_id TEXT PRIMARY KEY,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        status TEXT DEFAULT 'inactive',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    
    try {
      await query("ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS meta_app_id TEXT");
      await query("ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS meta_app_secret TEXT");
    } catch (e) {
      console.warn("Could not add meta_app columns to whatsapp_configs", e);
    }

    console.log('PostgreSQL database initialized');
  } catch (err) {
    console.error('Error initializing database', err);
  }
}
