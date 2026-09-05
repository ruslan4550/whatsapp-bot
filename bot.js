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

// HTTP Server
const server = http.createServer((req, res) => {
    if (req.url === '/qr' && currentQrDataUrl) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="text-align:center; padding:20px; font-family: sans-serif;"><h2>WhatsApp QR Kodu</h2><img src="${currentQrDataUrl}" width="300" height="300"><p>WhatsApp-da: Ayarlar → Bağlı cihazlar → Cihaz əlavə et</p></body></html>`);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bot hazırda aktivdir və işləyir.');
    }
});
server.listen(process.env.PORT || 10000, () => console.log('HTTP server işləyir. Port:', process.env.PORT || 10000));

// ANTI-CRASH (Proqramın çökməsinin qarşısını alır)
process.on('uncaughtException', (err) => console.log('Sistem xətası tutuldu, bot dayanmır:', err.message));
process.on('unhandledRejection', (reason) => console.log('Gözlənilməz rədd edilmə tutuldu:', reason));

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
        generateHighQualityLinkPreviews: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) currentQrDataUrl = await qrcode.toDataURL(qr);
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Bağlantı kəsildi, 5 saniyəyə avtomatik yenidən qoşulur...');
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('WhatsApp-dan çıxış edilib. "auth_info_baileys" qovluğunu silin və yenidən başladın.');
            }
        } else if (connection === 'open') {
            console.log('✅ Bot hazırdır və WhatsApp-a uğurla qoşuldu!');
            currentQrDataUrl = null;
            await sock.sendPresenceUpdate('available').catch(() => {});
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        // Yalnız yeni gələn mesajlara cavab ver
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                // Mesaj yoxdursa və ya bot özü göndəribsə keç
                if (!msg.message || msg.key.fromMe) continue;

                const from = msg.key.remoteJid;
                
                // Qrupları (@g.us) və WhatsApp statuslarını (status@broadcast) blokla
                if (!from || from === 'status@broadcast' || from.endsWith('@g.us')) continue;

                // Yalnız şəxsi profillərə cavab ver
                if (from.endsWith('@s.whatsapp.net')) {
                    
                    // Protokol (sistem) mesajlarını və ya reaksiyaları yoxlayıb rədd et
                    if (msg.message.protocolMessage || msg.message.senderKeyDistributionMessage || msg.message.reactionMessage) continue;

                    console.log(`📩 Yeni mesaj gəldi: ${from}`);

                    // 1. Oxundu olaraq işarələ (Xəta versə belə keçəcək)
                    try {
                        await sock.readMessages([msg.key]);
                    } catch (e) {
                        console.log('Mavi tık atılarkən kiçik problem oldu, amma bot davam edir.');
                    }
                    
                    // 2. "Yazır..." effekti ver (Xəta versə belə keçəcək)
                    try {
                        await sock.sendPresenceUpdate('composing', from);
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    } catch (e) {
                        console.log('Yazır effekti verilərkən problem oldu, amma bot davam edir.');
                    }

                    // 3. ƏSAS MƏSƏLƏ: Mesajı göndər!
                    try {
                        await sock.sendMessage(from, { text: SABLON_MESAJ });
                        console.log(`✅ Avtocavab göndərildi: ${from}`);
                    } catch (e) {
                        console.log(`❌ Mesaj göndərilə bilmədi:`, e);
                    }
                    
                    // 4. Proses bitdikdən sonra "Onlayn" vəziyyətinə qayıt
                    try {
                        await sock.sendPresenceUpdate('available', from);
                    } catch (e) {}
                }
            } catch (error) {
                console.error(`❌ Ümumi mesaj xətası:`, error.message);
            }
        }
    });
    
    // Botun onlayn düşməməsi üçün hər 3 dəqiqədən bir özünü yeniləyir
    setInterval(async () => {
        try {
            if (sock && sock.user) {
                await sock.sendPresenceUpdate('available');
            }
        } catch (err) {}
    }, 180000); 
}

connectToWhatsApp();
