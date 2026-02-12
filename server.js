const express = require('express');
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING);

let client; 

async function startTelegram() {
    console.log("🔄 Connecting to Telegram...");
    client = new TelegramClient(stringSession, apiId, apiHash, { 
        connectionRetries: 5,
        useWSS: true, 
    });
    await client.start({ onError: (e) => console.log(e) });
    console.log("✅ SYSTEM LIVE: Pathshala V3 Ready");
    
    setInterval(async () => {
        if (!client.connected) try { await client.connect(); } catch(e) {}
    }, 20000);
}
startTelegram();

function getRealId(id) {
    id = parseInt(id);
    if (id <= 115) return id + 1;
    else return id + 43;
}

app.get('/api/video/:id', async (req, res) => {
    try {
        if (!client.connected) await client.connect();
        const msgId = getRealId(req.params.id);
        const msgs = await client.getMessages("jaikipathshalax", { ids: [msgId] });
        if (!msgs[0]?.media) return res.status(404).send("Not Found");

        const media = msgs[0].media;
        const fileSize = Number(media.document.size);
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": (end - start) + 1,
                "Content-Type": "video/mp4",
            });
            const stream = client.iterDownload(media, { offset: BigInt(start), limit: (end - start) + 1 });
            for await (const d of stream) res.write(d);
            res.end();
        } else {
            res.writeHead(200, { "Content-Length": fileSize, "Content-Type": "video/mp4" });
            await client.downloadMedia(media, { outputFile: res });
        }
    } catch (e) { res.end(); }
});

app.get('/api/meta/:id', async (req, res) => {
    try {
        if (!client.connected) await client.connect();
        const msgId = getRealId(req.params.id);
        const msgs = await client.getMessages("jaikipathshalax", { ids: [msgId] });
        res.json({ text: msgs[0]?.message || "No Details" });
    } catch (e) { res.json({ text: "Loading..." }); }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// IMPORTANT: Render Port Fix
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is listening on port ${PORT}`);
});

