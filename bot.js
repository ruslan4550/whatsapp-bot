const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const mongoose = require('mongoose');
const http = require('http');

const MONGO_URL = 'mongodb+srv://jmrkort_db_user:5yQ45yNADSw8z2J0@cluster0.qvfzfcc.mongodb.net/?appName=Cluster0';

let currentQrDataUrl = null;

const server = http.createServer((req, res) => {
    if (req.url === '/qr' && currentQrDataUrl) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="text-align:center; background:#f0f0f0; padding:20px;"><h2>WhatsApp Bot QR Kodu</h2><img src="${currentQrDataUrl}" width="300" height="300"><p>Telefonunuzda WhatsApp-ı açın: Ayarlar → Bağlı cihazlar → Cihaz əlavə et. Sonra bu kodu skan edin.</p></body></html>`);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Bot işləyir. QR kodu görmək üçün /qr ünvanına keçin.');
    }
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`HTTP server port ${PORT}-da işləyir`));

const sessionSchema = new mongoose.Schema({ id: String, data: Object });
const Session = mongoose.model('Session', sessionSchema);

const client = new Client({
    authStrategy: new RemoteAuth({
        store: {
            async sessionExists({ session }) { return !!await Session.findOne({ id: session }); },
            async save({ session, sessionData }) {
                await Session.findOneAndUpdate(
                    { id: session },
                    { id: session, data: sessionData },
                    { upsert: true }
                );
            },
            async load({ session }) {
                const doc = await Session.findOne({ id: session });
                return doc ? doc.data : null;
            },
            async delete({ session }) { await Session.deleteOne({ id: session }); }
        },
        clientId: 'bot-client',
        backupSyncIntervalMs: 60000
    }),
    puppeteer: {
        headless: true,
        executablePath: '/opt/render/.cache/puppeteer/chrome/linux-146.0.7680.31/chrome-linux64/chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

const SABLON_MESAJ = `📩 Avtomatik Cavab

Status: 🟢 Avtocavab aktiv
Mətn:
💳 Depozit → müştəriyə avtomatik kart məlumatlarını göndərsin.
🔗 Avtodepozit → avtomatik depozit linkini göndərsin.
💸 Çıxarış → iki seçim açılsın:
Avtoçıxarış
Manuel çıxarış
🌐 Saytımız → birbaşa saytınıza yönləndirsin.`;

client.on('qr', async (qr) => {
    console.log('Aşağıdakı QR kodu WhatsApp ilə skan edin:');
    qrcodeTerminal.generate(qr, { small: true });

    currentQrDataUrl = await qrcode.toDataURL(qr);
    console.log('QR kodu brauzerdə görmək üçün: /qr ünvanına keçin');
});

client.on('ready', () => console.log('Bot hazırdır və işləyir!'));

client.on('message', async (message) => {
    if (message.from.endsWith('@c.us')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await message.reply(SABLON_MESAJ);
        console.log(`Cavab göndərildi: ${message.from}`);
    }
});

mongoose.connect(MONGO_URL)
    .then(() => {
        console.log('MongoDB bağlandı');
        client.initialize();
    })
    .catch(err => {
        console.error('MongoDB xətası:', err);
        process.exit(1);
    });