const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const http = require('http');

const MONGO_URL = 'mongodb+srv://jmrkort_db_user:5yQ45yNADSw8z2J0@cluster0.qvfzfcc.mongodb.net/?appName=Cluster0';

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot işləyir');
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
        clientId: 'bot-client'
    }),
    puppeteer: {
        headless: true,
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

client.on('qr', (qr) => {
    console.log('Aşağıdakı QR kodu WhatsApp ilə skan edin:');
    qrcode.generate(qr, { small: true });
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