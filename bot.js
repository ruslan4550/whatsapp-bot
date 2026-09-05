const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');

// MongoDB bağlantı URL-i (Render-də mühit dəyişəni kimi təyin ediləcək)
const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
    console.error('MONGO_URL mühit dəyişəni təyin olunmayıb!');
    process.exit(1);
}

// Sessiyanı saxlayacaq MongoDB model
const sessionSchema = new mongoose.Schema({
    id: String,
    data: Object
});
const Session = mongoose.model('Session', sessionSchema);

// Botu yaradırıq
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

// Avtomatik cavab mətni (istədiyiniz şablon)
const SABLON_MESAJ = `📩 Avtomatik Cavab

Status: 🟢 Avtocavab aktiv
Mətn:
💳 Depozit → müştəriyə avtomatik kart məlumatlarını göndərsin.
🔗 Avtodepozit → avtomatik depozit linkini göndərsin.
💸 Çıxarış → iki seçim açılsın:
Avtoçıxarış
Manuel çıxarış
🌐 Saytımız → birbaşa saytınıza yönləndirsin.`;

// QR kodu terminalda göstər
client.on('qr', (qr) => {
    console.log('Aşağıdakı QR kodu telefonunuzdakı WhatsApp ilə skan edin:');
    qrcode.generate(qr, { small: true });
});

// Bot hazır olduqda
client.on('ready', () => {
    console.log('Bot hazırdır və işləyir!');
});

// Mesaj gəldikdə avtomatik cavab
client.on('message', async (message) => {
    // Yalnız fərdi söhbətlərə cavab ver (qruplara yox)
    if (message.from.endsWith('@c.us')) {
        // 1 saniyə gecikmə (spam qorunması üçün)
        await new Promise(resolve => setTimeout(resolve, 1000));
        await message.reply(SABLON_MESAJ);
        console.log(`Cavab göndərildi: ${message.from}`);
    }
});

// MongoDB-yə qoşulub botu işə sal
mongoose.connect(MONGO_URL)
    .then(() => {
        console.log('MongoDB bağlandı');
        client.initialize();
    })
    .catch(err => {
        console.error('MongoDB bağlantı xətası:', err);
        process.exit(1);
    });