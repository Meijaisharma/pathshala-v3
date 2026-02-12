const express = require('express');
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

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
    
    // Keep-Alive (Heartbeat)
    setInterval(async () => {
        if (!client.connected) try { await client.connect(); } catch(e) {}
    }, 20000);
}
startTelegram();

// --- NEW LOGIC: ID MAPPING ---
function getRealId(id) {
    id = parseInt(id);
    
    // 1 se 115 tak -> (+1)
    if (id <= 115) {
        return id + 1;
    } 
    // 116 se aage -> (+43) yani 116 banega 159
    else {
        return id + 43;
    }
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

        // Console me dikhega kaunsa video chal raha hai
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

            // Native Stream with Force DC
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

// 2. DETAILS API (Video Caption/Name)
app.get('/api/meta/:id', async (req, res) => {
    try {
        if (!client.connected) await client.connect();
        const msgId = getRealId(req.params.id);
        const msgs = await client.getMessages("jaikipathshalax", { ids: [msgId] });
        
        // Caption ya text bhejega
        const caption = msgs[0]?.message || "No Details Available";
        res.json({ text: caption });
        
    } catch (e) { 
        res.json({ text: "Loading..." }); 
    }
});

// 3. PDF API (Isme bhi logic lagana hai to bata dena, abhi direct ID hai)
app.get('/api/pdf/:id', async (req, res) => {
    try {
        if (!client.connected) await client.connect();
        const msgId = parseInt(req.params.id); 
        const msgs = await client.getMessages("jaikipathshalax", { ids: [msgId] });
        const media = msgs[0]?.media;
        
        if(!media) return res.status(404).send("Not Found");
        
        res.setHeader('Content-Type', 'application/pdf');
        await client.downloadMedia(media, { outputFile: res, workers: 1, dcId: media.document.dcId });
    } catch (e) { res.status(500).send("Error"); }
});

app.get('/', (req, res) => res.send("Pathshala V3 Server Running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Run on ${PORT}`));

