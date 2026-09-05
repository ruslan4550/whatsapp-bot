const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const http = require('http');
const pino = require('pino');

let currentQrDataUrl = null;

const SABLON_MESAJ = `📩 *Avtomatik Cavab*

Status: 🟢 Avtocavab aktiv
Zəhmət olmasa, aşağıdakı seçimlərdən birinin üzərinə klikləyin:

💳 *Kartdan Depozit*
👉 https://wa.me/17423849807?text=Kartdan%20depozit%20mini%2010%20AZN

🔗 *Avtodepozit*
👉 http://www.yevrokassa.com/paystribe3d.com

💸 *Çıxarış*
👉 https://wa.me/31684598734?text=Çıxarış%20etmək%20istəyirəm

🌐 *Saytımız*
👉 https://sizin-saytiniz.com`;

const server = http.createServer((req, res) => {
    if (req.url === '/qr' && currentQrDataUrl) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="text-align:center; padding:20px; font-family: sans-serif;"><h2>WhatsApp QR Kodu</h2><img src="${currentQrDataUrl}" width="300" height="300"><p>WhatsApp-da: Ayarlar → Bağlı cihazlar → Cihaz əlavə et</p></body></html>`);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bot aktivdir.');
    }
});
server.listen(process.env.PORT || 10000, () => console.log('Server işləyir. Port:', process.env.PORT || 10000));

process.on('uncaughtException', (err) => console.log('Xəta:', err.message));
process.on('unhandledRejection', (reason) => console.log('Rədd edilmə:', reason));

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), 
        auth: state,
        browser: Browsers.macOS('Desktop'),
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreviews: false // Linkin şəklini yükləməyə çalışıb donmasının qarşısını alır
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) currentQrDataUrl = await qrcode.toDataURL(qr);
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Bağlantı kəsildi, 5 saniyəyə qoşulur...');
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot hazırdır və WhatsApp-a bağlandı!');
            currentQrDataUrl = null;
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        
        const msg = m.messages[0];
        // Əgər mesaj yoxdursa və ya bot özü yazıbsa dayandır
        if (!msg || !msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        // Qrupları və statusları blokla
        if (!from || from.includes('@g.us') || from === 'status@broadcast') return;

        console.log(`📩 Yeni mesaj: ${from}`);

        try {
            // HES BIR EFFEKT ("Yazır...", "Oxundu") VERMƏDƏN BİRBAŞA MESAJI GÖNDƏRİRİK
            await sock.sendMessage(from, { text: SABLON_MESAJ });
            console.log(`✅ Cavab mesajı uğurla göndərildi!`);
        } catch (err) {
            console.log(`❌ Mesaj göndərilərkən xəta:`, err.message);
        }
    });
    
    // Botun xətdən düşməməsi üçün daimi onlayn tutucu
    setInterval(async () => {
        try {
            if (sock && sock.user) await sock.sendPresenceUpdate('available');
        } catch (err) {}
    }, 60000); // Hər 1 dəqiqədən bir onlayn olduğunu təsdiqləyir
}

connectToWhatsApp();
