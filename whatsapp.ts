import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore,
    AuthenticationState
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import fs from 'fs/promises';
import path from 'path';
import { query } from './src/lib/db';

const AUTH_PATH = path.join(process.cwd(), 'auth_info_baileys');

export async function setupWhatsApp(io: Server) {
    // Ensure auth directory exists
    try {
        await fs.mkdir(AUTH_PATH, { recursive: true });
    } catch (e) {
        // ignore
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

    const connectToWhatsApp = async () => {
        const sock = makeWASocket({
            version,
            browser: ['Mac OS', 'Chrome', '110.0.5481.178'],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, console as any),
            },
            printQRInTerminal: true,
            connectTimeoutMs: 120000, // doubled timeout
            defaultQueryTimeoutMs: undefined,
            keepAliveIntervalMs: 20000,
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                const qrImage = await QRCode.toDataURL(qr);
                io.emit('whatsapp:qr', qrImage);
                console.log('QR Code generated and emitted');
            }

            if (connection === 'close') {
                const error = lastDisconnect?.error as Boom;
                const statusCode = error?.output?.statusCode;
                
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log(`Connection closed. Status: ${statusCode}. Reconnecting: ${shouldReconnect}`);
                
                if (shouldReconnect) {
                    io.emit('whatsapp:qr', null);
                    setTimeout(connectToWhatsApp, 5000);
                }
                io.emit('whatsapp:status', 'disconnected');
            } else if (connection === 'open') {
                console.log('WhatsApp connection opened successfully');
                io.emit('whatsapp:status', 'connected');
                io.emit('whatsapp:qr', null); // Clear QR on success
            }
        });

        // Permitir que o frontend peça o status atual
        io.on('connection', (socket) => {
            socket.on('whatsapp:get-status', () => {
                const isConnected = sock?.user ? 'connected' : 'disconnected';
                socket.emit('whatsapp:status', isConnected);
            });
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            if (m.type === 'notify') {
                for (const msg of m.messages) {
                    if (!msg.key.fromMe && msg.message) {
                        const from = msg.key.remoteJid;
                        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
                        console.log(`Received message from ${from}: ${text}`);
                        
                        // Push to PostgreSQL
                        try {
                            // Basic contact sync
                            await query(
                                `INSERT INTO contacts (whatsapp_id, phone, team_id, last_message_at, updated_at) 
                                 VALUES ($1, $2, $3, $4, $5) 
                                 ON CONFLICT (whatsapp_id) DO UPDATE SET last_message_at = $4, updated_at = $5`,
                                [from, from?.split('@')[0], 'default_team', new Date(), new Date()]
                            );

                            // Message sync
                            const msgResult = await query(
                                `INSERT INTO messages (whatsapp_message_id, contact_whatsapp_id, content, type, direction, status, timestamp, team_id)
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                                 ON CONFLICT (whatsapp_message_id) 
                                 DO UPDATE SET status = EXCLUDED.status
                                 RETURNING *`,
                                [msg.key.id, from, text, 'text', 'inbound', 'delivered', new Date(), 'default_team']
                            );

                            io.emit('whatsapp:message_received', {
                                message: msgResult.rows[0] || { from, text },
                                contact: { profile: { name: msg.pushName || from } }
                            });
                        } catch (err) {
                            console.error('Error syncing message to DB', err);
                        }
                    }
                }
            }
        });

        return sock;
    };

    const sock = await connectToWhatsApp();

    // Export a function to trigger history sync if needed
    // Baileys automatically handles history sync via the 'messaging-history.set' event
    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
        console.log(`Synced ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages`);
        io.emit('whatsapp:sync', { chats: chats.length, contacts: contacts.length, messages: messages.length });
        
        // Import contacts to DB
        for (const contact of contacts) {
            try {
                await query(
                    `INSERT INTO contacts (whatsapp_id, name, phone, team_id) 
                     VALUES ($1, $2, $3, $4) 
                     ON CONFLICT (whatsapp_id) DO UPDATE SET name = $2, phone = $3`,
                    [contact.id, contact.name || contact.notify || '', contact.id.split('@')[0], 'default_team']
                );
            } catch (e) {
                // ignore
            }
        }
    });
}
