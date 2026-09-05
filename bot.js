const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const mongoose = require('mongoose');
const http = require('http');
const pino = require('pino');

const MONGO_URL = 'mongodb+srv://jmrkort_db_user:5yQ45yNADSw8z2J0@cluster0.qvfzfcc.mongodb.net/?appName=Cluster0';
let currentQrDataUrl = null;

// Şablon mesaj yuxarı qaldırıldı ki, kod işə düşəndə dərhal əlçatan olsun
const SABLON_MESAJ = `📩 Avtomatik Cavab

Status: 🟢 Avtocavab aktiv
Mətn:
💳 Depozit → müştəriyə avtomatik kart məlumatlarını göndərsin.
🔗 Avtodepozit → avtomatik depozit linkini göndərsin.
💸 Çıxarış → iki seçim açılsın:
Avtoçıxarış
Manuel çıxarış
🌐 Saytımız → birbaşa saytınıza yönləndirsin.`;

const server = http.createServer((req, res) => {
    if (req.url === '/qr' && currentQrDataUrl) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="text-align:center; padding:20px;"><h2>WhatsApp QR Kodu</h2><img src="${currentQrDataUrl}" width="300" height="300"><p>WhatsApp-da: Ayarlar → Bağlı cihazlar → Cihaz əlavə et</p></body></html>`);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bot işləyir. QR üçün /qr ünvanına keçin.');
    }
});
server.listen(process.env.PORT || 10000, () => console.log('HTTP server işləyir'));

let sock;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.0'],
        markOnlineOnConnect: true // Botun xətdə görünməsini təmin edir
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQrDataUrl = await qrcode.toDataURL(qr);
            console.log('QR hazırdır! Tarayıcıda /qr ünvanına keçin.');
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Bağlantı kəsildi, yenidən qoşulur...');
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('Sessiya bağlandı. Yenidən qoşulmaq üçün "auth_info_baileys" qovluğunu silin.');
            }
        } else if (connection === 'open') {
            console.log('Bot hazırdır və WhatsApp-a qoşuldu!');
            currentQrDataUrl = null;
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return; // Yalnız yeni gələn bildirişlər

        for (const msg of messages) {
            try {
                if (!msg.message) continue; // Boş mesajları keç
                if (msg.key.fromMe) continue; // Öz göndərdiyimiz mesajlara cavab vermə

                // ƏSAS HƏLL: Kompanyon cihazın sinxronizasiya və protokol mesajlarını bloklayırıq
                const isProtocolMsg = msg.message.protocolMessage || msg.message.senderKeyDistributionMessage;
                if (isProtocolMsg) continue;

                const from = msg.key.remoteJid;

                // Statuslara və qruplara (sonu @g.us) cavab verməmək üçün yoxlama
                if (!from || from === 'status@broadcast' || from.endsWith('@g.us')) continue;

                // Yalnız şəxsi mesajlaşmalara (@s.whatsapp.net) cavab ver
                if (from.endsWith('@s.whatsapp.net')) {
                    
                    // (İstəyə bağlı) Mesajı "oxundu" kimi işarələ, bu WhatsApp-ın spama atma ehtimalını azaldır
                    await sock.readMessages([msg.key]);

                    // Şablon mesajı göndər
                    await sock.sendMessage(from, { text: SABLON_MESAJ });
                    console.log(`✅ Avtocavab göndərildi: ${from}`);
                }
            } catch (error) {
                console.error(`❌ Mesaj göndərilərkən xəta baş verdi:`, error);
            }
        }
    });
}

mongoose.connect(MONGO_URL).then(() => {
    console.log('MongoDB bağlandı');
    connectToWhatsApp();
}).catch(err => {
    console.error('MongoDB xətası', err);
    process.exit(1);
});
