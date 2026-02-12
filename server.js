const express = require('express');
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const path = require('path'); // Added for frontend mapping
const cors = require('cors');

const app = express();
app.use(cors());

// Is line se server 'public' folder ki index.html file ko pehchanega
app.use(express.static(path.join(__dirname, 'public')));

// Credentials
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
    console.log("✅ SYSTEM LIVE: New Logic & Details Ready");
    
    // Heartbeat to keep connection alive
    setInterval(async () => {
        if (!client.connected) try { await client.connect(); } catch(e) {}
    }, 20000);
}
startTelegram();

// --- NEW LOGIC: ID MAPPING (116 -> 159) ---
function getRealId(id) {
    id = parseInt(id);
    if (id <= 115) return id + 1;
    else return id + 43;
}

// 1. VIDEO API (Stream)
app.get('/api/video/:id', async (req, res) => {
    try {
        if (!client.connected) await client.connect();
        const msgId = getRealId(req.params.id);
        
        const msgs = await client.getMessages("jaikipathshalax", { ids: [msgId] });
        const media = msgs[0]?.media;

        if (!media || !media.document) return res.status(404).send("Video Not Found");

        const doc = media.document;
        const fileSize = Number(doc.size);
        const range = req.headers.range;

        console.log(`Request: ${req.params.id} -> Playing MsgID: ${msgId}`);

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunk = (end - start) + 1;

            res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunk,
                "Content-Type": "video/mp4",
            });

            const stream = client.iterDownload(media, { 
                offset: start, 
                limit: chunk,
                chunkSize: 512 * 1024, 
                workers: 1,
                dcId: doc.dcId, 
                fileSize: fileSize
            });
            for await (const d of stream) res.write(d);
            res.end();
        } else {
            res.writeHead(200, { "Content-Length": fileSize, "Content-Type": "video/mp4" });
            await client.downloadMedia(media, { outputFile: res, workers: 1, dcId: doc.dcId });
        }
    } catch (e) {
        if (!res.headersSent) res.end();
    }
});

// 2. META API (Details from Telegram Caption)
app.get('/api/meta/:id', async (req, res) => {
    try {
        if (!client.connected) await client.connect();
        const msgId = getRealId(req.params.id);
        const msgs = await client.getMessages("jaikipathshalax", { ids: [msgId] });
        res.json({ text: msgs[0]?.message || "No Details Available" });
    } catch (e) { res.json({ text: "Loading..." }); }
});

// 3. PDF API
app.get('/api/pdf/:id', async (req, res) => {
    try {
        if (!client.connected) await client.connect();
        const msgs = await client.getMessages("jaikipathshalax", { ids: [parseInt(req.params.id)] });
        const media = msgs[0]?.media;
        if(!media) return res.status(404).send("PDF Not Found");
        
        res.setHeader('Content-Type', 'application/pdf');
        await client.downloadMedia(media, { outputFile: res, workers: 1, dcId: media.document.dcId });
    } catch (e) { res.status(500).send("Error downloading PDF"); }
});

// Main Route - Isse 'index.html' dikhegi render link par
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

