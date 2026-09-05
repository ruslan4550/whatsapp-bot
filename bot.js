const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const http = require('http');

// MongoDB bağlantı URL-i (Render-də mühit dəyişəni kimi təyin ediləcək)
const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
    console.error('MONGO_URL mühit dəyişəni təyin olunmayıb!');
    process.exit(1);
}

// ─── Sadə HTTP server (Render-in sağlamlıq yoxlaması üçün) ───
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot işləyir');
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`HTTP server port ${PORT}-da dinlənilir`));

// ─── Sessiyanı saxlayacaq MongoDB model ───
const sessionSchema = new mongoose.Schema({
    id: String,
    data: Object
});
const Session = mongoose.model('Session', sessionSchema);

// ─── WhatsApp botu ───
const client = new Client({
    authStrategy: new RemoteAuth({
        store: {
            async sessionExists({ session }) {
                return !!await Session.findOne({ id: session });
            },
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
            async delete({ session }) {
                await Session.deleteOne({ id: session });
            }
        },
        clientId: 'bot-client'
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

// ─── Avtomatik cavab mətni ───
const SABLON_MESAJ = `📩 Avtomatik Cavab

Status: 🟢 Avtocavab aktiv
Mətn:
💳 Depozit → müştəriyə avtomatik kart məlumatlarını göndərsin.
🔗 Avtodepozit → avtomatik depozit linkini göndərsin.
💸 Çıxarış → iki seçim açılsın:
Avtoçıxarış
Manuel çıxarış
🌐 Saytımız → birbaşa saytınıza yönləndirsin.`;

// ─── QR kod ───
client.on('qr', (qr) => {
    console.log('Aşağıdakı QR kodu telefonunuzdakı WhatsApp ilə skan edin:');
    qrcode.generate(qr, { small: true });
});

// ─── Bot hazır olduqda ───
client.on('ready', () => {
    console.log('Bot hazırdır və işləyir!');
});

// ─── Mesaj gəldikdə avtomatik cavab ───
client.on('message', async (message) => {
    if (message.from.endsWith('@c.us')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await message.reply(SABLON_MESAJ);
        console.log(`Cavab göndərildi: ${message.from}`);
    }
});

// ─── MongoDB-yə qoşulub botu işə sal ───
mongoose.connect(MONGO_URL)
    .then(() => {
        console.log('MongoDB bağlandı');
        client.initialize();
    })
    .catch(err => {
        console.error('MongoDB bağlantı xətası:', err);
        process.exit(1);
    });