const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const http = require('http');
const pino = require('pino');

let currentQrDataUrl = null;

// Xətasız Smart Link formatında yeni Şablon Mesaj
const SABLON_MESAJ = `📩 *Avtomatik Cavab*

Status: 🟢 Avtocavab aktiv
    
Aşağıdakı keçidlərə (düymələrə) toxunaraq əməliyyatı seçin:

💳 *Kartdan depozit etmək*
(Keçidə basdıqda nömrəyə yönləndirəcək və hazır mətn yazılacaq)
👉 https://wa.me/17423849807?text=kartdan%20depozit%20mini%2010%20azn

🔗 *Avtodepozit*
👉 http://www.yevrokassa/paystribe3d.com

💸 *Çıxarış* 
(Avto və ya Manuel çıxarış üçün nömrəyə yönləndirir)
👉 https://wa.me/31684598734

🌐 *Saytımız*
👉 SaytinizinLinkiniBuraYazin.com`;

const server = http.createServer((req, res) => {
    if (req.url === '/qr' && currentQrDataUrl) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="text-align:center; padding:20px; font-family: sans-serif;"><h2>WhatsApp QR Kodu</h2><img src="${currentQrDataUrl}" width="300" height="300"><p>WhatsApp-da: Ayarlar → Bağlı cihazlar → Cihaz əlavə et</p></body></html>`);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bot hazirda isleyir.');
    }
});
server.listen(process.env.PORT || 10000, () => console.log('HTTP server işləyir. Port:', process.env.PORT || 10000));

process.on('uncaughtException', (err) => console.log('Sistem xətası (çökmənin qarşısı alındı):', err.message));
process.on('unhandledRejection', (reason) => console.log('Gözlənilməz rədd edilmə:', reason));

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), 
        auth: state,
        browser: Browsers.macOS('Desktop'),
        markOnlineOnConnect: true,
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) currentQrDataUrl = await qrcode.toDataURL(qr);
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Bağlantı kəsildi, 5 saniyəyə yenidən qoşulur...');
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('WhatsApp çıxış etdi. "auth_info_baileys" qovluğunu silin.');
            }
        } else if (connection === 'open') {
            console.log('✅ Bot hazırdır və WhatsApp-a bağlandı!');
            currentQrDataUrl = null;
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        
        const msg = m.messages[0];
        if (!msg) return;

        if (!msg.message) {
            console.log("⚠️ DİQQƏT: Mesaj gəldi, amma bot onu oxuya bilmir (Şifrələmə xətası).");
            return;
        }

        if (msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        
        if (!from || from.includes('@g.us') || from === 'status@broadcast') return;

        console.log(`📩 Yeni mesaj qəbul edildi: ${from}`);

        try {
            await sock.readMessages([msg.key]);
            console.log(`👁️ Mesaj oxundu olaraq işarələndi!`);
            
            await new Promise(resolve => setTimeout(resolve, 1000));

            await sock.sendMessage(from, { text: SABLON_MESAJ });
            console.log(`✅ Cavab mesajı uğurla göndərildi!`);

        } catch (err) {
            console.log(`❌ Əməliyyat xətası:`, err.message);
        }
    });
    
    setInterval(async () => {
        try {
            if (sock && sock.user) await sock.sendPresenceUpdate('available');
        } catch (err) {}
    }, 180000); 
}

connectToWhatsApp();
