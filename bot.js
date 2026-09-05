const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const mongoose = require('mongoose');
const http = require('http');
const pino = require('pino');

const MONGO_URL = 'mongodb+srv://jmrkort_db_user:5yQ45yNADSw8z2J0@cluster0.qvfzfcc.mongodb.net/?appName=Cluster0';
const SESSION_ID = 'bot-client';

let currentQrDataUrl = null;

const server = http.createServer((req, res) => {
    if (req.url === '/qr') {
        if (currentQrDataUrl) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>WhatsApp QR</title></head>
<body style="text-align:center; background:#f0f0f0; padding:20px;">
<h2>WhatsApp Bot QR Kodu</h2>
<img src="${currentQrDataUrl}" width="300" height="300">
<p>Telefonunuzda WhatsApp-ı açın: Ayarlar → Bağlı cihazlar → Cihaz əlavə et. Sonra bu kodu skan edin.</p>
</body>
</html>`);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Hazırda QR kod mövcud deyil. Bot ya artıq bağlanıb, ya da QR gözləyir.');
        }
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bot işləyir. QR üçün /qr ünvanına keçin.');
    }
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`HTTP server port ${PORT}-da işləyir`));

const sessionSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    creds: Object,
    keys: Object
});
const Session = mongoose.model('Session', sessionSchema);

async function useMongoAuthState(sessionId) {
    const doc = await Session.findOne({ id: sessionId });
    let creds = doc?.creds || {};
    let keys = doc?.keys || {};

    return {
        state: {
            creds,
            keys
        },
        saveCreds: async () => {
            await Session.findOneAndUpdate(
                { id: sessionId },
                { id: sessionId, creds, keys },
                { upsert: true }
            );
        }
    };
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

let sock;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMongoAuthState(SESSION_ID);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        browser: ['Ubuntu', 'Chrome', '20.0.0'],
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('Yeni QR kod yaradıldı');
            currentQrDataUrl = await qrcode.toDataURL(qr);
            console.log('QR kodu /qr ünvanında mövcuddur');
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('Bağlantı kəsildi, yenidən cəhd edilir...');
                currentQrDataUrl = null;
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('Sessiya çıxış edildi, yeni QR lazımdır');
                currentQrDataUrl = null;
            }
        } else if (connection === 'open') {
            console.log('Bot hazırdır və işləyir!');
            currentQrDataUrl = null;
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

mongoose.connect(MONGO_URL)
    .then(() => {
        console.log('MongoDB bağlandı');
        connectToWhatsApp();
    })
    .catch(err => {
        console.error('MongoDB xətası:', err);
        process.exit(1);
    });