import express from "express";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import multer from "multer";
import { query, initDb } from "./src/lib/db";
import { setupWhatsApp } from "./whatsapp";
import Stripe from "stripe";

// Stripe Lazy Initialization
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("A STRIPE_SECRET_KEY não está configurada no painel (Settings -> Secrets).");
    }
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" as any });
  }
  return stripeClient;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const PORT = 3000;

  const cleanEnvValue = (val: string | undefined): string => {
    if (!val) return "";
    let s = val.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    }
    return s;
  };

  const getWhatsAppToken = () => cleanEnvValue(process.env.WHATSAPP_ACCESS_TOKEN);
  const getWhatsAppPhoneID = () => cleanEnvValue(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const getWhatsAppWABAID = () => cleanEnvValue(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);

  const getWhatsAppCredentials = async (teamId?: string) => {
    const tid = String(teamId || '');
    try {
      if (tid) {
        const res = await query("SELECT * FROM whatsapp_configs WHERE team_id = $1", [tid]);
        if (res && res.rows && res.rows.length > 0 && (res.rows[0].access_token || res.rows[0].phone_number_id)) {
          const config = res.rows[0];
          return {
            token: cleanEnvValue(config.access_token) || cleanEnvValue(process.env.WHATSAPP_ACCESS_TOKEN),
            phoneId: cleanEnvValue(config.phone_number_id) || cleanEnvValue(process.env.WHATSAPP_PHONE_NUMBER_ID),
            wabaId: cleanEnvValue(config.business_account_id) || cleanEnvValue(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
            verifyToken: cleanEnvValue(config.verify_token) || cleanEnvValue(process.env.META_WEBHOOK_VERIFY_TOKEN) || "heavyflow123"
          };
        }
      }

      // Check fallback team or any configured team
      const fallbackRes = await query("SELECT * FROM whatsapp_configs WHERE access_token IS NOT NULL AND access_token != '' ORDER BY updated_at DESC LIMIT 1");
      if (fallbackRes && fallbackRes.rows && fallbackRes.rows.length > 0) {
        const config = fallbackRes.rows[0];
        return {
          token: cleanEnvValue(config.access_token) || cleanEnvValue(process.env.WHATSAPP_ACCESS_TOKEN),
          phoneId: cleanEnvValue(config.phone_number_id) || cleanEnvValue(process.env.WHATSAPP_PHONE_NUMBER_ID),
          wabaId: cleanEnvValue(config.business_account_id) || cleanEnvValue(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
          verifyToken: cleanEnvValue(config.verify_token) || cleanEnvValue(process.env.META_WEBHOOK_VERIFY_TOKEN) || "heavyflow123"
        };
      }
    } catch (err) {
      console.error("Error fetching whatsapp credentials from db:", err);
    }

    return {
      token: cleanEnvValue(process.env.WHATSAPP_ACCESS_TOKEN),
      phoneId: cleanEnvValue(process.env.WHATSAPP_PHONE_NUMBER_ID),
      wabaId: cleanEnvValue(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID),
      verifyToken: cleanEnvValue(process.env.META_WEBHOOK_VERIFY_TOKEN) || "heavyflow123"
    };
  };

  const getVariants = (id: string) => {
    if (!id) return [];
    let raw = String(id).replace(/\D/g, '');
    let variants = [raw];
    
    // Ensure variants includes version with and without 55
    if (raw.startsWith('55')) {
       variants.push(raw.substring(2));
    } else {
       variants.push('55' + raw);
    }

    // Process all current variants for Brazil 9th digit
    const finalVariants = [...variants];
    for (const v of variants) {
       if (v.startsWith('55')) {
          if (v.length === 12) finalVariants.push(v.slice(0, 4) + '9' + v.slice(4));
          if (v.length === 13) finalVariants.push(v.slice(0, 4) + v.slice(5));
       } else {
          // No 55 prefix, 10 or 11 digits
          if (v.length === 10) finalVariants.push(v.slice(0, 2) + '9' + v.slice(2));
          if (v.length === 11) finalVariants.push(v.slice(0, 2) + v.slice(3));
       }
    }
    
    return [...new Set(finalVariants)];
  };

  const getCanonical = (id: string) => String(id || '').replace(/\D/g, '');

  // Initialize Database
  await initDb();

  // Webhook debug storage
  let recentWebhooks: any[] = [];
  const MAX_WEBHOOKS = 50;

  // Static pages for Meta Verification
  app.get("/privacy", (req, res) => {
    res.send("<h1>Política de Privacidade</h1><p>Esta é a política de privacidade do HeavyFlow CRM. Não compartilhamos seus dados com terceiros.</p>");
  });

  app.get("/terms", (req, res) => {
    res.send("<h1>Termos de Serviço</h1><p>Estes são os termos de serviço do HeavyFlow CRM.</p>");
  });

  app.get("/data-deletion", (req, res) => {
    res.send("<h1>Exclusão de Dados</h1><p>Para excluir seus dados, envie um email para marcio@trilhamaster.com.br.</p>");
  });

  // --- API Endpoints ---
  app.use(express.json());

  // Webhook debug endpoint
  app.get("/api/debug/webhooks", (req, res) => {
    res.json(recentWebhooks);
  });

  // LOG DE REQUISIÇÕES (Para debug)
  app.use((req, res, next) => {
    if (!req.url.startsWith('/api/messages') && !req.url.startsWith('/api/conversations')) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
  });
  app.get("/api/campaigns", async (req, res) => {
    const { teamId } = req.query;
    if (!teamId) return res.status(400).json({ error: "teamId is required" });
    try {
      const result = await query(
        "SELECT * FROM campaigns WHERE team_id = $1 ORDER BY created_at DESC",
        [teamId]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching campaigns:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    const { teamId, name, templateId, templateName, contacts } = req.body;
    if (!teamId || !name || !contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // 1. Create campaign
      const campResult = await query(
        `INSERT INTO campaigns (team_id, name, template_id, template_name, total_contacts, status) 
         VALUES ($1, $2, $3, $4, $5, 'DRAFT') RETURNING id`,
        [teamId, name, templateId, templateName, contacts.length]
      );
      const campaignId = campResult.rows[0].id;

      // 2. Add contacts
      for (const contact of contacts) {
        await query(
          `INSERT INTO campaign_contacts (campaign_id, whatsapp_id, variables) VALUES ($1, $2, $3)`,
          [campaignId, contact.whatsapp_id, JSON.stringify(contact.variables || {})]
        );
      }

      res.json({ success: true, id: campaignId });
    } catch (err) {
      console.error("Error creating campaign:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  // Campaign Execution (Real logic)
  app.post("/api/campaigns/:id/send", async (req, res) => {
    const { id } = req.params;
    try {
      const campResult = await query("SELECT * FROM campaigns WHERE id = $1", [id]);
      if (campResult.rows.length === 0) return res.status(404).json({ error: "Campaign not found" });
      const campaign = campResult.rows[0];

      if (campaign.status === 'RUNNING') {
         return res.status(400).json({ error: "Campaign already running" });
      }

      // Mark as running
      await query("UPDATE campaigns SET status = 'RUNNING', updated_at = NOW() WHERE id = $1", [id]);

      res.json({ success: true, message: "Campaign started" });

      // background execution
      (async () => {
         const creds = await getWhatsAppCredentials(campaign.team_id);
         const WHATSAPP_ACCESS_TOKEN = creds.token;
         const WHATSAPP_PHONE_NUMBER_ID = creds.phoneId;

         if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
            console.error("Mass Send Failed: Missing credentials");
            await query("UPDATE campaigns SET status = 'FAILED', updated_at = NOW() WHERE id = $1", [id]);
            return;
         }

         const contacts = await query("SELECT * FROM campaign_contacts WHERE campaign_id = $1 AND status = 'PENDING'", [id]);
         
         for (const contact of contacts.rows) {
            // Check if campaign was paused/stopped in the meantime
            const checkCamp = await query("SELECT status FROM campaigns WHERE id = $1", [id]);
            if (checkCamp.rows[0]?.status !== 'RUNNING') break;

            const to = contact.whatsapp_id;
            const variables: Record<string, string> = contact.variables || {};
            
            // Build template components from variables
            const bodyParams = Object.entries(variables)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([_, val]) => ({ type: "text", text: val }));

            try {
               const metaPayload: any = {
                  messaging_product: "whatsapp",
                  to,
                  type: "template",
                  template: {
                     name: campaign.template_name,
                     language: { code: "pt_BR" },
                     components: []
                  }
               };

               if (bodyParams.length > 0) {
                  metaPayload.template.components.push({
                     type: "body",
                     parameters: bodyParams
                  });
               }

               const response = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(metaPayload)
               });

               const data = await response.json();

               if (response.ok && data.messages && data.messages.length > 0) {
                  const metaMsg = data.messages[0];
                  // Log to messages table so it appears in chat and gets status updates
                  try {
                    let evaluatedText = `[Template: ${campaign.template_name}]`;
                    await query(`
                      INSERT INTO messages (whatsapp_message_id, contact_whatsapp_id, content, type, direction, status, timestamp, team_id, metadata)
                      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8)
                      ON CONFLICT (whatsapp_message_id) 
                      DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP
                    `, [
                      metaMsg.id,
                      to,
                      evaluatedText,
                      'template',
                      'outbound',
                      'sent',
                      campaign.team_id,
                      JSON.stringify(metaPayload)
                    ]);
                    
                    await query(`
                       UPDATE contacts 
                       SET last_message_at = CURRENT_TIMESTAMP, 
                           last_message_content = $1
                       WHERE whatsapp_id = $2
                    `, [evaluatedText, to]);
                  } catch (dbErr) {
                    console.error(">>> [CAMPAIGN] DB Error logging message:", dbErr);
                  }

                  await query(
                     "UPDATE campaign_contacts SET status = 'SENT', sent_at = NOW(), message_id = $1 WHERE id = $2",
                     [metaMsg.id, contact.id]
                  );
                  await query("UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = $1", [id]);
               } else {
                  throw new Error(data.error?.message || "Meta API Error");
               }
            } catch (e) {
               console.error(`Error sending message to ${to}:`, e);
               await query(
                  "UPDATE campaign_contacts SET status = 'FAILED', error = $1 WHERE id = $2",
                  [String(e), contact.id]
               );
               await query("UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1", [id]);
            }
            // Rate limiting
            await new Promise(r => setTimeout(r, 1000));
         }

         const finalCheck = await query("SELECT status FROM campaigns WHERE id = $1", [id]);
         if (finalCheck.rows[0]?.status === 'RUNNING') {
            await query("UPDATE campaigns SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1", [id]);
         }
      })();

    } catch (err) {
      console.error("Error starting campaign:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/campaigns/:id/pause", async (req, res) => {
    const { id } = req.params;
    try {
      await query("UPDATE campaigns SET status = 'DRAFT', updated_at = NOW() WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/campaigns/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const camp = await query("SELECT * FROM campaigns WHERE id = $1", [id]);
      if (camp.rows.length === 0) return res.status(404).json({ error: "Campaign not found" });

      const contacts = await query(
        "SELECT * FROM campaign_contacts WHERE campaign_id = $1",
        [id]
      );

      res.json({ ...camp.rows[0], contacts: contacts.rows });
    } catch (err) {
      console.error("Error fetching campaign:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.delete("/api/campaigns/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await query("DELETE FROM campaigns WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting campaign:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  // --- Conversations & Messages API ---
  app.get("/api/conversations", async (req, res) => {
    const { teamId } = req.query;
    try {
      let sql = "SELECT * FROM contacts WHERE last_message_at IS NOT NULL";
      let params: any[] = [];
      if (teamId && teamId !== 'undefined' && teamId !== 'null') {
        sql += " AND (team_id = $1 OR team_id = 'main-team' OR team_id IS NULL)";
        params.push(String(teamId));
      }
      sql += " ORDER BY last_message_at DESC";
      
      const result = await query(sql, params);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching conversations:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.get("/api/conversations/:id", async (req, res) => {
    const { id } = req.params;
    const { teamId } = req.query;

    try {
      const variants = getVariants(id);
      const result = await query("SELECT * FROM contacts WHERE whatsapp_id = ANY($1) OR phone = ANY($1) LIMIT 1", [variants]);
      
      if (result.rows.length === 0) return res.status(404).json({ error: "Conversation not found" });
      
      const contact = result.rows[0];
      res.json(contact);
    } catch (err) {
      console.error("Error fetching conversation:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/conversations/update", async (req, res) => {
    const { contactId, status, tags, agentId, departmentId, teamId } = req.body;
    if (!contactId) return res.status(400).json({ error: "contactId is required" });

    try {
      const canonical = String(contactId).replace(/\D/g, "");
      const resolvedTeamId = teamId;

      // Ensure the contact exists before updating
      await query(
        `INSERT INTO contacts (whatsapp_id, name, phone, team_id, created_at, updated_at)
         VALUES ($1, $1, $1, $2, NOW(), NOW())
         ON CONFLICT (whatsapp_id) DO NOTHING`,
        [canonical, resolvedTeamId]
      );

      const variants = getVariants(String(contactId));
      let updateQuery = "UPDATE contacts SET updated_at = NOW()";
      const params: any[] = [];
      let paramCount = 1;

      if (status !== undefined) {
        updateQuery += `, status = $${paramCount++}`;
        params.push(status);
      }
      if (tags !== undefined) {
        // PG Array requires a JS Array, not stringified JSON
        updateQuery += `, tags = $${paramCount++}::text[]`;
        params.push(tags);
      }
      if (agentId !== undefined) {
        updateQuery += `, agent_id = $${paramCount++}`;
        params.push(agentId);
      }
      if (departmentId !== undefined) {
        updateQuery += `, department_id = $${paramCount++}`;
        params.push(departmentId);
      }

      updateQuery += ` WHERE (whatsapp_id = ANY($${paramCount}) OR phone = ANY($${paramCount++}))`;
      params.push(variants);
      
      if (teamId) {
        updateQuery += ` AND (team_id = $${paramCount})`;
        params.push(String(teamId));
        paramCount++;
      }

      console.log('>>> [UPDATE CONVERSATION]', updateQuery, params);
      await query(updateQuery, params);
      
      // Notify clients
      try {
        io.emit('conversation:updated', { contactId, status, tags, agentId });
        io.emit('contact_updated', { whatsapp_id: canonical, status });
      } catch(e) { console.error('Socket emit error', e); }
      
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating conversation:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  // Dedicated endpoints for Kanban and contact stage/status updates
  app.put("/api/contacts/:id/status", async (req, res) => {
    const contactId = req.params.id;
    const { status, teamId } = req.body;
    if (!contactId || !status) return res.status(400).json({ error: "contactId and status are required" });

    try {
      const canonical = String(contactId).replace(/\D/g, "");
      const variants = getVariants(String(contactId));
      
      let sql = `UPDATE contacts SET status = $1, updated_at = NOW() WHERE (whatsapp_id = ANY($2) OR phone = ANY($2))`;
      let params: any[] = [status, variants];
      
      if (teamId) {
        sql += ` AND (team_id = $3)`;
        params.push(String(teamId));
      }
      
      const updateResult = await query(sql, params);
      
      // If contact not found in PG contacts, ensure it exists
      if (updateResult.rowCount === 0 && teamId) {
        await query(
          `INSERT INTO contacts (whatsapp_id, name, phone, team_id, status, created_at, updated_at)
           VALUES ($1, $1, $1, $2, $3, NOW(), NOW())
           ON CONFLICT (whatsapp_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
          [canonical, String(teamId), status]
        );
      }
      
      io.emit("contact_updated", { whatsapp_id: canonical, status });
      io.emit("conversation:updated", { contactId: canonical, status });
      
      res.json({ success: true, status });
    } catch (err: any) {
      console.error("Error updating contact status:", err);
      res.status(500).json({ error: "Failed to update contact status: " + err.message });
    }
  });

  app.post("/api/contacts/:id/status", async (req, res) => {
    const contactId = req.params.id;
    const { status, teamId } = req.body;
    if (!contactId || !status) return res.status(400).json({ error: "contactId and status are required" });

    try {
      const canonical = String(contactId).replace(/\D/g, "");
      const variants = getVariants(String(contactId));
      
      let sql = `UPDATE contacts SET status = $1, updated_at = NOW() WHERE (whatsapp_id = ANY($2) OR phone = ANY($2))`;
      let params: any[] = [status, variants];
      
      if (teamId) {
        sql += ` AND (team_id = $3)`;
        params.push(String(teamId));
      }
      
      const updateResult = await query(sql, params);
      
      if (updateResult.rowCount === 0 && teamId) {
        await query(
          `INSERT INTO contacts (whatsapp_id, name, phone, team_id, status, created_at, updated_at)
           VALUES ($1, $1, $1, $2, $3, NOW(), NOW())
           ON CONFLICT (whatsapp_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
          [canonical, String(teamId), status]
        );
      }
      
      io.emit("contact_updated", { whatsapp_id: canonical, status });
      io.emit("conversation:updated", { contactId: canonical, status });
      
      res.json({ success: true, status });
    } catch (err: any) {
      console.error("Error updating contact status:", err);
      res.status(500).json({ error: "Failed to update contact status: " + err.message });
    }
  });

  // Team profile persistence endpoint
  app.post("/api/teams/update", async (req, res) => {
    const { teamId, name, documento, telefone } = req.body;
    if (!teamId || !name) return res.status(400).json({ error: "teamId and name are required" });
    try {
      await query(`
        INSERT INTO teams (id, name, documento, telefone, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          documento = EXCLUDED.documento,
          telefone = EXCLUDED.telefone,
          updated_at = CURRENT_TIMESTAMP
      `, [String(teamId), String(name), documento || null, telefone || null]);

      res.json({ success: true, team: { id: teamId, name, documento, telefone } });
    } catch (err: any) {
      console.error("Error updating team in PG:", err);
      res.status(500).json({ error: "Failed to update team: " + err.message });
    }
  });

  app.get("/api/teams/:teamId", async (req, res) => {
    const { teamId } = req.params;
    try {
      const teamRes = await query("SELECT * FROM teams WHERE id = $1", [teamId]);
      if (teamRes.rows.length > 0) {
        res.json({ success: true, team: teamRes.rows[0] });
      } else {
        res.json({ success: false, message: "Team not found" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/messages", async (req, res) => {
    const { contactId, teamId, limit = 50 } = req.query;
    if (!contactId) return res.status(400).json({ error: "contactId is required" });

    try {
      const variants = getVariants(String(contactId));
      let sql = "SELECT * FROM messages WHERE contact_whatsapp_id = ANY($1)";
      let params: any[] = [variants];
      
      // Don't filter messages by teamId if we want to see history across migrations
      sql = `
        SELECT * FROM (
          SELECT * FROM messages 
          WHERE contact_whatsapp_id = ANY($1) 
          ORDER BY timestamp DESC 
          LIMIT $2
        ) sub
        ORDER BY timestamp ASC
      `;
      params = [variants, limit];
      
      const result = await query(sql, params);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching messages:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/messages/mark-read", async (req, res) => {
    const { contactId, teamId } = req.body;
    if (!contactId) return res.status(400).json({ error: "contactId is required" });

    try {
      let sql = "UPDATE messages SET is_read = TRUE WHERE contact_whatsapp_id = $1 AND is_read = FALSE";
      let params = [contactId];
      if (teamId) {
        sql += " AND team_id = $2";
        params.push(String(teamId));
      }
      await query(sql, params);
      res.json({ success: true });
    } catch (err) {
      console.error("Error marking messages as read:", err);
      res.status(500).json({ error: "Database error" });
    }
  });

  // --- HEALTH CHECK ---
  app.get("/ping", (req, res) => res.send(`pong - ${new Date().toISOString()}`));
  app.get("/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  // --- SQL DATA API ---
  app.get("/api/contacts", async (req, res) => {
    try {
      const teamId = req.query.teamId;
      if (!teamId) return res.status(400).json({ error: "teamId is required" });
      const result = await query("SELECT * FROM contacts WHERE (team_id = $1 OR team_id = 'main-team' OR team_id IS NULL) ORDER BY last_message_at DESC NULLS LAST, name ASC", [teamId]);
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // GET existing whatsapp credentials
  app.get("/api/whatsapp-config", async (req, res) => {
    const teamId = String(req.query.teamId || "main-team");
    try {
      const dbRes = await query("SELECT * FROM whatsapp_configs WHERE team_id = $1", [teamId]);
      if (dbRes && dbRes.rows && dbRes.rows.length > 0) {
        const config = dbRes.rows[0];
        const waba = config.business_account_id || config.waba_id || "";
        return res.json({
          success: true,
          access_token: config.access_token || "",
          phone_number_id: config.phone_number_id || "",
          business_account_id: waba,
          waba_id: waba,
          verify_token: config.verify_token || "heavyflow123",
          meta_app_id: config.meta_app_id || "",
          meta_app_secret: config.meta_app_secret || ""
        });
      }
      
      // Fallback to environment variables
      const envWaba = cleanEnvValue(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) || "";
      return res.json({
        success: true,
        access_token: cleanEnvValue(process.env.WHATSAPP_ACCESS_TOKEN),
        phone_number_id: cleanEnvValue(process.env.WHATSAPP_PHONE_NUMBER_ID),
        business_account_id: envWaba,
        waba_id: envWaba,
        verify_token: cleanEnvValue(process.env.META_WEBHOOK_VERIFY_TOKEN) || "heavyflow123",
        meta_app_id: cleanEnvValue(process.env.META_APP_ID) || "",
        meta_app_secret: cleanEnvValue(process.env.META_APP_SECRET) || ""
      });
    } catch (err: any) {
      console.error("Error fetching whatsapp-config from db:", err);
      res.status(500).json({ error: "Failed to fetch whatsapp config: " + err.message });
    }
  });

  // POST save or update whatsapp credentials
  app.post("/api/whatsapp-config", async (req, res) => {
    const { teamId, access_token, phone_number_id, business_account_id, waba_id, verify_token, meta_app_id, meta_app_secret } = req.body;
    const tid = String(teamId || "main-team");
    const targetWabaId = business_account_id || waba_id;
    try {
      await query(`
        INSERT INTO whatsapp_configs (team_id, access_token, phone_number_id, business_account_id, verify_token, meta_app_id, meta_app_secret, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT (team_id)
        DO UPDATE SET
          access_token = COALESCE(NULLIF(EXCLUDED.access_token, ''), whatsapp_configs.access_token),
          phone_number_id = COALESCE(NULLIF(EXCLUDED.phone_number_id, ''), whatsapp_configs.phone_number_id),
          business_account_id = COALESCE(NULLIF(EXCLUDED.business_account_id, ''), whatsapp_configs.business_account_id),
          verify_token = COALESCE(NULLIF(EXCLUDED.verify_token, ''), whatsapp_configs.verify_token),
          meta_app_id = COALESCE(NULLIF(EXCLUDED.meta_app_id, ''), whatsapp_configs.meta_app_id),
          meta_app_secret = COALESCE(NULLIF(EXCLUDED.meta_app_secret, ''), whatsapp_configs.meta_app_secret),
          updated_at = CURRENT_TIMESTAMP
      `, [
        tid, 
        cleanEnvValue(access_token), 
        cleanEnvValue(phone_number_id), 
        cleanEnvValue(targetWabaId), 
        cleanEnvValue(verify_token),
        cleanEnvValue(meta_app_id),
        cleanEnvValue(meta_app_secret)
      ]);

      res.json({ success: true, message: "Ajustes da Meta salvos com sucesso!" });
    } catch (err: any) {
      console.error("Error saving whatsapp-config:", err);
      res.status(500).json({ error: "Failed to save whatsapp config: " + err.message });
    }
  });

  app.post("/api/whatsapp/exchange-token", async (req, res) => {
    try {
      const { teamId, shortToken, appId, appSecret } = req.body;
      const url = `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.access_token) {
        res.json({ success: true, access_token: data.access_token });
      } else {
        res.status(400).json({ success: false, error: data.error?.message || "Failed to exchange token" });
      }
    } catch (error: any) {
      console.error("Exchange token error:", error);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  app.get("/api/admin/teams", async (req, res) => {
    try {
      const dbRes = await query(`
        SELECT 
          w.team_id, 
          w.phone_number_id,
          w.updated_at,
          (SELECT COUNT(*) FROM messages m WHERE m.team_id = w.team_id) as total_messages,
          (SELECT COUNT(*) FROM contacts c WHERE c.team_id = w.team_id) as total_contacts
        FROM whatsapp_configs w
      `);
      res.json(dbRes.rows);
    } catch (err: any) {
      console.error("Error fetching admin teams:", err);
      res.status(500).json({ error: "Failed to fetch teams: " + err.message });
    }
  });

  
  // STRIPE WEBHOOKS & SUBSCRIPTION
  app.get("/api/teams/:teamId/subscription", async (req, res) => {
    try {
      const { teamId } = req.params;
      const dbRes = await query("SELECT * FROM team_subscriptions WHERE team_id = $1", [teamId]);
      if (dbRes && dbRes.rows && dbRes.rows.length > 0) {
        let sub = dbRes.rows[0];
        // Síncrono: Verificar direto com a Stripe para garantir que o status está correto, mesmo se o webhook falhar
        if (sub.stripe_subscription_id) {
          try {
            const stripe = getStripe();
            const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
            if (stripeSub.status !== sub.status) {
              await query("UPDATE team_subscriptions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE team_id = $2", [stripeSub.status, teamId]);
              sub.status = stripeSub.status;
            }
          } catch (stripeErr) {
            console.error("Failed to verify subscription with Stripe:", stripeErr);
          }
        }
        return res.json({ success: true, subscription: sub });
      }
      res.json({ success: true, subscription: null });
    } catch (err: any) {
      console.error("Error fetching subscription:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/stripe/create-portal", async (req, res) => {
    try {
      const { teamId } = req.body;
      if (!teamId) return res.status(400).json({ error: "Missing teamId" });
      
      const dbRes = await query("SELECT stripe_customer_id FROM team_subscriptions WHERE team_id = $1", [teamId]);
      if (!dbRes || !dbRes.rows || dbRes.rows.length === 0 || !dbRes.rows[0].stripe_customer_id) {
        return res.status(404).json({ error: "No active subscription found for this team" });
      }
      
      const stripe = getStripe();
      const origin = req.headers.origin || `http://${req.headers.host}`;
      
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: dbRes.rows[0].stripe_customer_id,
        return_url: `${origin}/billing`,
      });
      
      res.json({ url: portalSession.url });
    } catch (err: any) {
      console.error("Stripe portal error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/stripe/webhook", express.raw({type: 'application/json'}), async (req, res) => {
    const stripe = getStripe();
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      // For local testing without a webhook secret, or you can add STRIPE_WEBHOOK_SECRET to env.
      // If no secret is configured, just parse the body (less secure but works for now).
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (endpointSecret && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      } else {
        event = req.body;
        if (Buffer.isBuffer(event)) {
          event = JSON.parse(event.toString());
        }
      }
    } catch (err: any) {
      console.error("Webhook Error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const teamId = session.client_reference_id;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        
        if (teamId) {
          // get subscription to check status
          let status = 'active';
          if (subscriptionId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId as string);
            status = sub.status;
          }
          
          await query(`
            INSERT INTO team_subscriptions (team_id, stripe_customer_id, stripe_subscription_id, status, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (team_id) DO UPDATE SET
              stripe_customer_id = EXCLUDED.stripe_customer_id,
              stripe_subscription_id = EXCLUDED.stripe_subscription_id,
              status = EXCLUDED.status,
              updated_at = CURRENT_TIMESTAMP
          `, [teamId, customerId, subscriptionId, status]);
        }
      }
      else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status;
        
        await query(`
          UPDATE team_subscriptions 
          SET status = $1, updated_at = CURRENT_TIMESTAMP 
          WHERE stripe_customer_id = $2
        `, [status, customerId]);
      }

      res.json({received: true});
    } catch (err: any) {
      console.error("Webhook processing error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  
  app.post("/api/stripe/verify-session", async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });
      
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (!session) return res.status(404).json({ error: "Session not found" });
      
      const teamId = session.client_reference_id;
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      
      if (teamId && session.payment_status === 'paid' || session.status === 'complete') {
        let status = 'active';
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId as string);
          status = sub.status; // typically 'trialing' or 'active'
        }
        
        await query(`
          INSERT INTO team_subscriptions (team_id, stripe_customer_id, stripe_subscription_id, status, updated_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          ON CONFLICT (team_id) DO UPDATE SET
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id,
            status = EXCLUDED.status,
            updated_at = CURRENT_TIMESTAMP
        `, [teamId, customerId, subscriptionId, status]);
        
        return res.json({ success: true, status });
      }
      
      res.json({ success: false, message: "Session not completed" });
    } catch (err: any) {
      console.error("Verify session error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/stripe/create-checkout", async (req, res) => {
    try {
      const { teamId, email, customerName } = req.body;
      if (!teamId || !email) {
        return res.status(400).json({ error: "Missing teamId or email" });
      }

      const stripe = getStripe();
      const origin = req.headers.origin || `http://${req.headers.host}`;

      // Verificar se o time já tem um histórico de assinatura (trial já usado)
      const dbRes = await query("SELECT stripe_customer_id, status FROM team_subscriptions WHERE team_id = $1", [teamId]);
      
      let customerId = undefined;
      let hasHistory = false;

      if (dbRes && dbRes.rows && dbRes.rows.length > 0) {
        hasHistory = true;
        if (dbRes.rows[0].stripe_customer_id) {
           customerId = dbRes.rows[0].stripe_customer_id;
        }
      }

      const sessionConfig: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ["card"],
        mode: "subscription",
        client_reference_id: teamId,
        line_items: [
          {
            price_data: {
              currency: "BRL",
              product_data: {
                name: "HeavyFlow Pro",
                description: "CRM Multi-agentes com WhatsApp Cloud API Oficial",
              },
              unit_amount: 14700, // R$ 147,00
              recurring: {
                interval: "month" as const,
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/billing?checkout=cancelled`,
      };

      if (customerId) {
         sessionConfig.customer = customerId;
      } else {
         sessionConfig.customer_email = email;
      }

      if (!hasHistory) {
         sessionConfig.subscription_data = {
            trial_period_days: 7,
         };
      }

      const session = await stripe.checkout.sessions.create(sessionConfig);

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Stripe error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/db-status", async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) {
        return res.json({ connected: false, message: "DATABASE_URL não configurada no menu Ajustes" });
      }
      // Simple ping to check if PostgreSQL is alive
      await query("SELECT 1");
      res.json({ connected: true, message: "Conectado ao PostgreSQL" });
    } catch (err: any) {
      console.error("DB Status Error:", err);
      res.json({ connected: false, message: "Erro de conexão: " + err.message });
    }
  });

  app.post("/api/templates/register", async (req, res) => {
    try {
      const { name, category, language, components, examples } = req.body;
      
      const creds = await getWhatsAppCredentials(req.body.teamId || req.query.teamId );
      const WHATSAPP_ACCESS_TOKEN = creds.token;
      const WHATSAPP_BUSINESS_ACCOUNT_ID = creds.wabaId;

      if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_BUSINESS_ACCOUNT_ID) {
        return res.status(400).json({ error: "Configure WHATSAPP_ACCESS_TOKEN e WHATSAPP_BUSINESS_ACCOUNT_ID no menu Ajustes." });
      }

      // Prepare Meta Payload
      const metaPayload: any = {
        name: (name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        category: category || 'MARKETING',
        language: language || 'pt_BR',
        allow_category_change: true,
        components: components.map((c: any) => {
           const mapped: any = { type: c.type };
           
           if (c.type === 'BODY') {
              mapped.text = c.text;
              if (examples?.body && Array.isArray(examples.body) && examples.body.length > 0) {
                 mapped.example = {
                    body_text: examples.body
                 };
              }
           }

           if (c.type === 'HEADER') {
              mapped.format = 'TEXT';
              mapped.text = c.text;
              if (examples?.header && Array.isArray(examples.header) && examples.header.length > 0) {
                 mapped.example = {
                    header_text: examples.header
                 };
              }
           }

           if (c.type === 'FOOTER') {
              mapped.text = c.text;
           }

           if (c.type === 'BUTTONS') {
              mapped.buttons = (c.buttons || []).map((b: any) => {
                 const btn: any = { type: b.type, text: b.text };
                 if (b.type === 'URL') {
                    btn.url = b.url;
                 } else if (b.type === 'PHONE_NUMBER') {
                    // Meta exige: +[Código do País][Código de Área][Número]
                    // Remove tudo que não for dígito e garante o + no início
                    const digits = String(b.phone_number || '').replace(/\D/g, '');
                    btn.phone_number = `+${digits}`;
                 }
                 return btn;
              });
           }
           return mapped;
        })
      };

      console.log(`>>> [META POST] WABA_ID: ${WHATSAPP_BUSINESS_ACCOUNT_ID} | Payload FINAL p/ Meta:`, JSON.stringify(metaPayload, null, 2));

      const response = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metaPayload)
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        console.error(">>> [META ERROR] HTTP Status:", response.status);
        console.error(">>> [META ERROR] Response Body:", JSON.stringify(data, null, 2));
        
        return res.status(400).json({ 
           success: false, 
           error: data?.error?.message || "Erro desconhecido na Meta",
           code: data?.error?.code,
           subcode: data?.error?.error_subcode,
           details: data?.error || data
        });
      }

      console.log(">>> [META SUCCESS] Meta Response:", JSON.stringify(data, null, 2));
      res.json({ success: true, metaResponse: data });
    } catch (err) {
      console.error("Template Registry Internal Error:", err);
      res.status(500).json({ error: "Erro interno ao processar registro na Meta." });
    }
  });


  app.post("/api/templates/sync", async (req, res) => {
    try {
      let { teamId } = req.query;
      const creds = await getWhatsAppCredentials(teamId as string);
      const WHATSAPP_ACCESS_TOKEN = creds.token;
      const WHATSAPP_BUSINESS_ACCOUNT_ID = creds.wabaId;
      const syncTeamId = String(teamId && teamId !== 'undefined' ? teamId : 'team_ivw2d5s3u');

      if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_BUSINESS_ACCOUNT_ID) {
        return res.status(400).json({ error: "Credenciais da Meta (Token ou WABA ID) não configuradas." });
      }

      const response = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=id,name,language,status,category,components&limit=100`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        }
      });

      const data = await response.json();

      if (data.error) {
        console.error("Meta API Error:", data.error);
        return res.status(400).json({ 
           success: false, 
           error: data.error.message,
           details: data.error 
        });
      }

      // Persist to Database
      const templates = data.data || [];
      const metaTemplateNames: string[] = [];

      for (const t of templates) {
         metaTemplateNames.push(t.name);
         await query(`
            INSERT INTO templates (name, language, category, status, components, team_id, whatsapp_id, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
            ON CONFLICT (name, language, team_id) 
            DO UPDATE SET 
               category = EXCLUDED.category,
               status = EXCLUDED.status,
               components = EXCLUDED.components,
               whatsapp_id = EXCLUDED.whatsapp_id,
               updated_at = CURRENT_TIMESTAMP
         `, [t.name, t.language || 'pt_BR', t.category, t.status, JSON.stringify(t.components || []), syncTeamId, t.id ? String(t.id) : null]);

         // Also ensure update across any matching template by name and team
         await query(`
            UPDATE templates 
            SET category = $1, status = $2, components = $3, whatsapp_id = $4, updated_at = CURRENT_TIMESTAMP
            WHERE name = $5 AND team_id = $6
         `, [t.category, t.status, JSON.stringify(t.components || []), t.id ? String(t.id) : null, t.name, syncTeamId]);
      }

      // Any template in DB that was marked APPROVED but does not exist on Meta WABA should be set to DRAFT
      if (metaTemplateNames.length > 0 && syncTeamId) {
        await query(`
          UPDATE templates 
          SET status = 'DRAFT', updated_at = CURRENT_TIMESTAMP 
          WHERE team_id = $1 AND NOT (name = ANY($2)) AND status = 'APPROVED'
        `, [syncTeamId, metaTemplateNames]);
      }

      io.emit("templates:synced", { teamId: syncTeamId, count: templates.length, templates });

      res.json({ success: true, count: templates.length, templates });
    } catch (err) {
      console.error("Template Sync Error:", err);
      res.status(500).json({ error: "Erro interno ao processar sincronização com a Meta." });
    }
  });

  app.get("/api/meta-limits", async (req, res) => {
    try {
      const { teamId } = req.query;
      const creds = await getWhatsAppCredentials(teamId as string);
      const WHATSAPP_ACCESS_TOKEN = creds.token;
      const WHATSAPP_PHONE_NUMBER_ID = creds.phoneId;

      if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        return res.status(400).json({ error: "Credenciais da Meta (Token ou ID do Telefone) não configuradas no ambiente." });
      }

      const response = await fetch(`https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_NUMBER_ID}?fields=whatsapp_business_manager_messaging_limit`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        }
      });

      const data = await response.json();

      if (data.error) {
        return res.status(400).json({ error: data.error.message });
      }

      res.json({ limit: data.whatsapp_business_manager_messaging_limit });
    } catch (err) {
      console.error("Meta Limits Error:", err);
      res.status(500).json({ error: "Erro interno ao buscar limites da Meta." });
    }
  });

  app.post("/api/contacts/sync", async (req, res) => {
    try {
      const contacts = req.body; // Array of contact objects
      if (!Array.isArray(contacts)) {
        return res.status(400).json({ error: "Invalid payload: expected layout array" });
      }

      for (const contact of contacts) {
        await query(`
          INSERT INTO contacts (whatsapp_id, name, phone, team_id, last_message_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (whatsapp_id) 
          DO UPDATE SET 
            name = EXCLUDED.name, 
            last_message_at = COALESCE(EXCLUDED.last_message_at, contacts.last_message_at),
            updated_at = CURRENT_TIMESTAMP
        `, [
          contact.whatsapp_id || contact.phone,
          contact.name,
          contact.phone || contact.whatsapp_id,
          contact.team_id ,
          contact.lastMessageAt ? new Date(contact.lastMessageAt) : null,
          contact.createdAt ? new Date(contact.createdAt) : new Date()
        ]);
      }

      res.json({ success: true, count: contacts.length });
    } catch (err) {
      console.error("Sync Error:", err);
      res.status(500).json({ error: "Sync failed" });
    }
  });

  app.get("/api/contacts/audience", async (req, res) => {
    try {
      const { status, teamId } = req.query;
      
      if (!teamId) {
        return res.status(400).json({ error: "teamId is required" });
      }

      let sql = "SELECT * FROM contacts WHERE team_id = $1 AND phone IS NOT NULL AND phone != ''";
      let params: any[] = [teamId];
      
      // se foi passado um status e não é "ALL", filtramos
      if (status && status !== 'ALL') {
        sql += " AND status = $2";
        params.push(status);
      }
      
      const result = await query(sql, params);
      res.json({ contacts: result.rows });
    } catch (err) {
      console.error("Fetch Audience Error:", err);
      res.status(500).json({ error: "Erro ao buscar público." });
    }
  });

  // --- TEMPLATES API (PG) ---
  app.get("/api/templates", async (req, res) => {
    try {
      const { teamId } = req.query;
      const result = await query("SELECT * FROM templates WHERE team_id = $1 ORDER BY created_at DESC", [teamId ]);
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.post("/api/templates", async (req, res) => {
    try {
      const { name, category, language, components, teamId, status, variables } = req.body;
      const result = await query(`
        INSERT INTO templates (name, category, language, components, team_id, status, variables)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (name, language, team_id) 
        DO UPDATE SET 
          category = EXCLUDED.category,
          components = EXCLUDED.components,
          status = EXCLUDED.status,
          variables = EXCLUDED.variables,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [name, category, language || 'pt_BR', JSON.stringify(components || []), teamId , status || 'DRAFT', JSON.stringify(variables || {})]);
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to save template" });
    }
  });

  app.put("/api/templates/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, components, variables, category, name, language } = req.body;
      
      let updateFields = [];
      let params = [];
      let counter = 1;

      if (status) { updateFields.push(`status = $${counter++}`); params.push(status); }
      if (category) { updateFields.push(`category = $${counter++}`); params.push(category); }
      if (name) { updateFields.push(`name = $${counter++}`); params.push(name); }
      if (language) { updateFields.push(`language = $${counter++}`); params.push(language); }
      if (components) { updateFields.push(`components = $${counter++}`); params.push(JSON.stringify(components)); }
      if (variables) { updateFields.push(`variables = $${counter++}`); params.push(JSON.stringify(variables)); }
      
      if (updateFields.length === 0) return res.status(400).json({ error: "No fields to update" });
      
      params.push(id);
      const result = await query(`
        UPDATE templates 
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $${counter} 
        RETURNING *
      `, params);
      
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  // --- CUSTOM STATUSES API (PG) ---
  app.get("/api/custom-statuses", async (req, res) => {
    try {
      const { teamId } = req.query;
      let sql = "SELECT * FROM custom_statuses";
      let params: any[] = [];
      if (teamId && teamId !== 'undefined' && teamId !== 'null') {
        sql += " WHERE (team_id = $1 OR team_id = 'main-team' OR team_id IS NULL)";
        params.push(String(teamId));
      }
      sql += " ORDER BY display_order ASC, id ASC";
      const result = await query(sql, params);
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch statuses" });
    }
  });

  app.post("/api/custom-statuses", async (req, res) => {
    try {
      const { name, color, teamId } = req.body;
      const result = await query(`
        INSERT INTO custom_statuses (name, color, team_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (name, team_id) DO NOTHING
        RETURNING *
      `, [name, color || '#e4e4e7', teamId ]);
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create status" });
    }
  });

  app.delete("/api/custom-statuses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await query("DELETE FROM custom_statuses WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete status" });
    }
  });

  app.put("/api/custom-statuses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { color, name } = req.body;
      let q = "UPDATE custom_statuses SET updated_at = NOW()";
      const params = [];
      let i = 1;
      if (color) { q += `, color = $${i++}`; params.push(color); }
      if (name) { q += `, name = $${i++}`; params.push(name); }
      q += ` WHERE id = $${i}`;
      params.push(id);
      await query(q, params);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update status" });
    }
  });

  // API routes for Meta WhatsApp Webhook
  // Webhook Verification (GET)
  app.get("/api/webhook", async (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"] as string;
    const challenge = req.query["hub.challenge"];
    const envVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || "heavyflow123";

    console.log("n" + "=".repeat(60));
    console.log(">>> [DEBUG META] TENTATIVA DE VERIFICAÇÃO (GET) <<<");
    console.log("HORA:", new Date().toISOString());
    console.log("MODO:", mode);
    console.log("TOKEN RECEBIDO:", `[${token}]`);
    console.log("TOKEN ESPERADO (Env):", `[${envVerifyToken}]`);

    let isValid = false;
    
    if (mode === "subscribe") {
      if (token === envVerifyToken) {
        isValid = true;
      } else {
        // Fallback: check if any team configured this token in the database
        try {
          const result = await query("SELECT id FROM whatsapp_configs WHERE verify_token = $1 LIMIT 1", [token]);
          if (result.rows.length > 0) {
            isValid = true;
            console.log(">>> SUCESSO: Token encontrado no Banco de Dados! <<<");
          }
        } catch (dbErr) {
          console.error("Erro ao verificar token no banco:", dbErr);
        }
      }
    }

    if (isValid) {
      console.log(">>> SUCESSO: WEBHOOK VERIFICADO COM SUCESSO! <<<");
      console.log("=".repeat(60) + "n");
      return res.status(200).send(challenge);
    } else {
      console.log(">>> ERRO: TOKEN DE VERIFICAÇÃO INVÁLIDO OU MODO INCORRETO! <<<");
      console.log("=".repeat(60) + "n");
      return res.sendStatus(403);
    }
  });

      // Webhook payload handling (POST)
  app.post("/api/webhook", async (req, res) => {
    const body = req.body;
    
    // Debug store
    recentWebhooks.unshift({
        time: new Date().toISOString(),
        payload: body
    });
    if (recentWebhooks.length > MAX_WEBHOOKS) recentWebhooks.pop();

    // Resposta imediata para evitar timeouts da Meta
    res.status(200).send("EVENT_RECEIVED");

    try {
      if (body.object === "whatsapp_business_account" && body.entry) {
        for (const entry of body.entry) {
          const rawChanges = entry.changes || [];
          for (const chItem of rawChanges) {
            const change = chItem.value || {};
            const field = chItem.field;
            
            // Debugging
            console.log(`>>> [WEBHOOK RAW] Field = ${field} | Payload =`, JSON.stringify(change, null, 2));

            // HANDLE TEMPLATE STATUS & CATEGORY UPDATES FROM META WEBHOOK
            if (field === "message_template_status_update" || change.event || change.message_template_id || change.message_template_name) {
              const tName = change.message_template_name;
              const tId = change.message_template_id;
              const tEvent = change.event || change.status;
              const tCategory = change.category || change.new_category;
              const reason = change.reason || change.disable_info;

              console.log(`>>> [WEBHOOK TEMPLATE UPDATE] Template: ${tName} (ID: ${tId}) | Event/Status: ${tEvent} | Category: ${tCategory} | Reason: ${reason}`);

              if (tName || tId) {
                const statusMap: Record<string, string> = {
                  'APPROVED': 'APPROVED',
                  'REJECTED': 'REJECTED',
                  'PENDING': 'PENDING',
                  'PAUSED': 'PAUSED',
                  'DISABLED': 'REJECTED'
                };
                const dbStatus = statusMap[tEvent] || tEvent;

                let updateQuery = "UPDATE templates SET updated_at = CURRENT_TIMESTAMP";
                const updateParams: any[] = [];
                let pIdx = 1;

                if (dbStatus) {
                  updateQuery += `, status = $${pIdx++}`;
                  updateParams.push(dbStatus);
                }
                if (tCategory) {
                  updateQuery += `, category = $${pIdx++}`;
                  updateParams.push(tCategory);
                }
                if (tId) {
                  updateQuery += `, whatsapp_id = $${pIdx++}`;
                  updateParams.push(String(tId));
                }

                updateQuery += ` WHERE (name = $${pIdx} OR whatsapp_id = $${pIdx + 1})`;
                updateParams.push(tName || '', String(tId || ''));

                try {
                  await query(updateQuery, updateParams);
                  io.emit("templates:updated", {
                    name: tName,
                    whatsapp_id: tId,
                    status: dbStatus,
                    category: tCategory,
                    reason
                  });
                } catch (tErr) {
                  console.error(">>> [WEBHOOK TEMPLATE] Erro ao atualizar DB:", tErr);
                }
              }
            }

            if (change.messages && change.messages.length > 0) {
              console.log(`>>> [WEBHOOK] ${change.messages.length} Mensagem(ns) recebida(s)`);
            }

          // handle messages (Incoming)
          if (change.messages && change.messages.length > 0) {
            for (const message of change.messages) {
              if (message.type === 'unsupported' || message.type === 'unknown') {
                 console.log(`>>> [WEBHOOK] Ignorando mensagem não suportada (${message.type}):`, message);
                 continue;
              }

              // HANDLE REACTIONS
              if (message.type === 'reaction') {
                const reaction = message.reaction;
                console.log(`>>> [WEBHOOK] Reação recebida! Msg: ${reaction.message_id} | Emoji: ${reaction.emoji}`);
                
                try {
                   // Update the targeted message with the reaction
                   const reactRes = await query(`
                     UPDATE messages 
                     SET reactions = CASE
                       WHEN $1 = '' THEN '[]'::jsonb
                       ELSE jsonb_build_array(jsonb_build_object('emoji', $1, 'timestamp', CURRENT_TIMESTAMP))
                     END
                     WHERE whatsapp_message_id = $2
                     RETURNING *
                   `, [reaction.emoji, reaction.message_id]);

                   if (reactRes.rows.length > 0) {
                      io.emit("whatsapp:message_reaction", {
                         messageId: reaction.message_id,
                         reactions: reactRes.rows[0].reactions
                      });
                   }
                } catch (e) {
                   console.error(">>> [WEBHOOK] Erro ao processar reação:", e);
                }
                continue;
              }

              const contact = change.contacts?.[0];
              console.log(`>>> [WEBHOOK] Mensagem INBOUND de: ${message.from}`);
              
              const fromPhoneRaw = String(message.from || '').replace(/\D/g, '');
              let whatsappId = fromPhoneRaw;
              let contactTeamId = 'team_ivw2d5s3u';

              // Persistir no PostgreSQL
              let insertedMessage = null;
              try {
                // Fuzzy matching for Brazil: check both 12 and 13 digit versions
                const legacyId = (fromPhoneRaw.startsWith('55') && fromPhoneRaw.length === 13)
                  ? fromPhoneRaw.slice(0, 4) + fromPhoneRaw.slice(5)
                  : fromPhoneRaw;
                const modernId = (fromPhoneRaw.startsWith('55') && fromPhoneRaw.length === 12)
                  ? fromPhoneRaw.slice(0, 4) + '9' + fromPhoneRaw.slice(4)
                  : fromPhoneRaw;
                
                const metaPhoneId = change.metadata?.phone_number_id;
                if (metaPhoneId) {
                  const configCheck = await query('SELECT team_id FROM whatsapp_configs WHERE phone_number_id = $1 LIMIT 1', [metaPhoneId]);
                  if (configCheck.rows.length > 0 && configCheck.rows[0].team_id) {
                     contactTeamId = configCheck.rows[0].team_id;
                  }
                }
                
                if (!contactTeamId || contactTeamId === 'main-team') {
                  const activeConfig = await query('SELECT team_id FROM whatsapp_configs ORDER BY updated_at DESC LIMIT 1');
                  if (activeConfig.rows.length > 0 && activeConfig.rows[0].team_id) {
                    contactTeamId = activeConfig.rows[0].team_id;
                  }
                }
                
                // Fuzzy matching for existing contact in DB
                const variants = getVariants(whatsappId);
                const teamCheck = await query(
                  'SELECT team_id, whatsapp_id FROM contacts WHERE whatsapp_id = ANY($1) OR phone = ANY($1) LIMIT 1', 
                  [variants]
                );
                
                if (teamCheck.rows.length > 0) {
                   whatsappId = teamCheck.rows[0].whatsapp_id; // Stick to what we have in DB
                   if ((contactTeamId === 'main-team' || !contactTeamId) && teamCheck.rows[0].team_id) {
                      contactTeamId = teamCheck.rows[0].team_id;
                   }
                } else if (!contactTeamId || contactTeamId === 'main-team') {
                   // Fallback: try to find a team from custom_statuses
                   const statusCheck = await query('SELECT team_id FROM custom_statuses LIMIT 1');
                   if (statusCheck.rows.length > 0 && statusCheck.rows[0].team_id) {
                      contactTeamId = statusCheck.rows[0].team_id;
                   }
                }
                
                let messageText = message.text?.body 
                                  || message.button?.text 
                                  || message.button?.payload 
                                  || message.interactive?.button_reply?.title 
                                  || message.interactive?.list_reply?.title;

                if (!messageText) {
                  if (message.type === 'image') messageText = message.image?.caption || '[Imagem]';
                  else if (message.type === 'video') messageText = message.video?.caption || '[Vídeo]';
                  else if (message.type === 'audio') messageText = '[Áudio]';
                  else if (message.type === 'document') messageText = message.document?.caption || message.document?.filename || '[Documento]';
                  else if (message.type === 'sticker') messageText = '[Sticker]';
                  else messageText = JSON.stringify(message);
                }

                console.log("=".repeat(50));
                console.log(`>>> [WEBHOOK DB] PROCESSANDO MENSAGEM <<<`);
                console.log(`FROM: ${message.from} | WHATSAPP_ID: ${whatsappId}`);
                console.log(`TEAM ATRIBUÍDO: ${contactTeamId}`);
                console.log(`MENSAGEM: ${messageText}`);
                console.log("=".repeat(50));

                // 1. Upsert Contact
                await query(`
                  INSERT INTO contacts (whatsapp_id, name, phone, team_id, last_message_at, last_received_at, last_message_content, unread_count)
                  VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5, 1)
                  ON CONFLICT (whatsapp_id) 
                  DO UPDATE SET 
                    team_id = EXCLUDED.team_id,
                    last_message_at = CURRENT_TIMESTAMP, 
                    last_received_at = CURRENT_TIMESTAMP,
                    last_message_content = EXCLUDED.last_message_content,
                    unread_count = contacts.unread_count + 1,
                    updated_at = CURRENT_TIMESTAMP
                `, [whatsappId, contact?.profile?.name || 'Desconhecido', whatsappId, contactTeamId, messageText]);
                console.log(`>>> [DEBUG DB] UPSERT CONTATO OK: ${whatsappId}`);

                // 2. Insert Message
                const msgResult = await query(`
                  INSERT INTO messages (whatsapp_message_id, contact_whatsapp_id, content, type, direction, status, timestamp, team_id, metadata)
                  VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), $8, $9)
                  ON CONFLICT (whatsapp_message_id) 
                  DO UPDATE SET status = EXCLUDED.status
                  RETURNING *
                `, [
                  message.id, 
                  whatsappId, 
                  messageText, 
                  message.type, 
                  'inbound', 
                  'received', 
                  message.timestamp, 
                  contactTeamId,
                  JSON.stringify(message)
                ]);
                console.log(`>>> [DEBUG DB] MENSAGEM INSERIDA OK: ${message.id}`);

                insertedMessage = msgResult.rows[0];

                // 3. Mark as replied in campaign_contacts if applicable
                const replyUpdate = await query(`
                    UPDATE campaign_contacts 
                    SET replied_at = CURRENT_TIMESTAMP, status = 'REPLIED'
                    WHERE whatsapp_id = $1 
                      AND status IN ('SENT', 'DELIVERED', 'READ')
                      AND replied_at IS NULL
                    RETURNING campaign_id
                `, [whatsappId]);
                
                if (replyUpdate.rows.length > 0) {
                    for (const row of replyUpdate.rows) {
                        await query("UPDATE campaigns SET replied_count = replied_count + 1 WHERE id = $1", [row.campaign_id]);
                    }
                }
              } catch (dbErr) {
                console.error(">>> [WEBHOOK] DB Error (Inbound):", dbErr);
              }

              io.emit("contact_updated", { whatsapp_id: whatsappId, team_id: contactTeamId });
              io.emit("conversation:updated", { contactId: whatsappId, team_id: contactTeamId });
              io.emit("whatsapp:message_received", { 
                message: insertedMessage || message, 
                contact,
                contactId: whatsappId,
                team_id: contactTeamId,
                metadata: change.metadata,
                waba_id: body.entry?.[0]?.id
              });
            }
          }
          
    // handle message statuses (Outgoing message updates like sent, delivered, read, failed)
          if (change.statuses && change.statuses.length > 0) {
            for (const status of change.statuses) {
              const recipientId = (status.recipient_id || '').replace(/\D/g, '');
              console.log(`>>> [WEBHOOK] Status update: ${status.status} p/ msg ${status.id} (Para: ${recipientId})`);
              
              try {
                // Priority array
                const priorities: Record<string, number> = { 'accepted': 0.5, 'sent': 1, 'delivered': 2, 'read': 3, 'failed': 4 };
                
                // Fetch current status to apply priority safely
                const checkMsg = await query("SELECT status, contact_whatsapp_id FROM messages WHERE whatsapp_message_id = $1", [status.id]);
                
                let shouldUpdate = false;
                let finalStatus = status.status;

                if (checkMsg.rows.length > 0) {
                   const curr = checkMsg.rows[0].status;
                   const currPrio = priorities[curr] || 0;
                   const nextPrio = priorities[status.status] || 0;

                   if (status.status === 'failed' || !curr || nextPrio > currPrio) {
                      shouldUpdate = true;
                   } else {
                      finalStatus = curr; // Mantém o atual se a prioridade for menor
                   }
                } else {
                   console.log(`>>> [WEBHOOK DB] Mensagem ${status.id} não encontrada, criando placeholder provisório...`);
                   try {
                     await query(`
                       INSERT INTO messages (whatsapp_message_id, contact_whatsapp_id, content, type, direction, status, timestamp, team_id)
                       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
                       ON CONFLICT (whatsapp_message_id) 
                       DO UPDATE SET status = $6, updated_at = CURRENT_TIMESTAMP
                     `, [status.id, recipientId || 'unknown', '[Enviando...]', 'text', 'outbound', finalStatus, 'main-team']);
                     shouldUpdate = true; // Força emissão
                   } catch (e) {
                     console.error(">>> [WEBHOOK DB] Erro ao criar placeholder:", e);
                   }
                }

                if (shouldUpdate) {
                  let errDetails = null;
                  if (status.errors && status.errors.length > 0) {
                      errDetails = JSON.stringify(status.errors);
                      console.error(`>>> [WEBHOOK] Mensagem ${status.id} falhou com erro:`, status.errors);
                  }

                  const updateMsgRes = await query(`
                    UPDATE messages
                    SET status = $1, error_details = COALESCE($3, error_details), updated_at = CURRENT_TIMESTAMP
                    WHERE whatsapp_message_id = $2
                    RETURNING *
                  `, [finalStatus, status.id, errDetails]);

                  if (updateMsgRes.rows.length > 0) {
                    const updatedMsg = updateMsgRes.rows[0];
                    console.log(`>>> [WEBHOOK DB] Mensagem sincronizada! ID: ${status.id} -> ${finalStatus}`);
                    io.emit("whatsapp:message_status", {
                      messageId: status.id,
                      status: finalStatus,
                      recipient_id: updatedMsg.contact_whatsapp_id,
                      error_details: errDetails ? status.errors : null
                    });
                  }
                } else if (checkMsg.rows.length > 0) {
                   // Only emit the socket update if we know it exists, ensuring UI stays consistent
                   io.emit("whatsapp:message_status", {
                      messageId: status.id,
                      status: finalStatus,
                      recipient_id: checkMsg.rows[0].contact_whatsapp_id
                   });
                }

                // 2. Update Campaign Contact if applicable
                // Check current status to decide if we increment counts
                const ccCheck = await query("SELECT status, campaign_id FROM campaign_contacts WHERE message_id = $1", [status.id]);
                if (ccCheck.rows.length > 0) {
                    const oldStatus = ccCheck.rows[0].status;
                    const campId = ccCheck.rows[0].campaign_id;
                    
                    if (status.status === 'delivered' && oldStatus === 'SENT') {
                       await query("UPDATE campaign_contacts SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP WHERE message_id = $1", [status.id]);
                       await query("UPDATE campaigns SET delivered_count = delivered_count + 1 WHERE id = $1", [campId]);
                    } else if (status.status === 'read' && (oldStatus === 'SENT' || oldStatus === 'DELIVERED')) {
                       await query("UPDATE campaign_contacts SET status = 'READ', read_at = CURRENT_TIMESTAMP, delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP) WHERE message_id = $1", [status.id]);
                       if (oldStatus === 'SENT') {
                          await query("UPDATE campaigns SET delivered_count = delivered_count + 1, read_count = read_count + 1 WHERE id = $1", [campId]);
                       } else {
                          await query("UPDATE campaigns SET read_count = read_count + 1 WHERE id = $1", [campId]);
                       }
                    } else if (status.status === 'failed' && oldStatus !== 'FAILED') {
                       await query("UPDATE campaign_contacts SET status = 'FAILED', error = 'Meta Delivery Fail' WHERE message_id = $1", [status.id]);
                       await query("UPDATE campaigns SET failed_count = failed_count + 1 WHERE id = $1", [campId]);
                    }
                }

              } catch (dbErr) {
                console.error(">>> [WEBHOOK] DB Error (Status Update):", dbErr);
              }
            }
          }
        }
      }
    }
    } catch (err) {
      console.error(">>> [WEBHOOK] Erro ao processar payload:", err);
    }
  });

  // --- META DATA DELETION CALLBACK ---
  app.post("/api/data-deletion", (req, res) => {
    res.json({
      url: `${req.protocol}://${req.get("host")}/data-deletion`,
      confirmation_code: "deleted_" + Date.now(),
    });
  });

  // Removed initDb here since it's now awaited at startup

  // --- SOCKET.IO ---
  io.on("connection", (socket) => {
    console.log("Client connected via socket");
  });

  app.get("/api/media/:media_id", async (req, res) => {
    const mediaId = req.params.media_id;
    const creds = await getWhatsAppCredentials(req.query.teamId as string);
    const token = creds.token;
    if (!token) {
       res.status(500).send("API credentials not configured");
       return;
    }
    try {
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const mediaMetadata = await metaRes.json();
      if (!metaRes.ok || !mediaMetadata.url) {
        res.status(404).send("Media metadata not found");
        return;
      }
      
      const downloadRes = await fetch(mediaMetadata.url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!downloadRes.ok) {
        res.status(500).send("Failed to download media");
        return;
      }
      
      res.setHeader('Content-Type', mediaMetadata.mime_type || 'application/octet-stream');
      
      if (downloadRes.body) {
        const readable = (await import('stream')).Readable.fromWeb(downloadRes.body as any);
        readable.pipe(res);
      } else {
        res.end();
      }
    } catch (err: any) {
      console.error(err);
      res.status(500).send("Internal Error");
    }
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

  app.post("/api/send-message-with-media", upload.single("file"), async (req, res) => {
    const { to: rawTo, type, phoneNumberId: reqPhoneId, accessToken: reqToken, contextMessageId, teamId } = req.body;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    let to = String(rawTo || '').replace(/\D/g, '');
    if (to.startsWith('55')) {
       if (to.length === 12 && to.charAt(4) !== '9') {
          to = to.slice(0, 4) + '9' + to.slice(4);
       }
    } else if (to.length === 11 || to.length === 10) {
       to = '55' + to;
       if (to.length === 12) to = to.slice(0, 4) + '9' + to.slice(4);
    }
    const whatsappId = to;

    const creds = await getWhatsAppCredentials(teamId);
    const phoneNumberId = cleanEnvValue(reqPhoneId) || creds.phoneId;
    const token = cleanEnvValue(reqToken) || creds.token;

    if (!phoneNumberId || !token) {
        res.status(500).json({ error: "API credentials not configured." });
        return;
    }

    try {
      // Fix multer encoding issue if it reads UTF-8 as latin1
      const originalnameUtf8 = Buffer.from(file.originalname, 'latin1').toString('utf8');

      // 1. Upload media to WhatsApp
      const formData = new FormData();
      const blob = new Blob([file.buffer], { type: file.mimetype });
      formData.append('file', blob, originalnameUtf8);
      formData.append('type', file.mimetype);
      formData.append('messaging_product', 'whatsapp');

      const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData as any
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.id) {
        console.error("Meta upload error:", uploadData);
        throw new Error(uploadData.error?.message || "Failed to upload media to Meta");
      }

      const mediaId = uploadData.id;

      // 2. Send the message with the media ID
      const payload: any = {
        messaging_product: "whatsapp",
        to: to,
        type,
      };

      if (contextMessageId) {
         payload.context = { message_id: contextMessageId };
      }

      payload[type] = { id: mediaId };

      if (type === "audio") {
        payload[type].ptt = true;
      }

      // seachment / document requires filename to show properly on recipient screen
      if (type === 'document' && originalnameUtf8) {
         payload[type].filename = originalnameUtf8;
      }

      let url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (response.ok && data.messages && data.messages.length > 0) {
        const metaMsg = data.messages[0];
        try {
          const insertedMessageRes = await query(`
            INSERT INTO messages (whatsapp_message_id, contact_whatsapp_id, content, type, direction, status, timestamp, team_id, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8)
            ON CONFLICT (whatsapp_message_id) 
            DO UPDATE SET 
               content = EXCLUDED.content,
               type = EXCLUDED.type,
               metadata = EXCLUDED.metadata,
               status = CASE 
                  WHEN messages.status = 'failed' THEN 'failed'
                  WHEN messages.status = 'read' THEN 'read'
                  WHEN messages.status = 'delivered' THEN 'delivered'
                  WHEN messages.status = 'sent' AND EXCLUDED.status = 'accepted' THEN 'sent'
                  ELSE EXCLUDED.status 
               END,
               updated_at = CURRENT_TIMESTAMP
            RETURNING *
          `, [
            metaMsg.id,
            whatsappId,
            originalnameUtf8 || `[${type}]`,
            type,
            'outbound',
            'sent',
            teamId ,
            JSON.stringify({ ...payload, [type]: { ...payload[type], link: "", id: mediaId } })
          ]);
 
          const insertedMessage = insertedMessageRes.rows[0];

          await query(`
             UPDATE contacts 
             SET last_message_at = CURRENT_TIMESTAMP, 
                 last_message_content = $1
             WHERE whatsapp_id = $2
          `, [originalnameUtf8 || `[${type}]`, whatsappId]);

          // Emit for real-time update
          io.emit("whatsapp:message_received", { 
             message: insertedMessage,
             whatsapp_id: whatsappId
          });

        } catch (dbErr) {
           console.error(">>> [WEBHOOK] DB Insert Error:", dbErr);
        }
      }

      res.json(data);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // API to Send outgoing messages via Meta Cloud API
  app.post("/api/send-message", async (req, res) => {
    const { to: rawTo, type, text, template, templateText, phoneNumberId: reqPhoneId, accessToken: reqToken, appSecret, contextMessageId, teamId } = req.body;
    
    // Normalize phone number for Meta (force 13 digits for Brazil mobile if 12 are provided)
    let to = String(rawTo || '').replace(/\D/g, '');
    if (to.startsWith('55')) {
       if (to.length === 12 && to.charAt(4) !== '9') {
          // Add the likely missing 9 for Brazil mobile
          to = to.slice(0, 4) + '9' + to.slice(4);
          console.log(`>>> [SERVER] Normalizing ${rawTo} to ${to} for Meta API`);
       }
    } else if (to.length === 11 || to.length === 10) {
       to = '55' + to;
       if (to.length === 12) to = to.slice(0, 4) + '9' + to.slice(4);
    }
    
    const whatsappId = to;
    
    const creds = await getWhatsAppCredentials(teamId);
    const phoneNumberId = cleanEnvValue(reqPhoneId) || creds.phoneId;
    const token = cleanEnvValue(reqToken) || creds.token;
    
    if (!phoneNumberId || !token) {
        res.status(500).json({ error: "API credentials not configured. Please supply them in body." });
        return;
    }

    // Diagnostic logging for troubleshooting environment variable configurations
    console.log(`>>> [SERVER] Sending message via Meta API to: ${to}`);
    console.log(`>>> [SERVER] Diagnostics for credentials used:`);
    console.log(`  - Phone ID: "${phoneNumberId}" (length: ${phoneNumberId.length})`);
    console.log(`  - Token Length: ${token.length}`);
    console.log(`  - Token Prefix/Suffix: "${token.substring(0, 10)}...${token.substring(token.length - 10)}"`);
    console.log(`  - Token has space: ${token.includes(' ') || token.includes('t')}`);
    console.log(`  - Token has newlines: ${token.includes('n') || token.includes('r')}`);
    console.log(`  - Token has quotes: ${token.startsWith('"') || token.startsWith("'")}`);

    try {
      const payload: any = {
        messaging_product: "whatsapp",
        to: to,
        type,
      };

      if (contextMessageId) {
        payload.context = { message_id: contextMessageId };
      }
      
      if (type === 'text') {
          payload.text = { body: text };
      } else if (type === 'template') {
          payload.template = {
             name: template?.name,
             language: typeof template?.language === 'string' 
                ? { code: template.language } 
                : (template?.language || { code: 'pt_BR' })
          };
          
          if (Array.isArray(template?.components) && template.components.length > 0) {
             const cleanComponents = template.components
               .filter((c: any) => Array.isArray(c?.parameters) && c.parameters.length > 0)
               .map((c: any) => ({
                 type: c.type,
                 parameters: c.parameters.map((p: any) => ({
                   type: p.type || 'text',
                   text: (p.text !== undefined && p.text !== null && String(p.text).trim() !== '') ? String(p.text) : ' '
                 }))
               }));
               
             if (cleanComponents.length > 0) {
                payload.template.components = cleanComponents;
             }
          }
      } else if (type === 'reaction') {
          payload.reaction = {
            message_id: contextMessageId, // The ID of the message you're reacting to
            emoji: text // The emoji string
          };
      } else if (type === 'contacts') {
          payload.contacts = req.body.contacts;
      } else if (['image', 'video', 'audio', 'document', 'sticker'].includes(type) && (req.body.link || req.body.mediaId)) {
          payload[type] = req.body.link ? { link: req.body.link } : { id: req.body.mediaId };
          if (type === 'document' && req.body.filename) {
             payload[type].filename = req.body.filename;
          }
      }

      let url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      
      // If Meta requires the appsecret_proof, we compute it using the App Secret
      if (appSecret) {
        const appsecret_proof = crypto.createHmac('sha256', appSecret).update(token).digest('hex');
        url += `?appsecret_proof=${appsecret_proof}`;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      let data;
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        throw new Error(`Meta API Error (Not JSON): ${responseText.substring(0, 500)}`);
      }

      if (!response.ok) {
        // Diagnostics injection
        const dbCreds = await getWhatsAppCredentials(teamId);
        const systemToken = dbCreds.token;
        const systemPhoneID = dbCreds.phoneId;
        const hasBodyToken = !(!reqToken);
        const hasBodyPhoneId = !(!reqPhoneId);
        const appSecretExists = !(!process.env.META_APP_SECRET);
        console.error(">>> [META ERROR] Send failed:", responseText);
        return res.status(400).json({ 
           success: false, 
            error: data?.error?.message || responseText || "Erro na Meta", details: data, diagnostics: { source: "Meta API Response Error", phoneId: phoneNumberId, phoneIdSrc: hasBodyPhoneId ? "request_body" : "db_or_env_variable", tokenLength: token.length, tokenPrefix: token.substring(0, Math.min(token.length, 15)), tokenSuffix: token.substring(Math.max(0, token.length - 15)), tokenSource: hasBodyToken ? "request_body" : "db_or_env_variable", hasQuotes: token.startsWith("\"") || token.startsWith(''), hasSpaces: false, hasNewlines: false }
        });
      }

      // Se enviado com sucesso, persistir no PG
      if (response.ok && data.messages && data.messages.length > 0) {
        const metaMsg = data.messages[0];
        try {
          if (type === 'reaction') {
             const emoji = text;
             const reactRes = await query(`
               UPDATE messages 
               SET reactions = CASE
                 WHEN $1 = '' THEN '[]'::jsonb
                 ELSE jsonb_build_array(jsonb_build_object('emoji', $1, 'timestamp', CURRENT_TIMESTAMP))
               END
               WHERE whatsapp_message_id = $2
               RETURNING *
             `, [emoji, contextMessageId]);

             if (reactRes.rows.length > 0) {
                io.emit("whatsapp:message_reaction", {
                   messageId: contextMessageId,
                   reactions: reactRes.rows[0].reactions
                });
             }
          } else {
             const insertedMessageRes = await query(`
               INSERT INTO messages (whatsapp_message_id, contact_whatsapp_id, content, type, direction, status, timestamp, team_id, metadata)
               VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8)
               ON CONFLICT (whatsapp_message_id) 
               DO UPDATE SET 
                  content = EXCLUDED.content,
                  type = EXCLUDED.type,
                  metadata = EXCLUDED.metadata,
                  status = CASE 
                     WHEN messages.status = 'failed' THEN 'failed'
                     WHEN messages.status = 'read' THEN 'read'
                     WHEN messages.status = 'delivered' THEN 'delivered'
                     WHEN messages.status = 'sent' AND EXCLUDED.status = 'accepted' THEN 'sent'
                     ELSE EXCLUDED.status 
                  END,
                  updated_at = CURRENT_TIMESTAMP
               RETURNING *
             `, [
               metaMsg.id,
               whatsappId,
               text || templateText || (type === 'template' ? `[Template: ${template.name}]` : type === 'contacts' ? '[Contato]' : '[Outro]'),
               type,
               'outbound',
               'sent',
               teamId ,
               JSON.stringify(payload)
             ]);
    
             const insertedMessage = insertedMessageRes.rows[0];

             // Assegurar que o contato existe e atualizar last_message_at
             await query(`
                INSERT INTO contacts (whatsapp_id, name, phone, team_id, last_message_at, last_message_content)
                VALUES ($1, $2, $2, $3, CURRENT_TIMESTAMP, $4)
                ON CONFLICT (whatsapp_id) DO UPDATE SET 
                  last_message_at = CURRENT_TIMESTAMP,
                  last_message_content = EXCLUDED.last_message_content,
                  updated_at = CURRENT_TIMESTAMP
             `, [whatsappId, whatsappId, teamId , text || (type === 'template' ? `[Modelo: ${template.name}]` : '[Outro]')]);

             // Emit for real-time update
             io.emit("whatsapp:message_received", { 
                message: insertedMessage,
                whatsapp_id: whatsappId
             });
          }
        } catch (dbErr) {
          console.error(">>> [API] DB Save Error (Send):", dbErr);
        }
      }

      res.json({ success: response.ok, data });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/contacts/read", async (req, res) => {
    const { whatsappId } = req.body;
    if (!whatsappId) return res.status(400).json({ error: "whatsappId is required" });
    try {
      await query("UPDATE contacts SET unread_count = 0 WHERE whatsapp_id = $1", [whatsappId]);
      io.emit("whatsapp:read_updated", { whatsappId });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/contacts/update", async (req, res) => {
    const { whatsappId, name, email } = req.body;
    if (!whatsappId) return res.status(400).json({ error: "whatsappId is required" });
    try {
      const variants = getVariants(String(whatsappId));
      await query(
        "UPDATE contacts SET name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE whatsapp_id = ANY($3) OR phone = ANY($3)",
        [name, email || null, variants]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating contact:", err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Vite middleware for development
  const isProd = process.env.NODE_ENV === "production";
  const distPath = path.join(process.cwd(), "dist");

  // Endpoint to normalize all existing IDs in the database (Fixing the 9th digit transition)
  app.post("/api/fix-ids", async (req, res) => {
     try {
        console.log(">>> [FIX] Iniciando normalização de IDs no Banco de Dados...");
        
        const contactsRes = await query("SELECT id, whatsapp_id FROM contacts");
        let fixedContacts = 0;
        
        for (const contact of contactsRes.rows) {
           const canonical = getCanonical(contact.whatsapp_id);
           if (canonical !== contact.whatsapp_id) {
              const existsRes = await query("SELECT id FROM contacts WHERE whatsapp_id = $1", [canonical]);
              if (existsRes.rows.length > 0) {
                 await query("UPDATE messages SET contact_whatsapp_id = $1 WHERE contact_whatsapp_id = $2", [canonical, contact.whatsapp_id]);
                 await query("DELETE FROM contacts WHERE id = $1", [contact.id]);
              } else {
                 await query("UPDATE contacts SET whatsapp_id = $1 WHERE id = $2", [canonical, contact.id]);
                 await query("UPDATE messages SET contact_whatsapp_id = $1 WHERE contact_whatsapp_id = $2", [canonical, contact.whatsapp_id]);
              }
              fixedContacts++;
           }
        }

        const messagesRes = await query("SELECT id, contact_whatsapp_id FROM messages");
        let fixedMessages = 0;
        for (const msg of messagesRes.rows) {
           const canonical = getCanonical(msg.contact_whatsapp_id);
           if (canonical !== msg.contact_whatsapp_id) {
              await query("UPDATE messages SET contact_whatsapp_id = $1 WHERE id = $2", [canonical, msg.id]);
              fixedMessages++;
           }
        }

        res.json({ success: true, fixedContacts, fixedMessages });
     } catch (err) {
        console.error(">>> [FIX ERROR]", err);
        res.status(500).json({ error: String(err) });
     }
  });

  if (isProd) {
    console.log(">>> MODO PRODUÇÃO (DIST) <<<");
    // Garante que o index.html seja servido na raiz
    app.get("/", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.log(">>> MODO DESENVOLVIMENTO (VITE) <<<");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    }

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`>>> SERVER RUNNING ON PORT ${PORT} <<<`);
    });
}

startServer().catch(err => {
  console.error("FAILED TO START SERVER:", err);
});
