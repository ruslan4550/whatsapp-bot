const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const http = require('http');
const pino = require('pino');

let currentQrDataUrl = null;

const SABLON_MESAJ = `📩 Avtomatik Cavab

Status: 🟢 Avtocavab aktiv
Mətn:
💳 Depozit → müştəriyə avtomatik kart məlumatlarını göndərsin.
🔗 Avtodepozit → avtomatik depozit linkini göndərsin.
💸 Çıxarış → iki seçim açılsın:
Avtoçıxarış
Manuel çıxarış
🌐 Saytımız → birbaşa saytınıza yönləndirsin.`;

// HTTP Server - QR kodu brauzerdə göstərmək üçün
const server = http.createServer((req, res) => {
    if (req.url === '/qr' && currentQrDataUrl) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="text-align:center; padding:20px; font-family: sans-serif;"><h2>WhatsApp QR Kodu</h2><img src="${currentQrDataUrl}" width="300" height="300"><p>WhatsApp-da: Ayarlar → Bağlı cihazlar → Cihaz əlavə et</p></body></html>`);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bot hazırda işləyir. Əgər QR kodu yoxdursa, bot artıq WhatsApp-a qoşuludur.');
    }
});
server.listen(process.env.PORT || 10000, () => console.log('HTTP server işləyir. Port:', process.env.PORT || 10000));

// ANTI-CRASH (Çökmələrin qarşısını alan qoruma)
process.on('uncaughtException', (err) => console.error('Gözlənilməz xəta (Uncaught Exception):', err));
process.on('unhandledRejection', (reason, promise) => console.error('İşlənməmiş rədd edilmə (Unhandled Rejection):', reason));

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // Lazımsız loqları tam gizlədir
        auth: state,
        // 1. DÜZƏLİŞ: Botu rəsmi Masaüstü / Web WhatsApp kimi göstərir
        browser: Browsers.macOS('Desktop'),
        markOnlineOnConnect: true,
        syncFullHistory: false
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
                console.log('Bağlantı kəsildi, 5 saniyəyə avtomatik yenidən qoşulur...');
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('Sessiya bağlandı. Yenidən başlatmaq üçün "auth_info_baileys" qovluğunu silin.');
            }
        } else if (connection === 'open') {
            console.log('✅ Bot hazırdır və WhatsApp-a uğurla qoşuldu!');
            currentQrDataUrl = null;
            await sock.sendPresenceUpdate('available'); 
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                if (!msg.message || msg.key.fromMe) continue;

                const from = msg.key.remoteJid;
                
                // Qrupları və lazımsız ünvanları blokla
                if (!from || from === 'status@broadcast' || from.endsWith('@g.us')) continue;

                if (from.endsWith('@s.whatsapp.net')) {
                    // Sistem/protokol mesajlarını kənarlaşdırırıq ki, boş xətalar yaranmasın
                    const messageType = Object.keys(msg.message)[0];
                    if (messageType === 'protocolMessage' || messageType === 'senderKeyDistributionMessage') continue;

                    console.log(`📩 Yeni mesaj gəldi: ${from}`);

                    // Mavi tık xəta verərsə ana prosesi dayandırmaması üçün catch əlavə edildi
                    await sock.readMessages([msg.key]).catch(() => {});
                    
                    // "Yazır..." effekti
                    await sock.sendPresenceUpdate('composing', from).catch(() => {});
                    await new Promise(resolve => setTimeout(resolve, 1500));

                    // 3. DÜZƏLİŞ: Şablon mesajın dəqiqliklə göndərilməsi
                    await sock.sendMessage(from, { text: SABLON_MESAJ });
                    
                    // Göndərdikdən sonra yenidən onlayn ol
                    await sock.sendPresenceUpdate('available', from).catch(() => {});

                    console.log(`✅ Avtocavab uğurla göndərildi: ${from}`);
                }
            } catch (error) {
                console.error(`❌ Mesaj emal edilərkən xəta yarandı, lakin bot işləməyə davam edir:`, error);
            }
        }
    });
    
    // 2. DÜZƏLİŞ: Botun daimi Onlayn görünməsi üçün hər 5 dəqiqədən bir status yenilənir
    setInterval(async () => {
        try {
            if (sock && sock.user) {
                await sock.sendPresenceUpdate('available');
            }
        } catch (err) {
            // Səssizcə keç, botu dayandırma
        }
    }, 300000); // 300000ms = 5 dəqiqə
}

connectToWhatsApp();
