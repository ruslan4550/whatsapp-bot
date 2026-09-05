const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const mongoose = require('mongoose');
const http = require('http');
const pino = require('pino');

const MONGO_URL = 'mongodb+srv://jmrkort_db_user:5yQ45yNADSw8z2J0@cluster0.qvfzfcc.mongodb.net/?appName=Cluster0';
const SESSION_ID = 'bot-client';
let currentQrDataUrl = null;

const server = http.createServer((req, res) => {
    if (req.url === '/qr' && currentQrDataUrl) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="text-align:center;"><h2>WhatsApp QR</h2><img src="${currentQrDataUrl}" width="300" height="300"><p>WhatsApp-da Ayarlar → Bağlı cihazlar → Cihaz əlavə et</p></body></html>`);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bot işləyir. QR üçün /qr');
    }
});
server.listen(process.env.PORT || 10000, () => console.log('HTTP server işləyir'));

const sessionSchema = new mongoose.Schema({ id: String, creds: Object, keys: Object });
const Session = mongoose.model('Session', sessionSchema);

let sock;

async function connectToWhatsApp() {
    const doc = await Session.findOne({ id: SESSION_ID });
    const creds = doc?.creds || {};
    const keys = doc?.keys || {};

    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: {
            creds,
            keys: makeCacheableSignalKeyStore(keys, pino({ level: 'silent' }))
        },
        browser: ['Ubuntu', 'Chrome', '20.0.0']
    });

    sock.ev.on('creds.update', async () => {
        await Session.findOneAndUpdate(
            { id: SESSION_ID },
            { id: SESSION_ID, creds: sock.authState.creds, keys: sock.authState.keys },
            { upsert: true }
        );
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            currentQrDataUrl = await qrcode.toDataURL(qr);
            console.log('QR hazırdır /qr ünvanında');
        }
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            console.log('Bot hazırdır!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (!msg.key.fromMe && msg.message) {
                const from = msg.key.remoteJid;
                if (from.endsWith('@s.whatsapp.net')) {
                    await sock.sendMessage(from, { text: SABLON_MESAJ });
                    console.log(`Cavab göndərildi: ${from}`);
                }
            }
        }
    });
}

const SABLON_MESAJ = `📩 Avtomatik Cavab

Status: 🟢 Avtocavab aktiv
Mətn:
💳 Depozit → müştəriyə avtomatik kart məlumatlarını göndərsin.
🔗 Avtodepozit → avtomatik depozit linkini göndərsin.
💸 Çıxarış → iki seçim açılsın:
Avtoçıxarış
Manuel çıxarış
🌐 Saytımız → birbaşa saytınıza yönləndirsin.`;

mongoose.connect(MONGO_URL).then(() => {
    console.log('MongoDB bağlandı');
    connectToWhatsApp();
}).catch(err => {
    console.error('MongoDB xətası', err);
    process.exit(1);
});