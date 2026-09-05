const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } = require('@whiskeysockets/baileys');
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

const server = http.createServer((req, res) => {
    if (req.url === '/qr' && currentQrDataUrl) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="text-align:center; padding:20px;"><h2>WhatsApp QR Kodu</h2><img src="${currentQrDataUrl}" width="300" height="300"><p>WhatsApp-da: Ayarlar → Bağlı cihazlar → Cihaz əlavə et</p></body></html>`);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bot işləyir. QR üçün /qr ünvanına keçin.');
    }
});
server.listen(process.env.PORT || 10000, () => console.log('HTTP server işləyir. Port:', process.env.PORT || 10000));

async function connectToWhatsApp() {
    // Yeni auth sistemi (Mütləq əvvəlki auth_info_baileys qovluğunu silin)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // Lazımsız loqları gizlədir
        auth: state,
        browser: ['BotClient', 'Chrome', '20.0.0'], // Cihaz adı
        markOnlineOnConnect: true, // Qoşulanda onlayn kimi işarələ
        syncFullHistory: false // Donmaması üçün keçmiş mesajları yükləməyi dayandırır
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
            
            // Botun daimi olaraq "Onlayn" (Çevrimiçi) görünməsini təmin edir
            await sock.sendPresenceUpdate('available'); 
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return; // Yalnız yeni mesajlara reaksiya ver

        for (const msg of messages) {
            try {
                if (!msg.message || msg.key.fromMe) continue;

                // Təhlükəsizlik şifrələmə mesajlarını (sistem mesajlarını) blokla
                const isProtocol = msg.message.protocolMessage || msg.message.senderKeyDistributionMessage;
                if (isProtocol) continue;

                const from = msg.key.remoteJid;
                
                // Qruplar, statuslar və yararsız ünvanları blokla
                if (!from || from === 'status@broadcast' || from.endsWith('@g.us')) continue;

                // Yalnız şəxsi istifadəçilər
                if (from.endsWith('@s.whatsapp.net')) {
                    console.log(`📩 Yeni mesaj gəldi: ${from}`);

                    // 1. TƏK XƏTT PROBLEMİNİ HƏLL EDİR: Mesajı oxundu (mavi tık / qoşa xətt) edir
                    await sock.readMessages([msg.key]);
                    
                    // 2. Realist davranış: "Yazır..." effekti göstərir
                    await sock.sendPresenceUpdate('composing', from);
                    
                    // (İstəyə bağlı) Çox sürətli cavab verməmək üçün 1.5 saniyə gözləyir
                    await new Promise(resolve => setTimeout(resolve, 1500));

                    // 3. Şablon mesajı göndərir
                    await sock.sendMessage(from, { text: SABLON_MESAJ });
                    
                    // 4. Göndərdikdən sonra təkrar "Onlayn" vəziyyətinə qayıdır
                    await sock.sendPresenceUpdate('available', from);

                    console.log(`✅ Avtocavab uğurla göndərildi: ${from}`);
                }
            } catch (error) {
                console.error(`❌ Mesaj emal edilərkən xəta:`, error);
            }
        }
    });
}

connectToWhatsApp();
