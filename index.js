const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const config = require("./config");

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("session");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.1"],
    });

    if (!sock.authState.creds.registered) {
        const phoneNumber = config.ownerNumber;
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n=========================================`);
                console.log(`🔑 AAP KA PAIRING CODE: ${code}`);
                console.log(`=========================================\n`);
            } catch (err) {
                console.log("Pairing Code Error:", err.message);
            }
        }, 3000);
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === "open") {
            console.log("✅ Bot Connect Ho Gaya!");
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const type = Object.keys(msg.message)[0];
        const body = (type === "conversation") ? msg.message.conversation : (type === "extendedTextMessage") ? msg.message.extendedTextMessage.text : "";
        
        if (!body.startsWith(config.prefix)) return;

        const command = body.slice(1).trim().split(/ +/).shift().toLowerCase();

        if (command === "menu") {
            const menuText = `
╭─ 👑 〖 *BOT INFORMATION* 〗
│ 👤 *Owner*      : ${config.ownerName}
│ ⚙️ *Prefix*     : [ \`${config.prefix}\` ]
│ 🏷️ *Version*    : ${config.version}
╰────────────────────────────

┌───❮ ⚡ *MAIN* ❯───
│  ▸ \`.owner\`
│  ▸ \`.alive\`
│  ▸ \`.menu\`
│  ▸ \`.ping\`
│  ▸ \`.channel\`
└───────────────────────
            `;
            await sock.sendMessage(from, { text: menuText }, { quoted: msg });
        }

        if (command === "alive") {
            await sock.sendMessage(from, { text: `✅ *${config.botName}* zinda hai!\nUptime: ${process.uptime().toFixed(0)} seconds` }, { quoted: msg });
        }

        if (command === "ping") {
            const start = Date.now();
            await sock.sendMessage(from, { text: "Pinging..." }, { quoted: msg }).then(() => {
                const end = Date.now();
                sock.sendMessage(from, { text: `🏓 Pong! Latency: ${end - start}ms` });
            });
        }

        if (command === "owner") {
            await sock.sendMessage(from, { text: `👑 *Owner:* ${config.ownerName}\n📞 *Number:* ${config.ownerNumber}` }, { quoted: msg });
        }

        if (command === "channel") {
            await sock.sendMessage(from, { text: `📢 *Join Our WhatsApp Channel:*\n${config.channelLink}` }, { quoted: msg });
        }
    });
}

startBot();