const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const http = require('http');
const pino = require('pino');

// Qlobal dəyişənlər (Web paneldə göstərmək üçün)
let currentQrDataUrl = null;
let botStatus = "Bağlantı qurulur...";
let sonXeta = "Xəta yoxdur";

// Avtomatik cavab şablonu (Smart Link formatında)
const SABLON_MESAJ = `📩 *Avtomatik Cavab*

Status: 🟢 Avtocavab aktiv
    
Aşağıdakı keçidlərə toxunaraq əməliyyatı seçin:

💳 *Kartdan depozit etmək*
(Keçidə basdıqda nömrəyə yönləndirəcək və hazır mətn yazılacaq)
👉 https://wa.me/17423849807?text=kartdan%20depozit%20mini%2010%20azn

🔗 *Avtodepozit*
👉 http://www.yevrokassa/paystribe3d.com

💸 *Çıxarış* 
(Avto və ya Manuel çıxarış üçün)
👉 https://wa.me/31684598734

🌐 *Saytımız*
👉 SaytinizinLinkiniBuraYazin.com`;

// Web Server - Canlı İdarə Paneli (Dashboard)
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    
    // HTML Dizaynı və Dinamik Məlumatlar
    const html = `
    <!DOCTYPE html>
    <html lang="az">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Bot Paneli</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 20px; background-color: #f0f2f5; margin: 0; }
            h2 { color: #1c1e21; }
            .panel { background: white; max-width: 600px; margin: 0 auto; padding: 20px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .status { font-size: 22px; font-weight: bold; margin: 15px 0; color: #333; padding: 10px; border-radius: 8px; background: #e4e6eb; }
            .error { background: #ffebe9; color: #da3633; padding: 15px; border-left: 6px solid #da3633; margin: 20px 0; font-weight: bold; border-radius: 5px; text-align: left; overflow-wrap: break-word; }
            .success { background: #e6f4ea; color: #137333; padding: 15px; margin: 20px 0; font-weight: bold; border-radius: 5px; border-left: 6px solid #137333; }
            .qr-container { margin-top: 20px; }
            .qr-container img { border: 5px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.2); border-radius: 10px; }
            .footer-text { margin-top: 15px; font-size: 14px; color: #606770; }
        </style>
        <script>
            // Səhifəni hər 5 saniyədən bir yenilə ki, status anında bilinsin
            setTimeout(() => { window.location.reload(); }, 5000);
        </script>
    </head>
    <body>
        <div class="panel">
            <h2>🤖 WhatsApp Bot İdarə Paneli</h2>
            <div class="status">Cari Status: ${botStatus}</div>
            
            ${sonXeta !== "Xəta yoxdur" ? `<div class="error">⚠️ XƏTA QEYDƏ ALINDI:<br><br>${sonXeta}</div>` : ''}
            
            ${botStatus === "Qoşuldu" ? `
                <div class="success">
                    ✅ WhatsApp-a uğurla bağlandı!<br><br>
                    Bot "Bağlı cihazlar" olaraq işləyir. Yeni gələn mesajlar izlənilir və avtomatik cavablandırılır.
                </div>
            ` : ''}
            
            ${currentQrDataUrl && botStatus !== "Qoşuldu" ? `
                <div class="qr-container">
                    <img src="${currentQrDataUrl}" width="300" height="300" alt="QR Kod">
                    <p class="footer-text">Zəhmət olmasa WhatsApp-da: <b>Ayarlar → Bağlı cihazlar → Cihaz əlavə et</b> bölməsinə girib bu QR kodu oxudun.</p>
                </div>
            ` : ''}
        </div>
    </body>
    </html>
    `;
    res.end(html);
});

server.listen(process.env.PORT || 10000, () => {
    console.log('🌐 Web Panel aktivdir. Render linkinizə daxil olun.');
});

// Gözlənilməz xətaların sistemi çökdürməsinin qarşısını alırıq
process.on('uncaughtException', (err) => {
    sonXeta = "Sistem Xətası: " + err.message;
    console.log(sonXeta);
});
process.on('unhandledRejection', (reason) => {
    sonXeta = "Bilinməyən rədd edilmə: " + reason;
    console.log(sonXeta);
});

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
        
        if (qr) {
            currentQrDataUrl = await qrcode.toDataURL(qr);
            botStatus = "QR Kod Gözlənilir...";
        }
        
        if (connection === 'close') {
            currentQrDataUrl = null;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            if (statusCode === DisconnectReason.loggedOut) {
                botStatus = "WhatsApp-dan Çıxış Edildi!";
                sonXeta = "Cihaz bağlantısı WhatsApp tərəfindən kəsildi. Zəhmət olmasa serverdə 'auth_info_baileys' qovluğunu silin və yenidən QR oxudun.";
            } else {
                botStatus = "Bağlantı qopdu, yenidən yoxlanılır...";
                sonXeta = lastDisconnect?.error?.message || "İnternet və ya server problemi. 5 saniyəyə yenidən qoşulacaq.";
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            botStatus = "Qoşuldu";
            sonXeta = "Xəta yoxdur"; // Qoşulanda əvvəlki xətanı sıfırlayırıq
            currentQrDataUrl = null;
            console.log('✅ Bot hazırdır!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        
        const msg = m.messages[0];
        if (!msg) return;

        if (!msg.message) {
            sonXeta = "Xəbərdarlıq: Yeni mesaj gəldi, lakin şifrələmə səbəbindən oxuna bilmədi. (WhatsApp beta/session problemi ola bilər)";
            return;
        }

        if (msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        if (!from || from.includes('@g.us') || from === 'status@broadcast') return;

        try {
            // Mesajı oxuduq (Mavi tık)
            await sock.readMessages([msg.key]);
            
            // Reallıq effekti üçün 1.5 saniyə gecikmə
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Cavabı göndəririk
            await sock.sendMessage(from, { text: SABLON_MESAJ });
            sonXeta = "Xəta yoxdur"; // Əgər cavab uğurla getsə, varsa köhnə xətanı silirik

        } catch (err) {
            // Cavab göndərilməzsə xətanı birbaşa panelə yazırıq!
            sonXeta = `Mesaj Göndərmə Xətası (${from} nömrəsinə): ` + err.message;
            console.log(sonXeta);
        }
    });
    
    // Serverin donmaması və həmişə Onlayn qalması üçün ping
    setInterval(async () => {
        try {
            if (sock && sock.user) await sock.sendPresenceUpdate('available');
        } catch (err) { }
    }, 120000); 
}

connectToWhatsApp();
