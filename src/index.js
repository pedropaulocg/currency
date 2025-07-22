import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { users, User } from './User.js';
import { steps, handleChatBot } from './handleEnteresChatBot.js';
import cron from 'node-cron';
import mongoose from 'mongoose';
import UserWatcher from './UserWatcher.js';
import { getCoinPrice } from './getCoinPrice.js';
import { handleSendMessage } from './handleSendMessage.js';
import dotenv from 'dotenv';
dotenv.config();


let sock

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if(shouldReconnect) {
                connectToWhatsApp();
            }
        } else if(connection === 'open') {
            console.log('opened connection');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        if(m.messages[0].key.fromMe) return
        const messageObject = m.messages[0]
        const user = users.find(user => user.id === messageObject.key.remoteJid)
        messageObject.body = messageObject.message.conversation
        if(user) {
            const response = await handleChatBot(messageObject, user)
            await sock.sendMessage(messageObject.key.remoteJid, response)
            return
        } else {
          const newUser = new User(messageObject.key.remoteJid, messageObject.pushName, messageObject.key.remoteJid.split('@')[0], undefined)
          users.push(newUser);
          const response = await handleChatBot(messageObject, newUser)
          await sock.sendMessage(messageObject.key.remoteJid, response)
          return
        }
    });
}


const connectToMongoDB = async () => {
    try {
        await mongoose.connect(`mongodb+srv://admin:${process.env.db_pass}@currencybot.5gxfok0.mongodb.net/?retryWrites=true&w=majority&appName=CurrencyBot`);
        console.log('✅ Connected to MongoDB');
    } catch (e) {
        console.log('Error connecting to MongoDB', e);
    }
}

const TIMES = '0 8,13,18 * * *';
const TZ = 'America/Fortaleza';
let greeting = 1
export const sendMessageAtTime = () => {
  console.log('Cronjob agendado para 08h, 12h e 18h ⏱️');

  cron.schedule(TIMES, async () => {
    try {
      const watchers = await UserWatcher.find({}).lean();
      if (!watchers.length) return;

      const watchersByCoin = watchers.reduce((acc, w) => {
        (acc[w.coin] ||= []).push(w);
        return acc;
      }, {});

      const coins = Object.keys(watchersByCoin);
      const entries = await Promise.all(
        coins.map(async (coin) => {
          const resp = await getCoinPrice(coin);
          return [coin, resp.text];
        })
      );
      const priceMap = Object.fromEntries(entries);
      await Promise.all(
          coins.map(async (coin) => {
              const price = priceMap[coin];
              const list = watchersByCoin[coin];
              await Promise.all(
                list.map((w) => {
                  console.log(w)
                  handleSendMessage(w, price, greeting)
                })
          );
        })
      );
      console.log(`Mensagens enviadas para ${watchers.length} watcher(s).`);
      greeting = greeting == 2 ? 0 : greeting + 1
    } catch (err) {
      console.error('Erro no cron de preços:', err);
    }
  }, { timezone: TZ });
};

connectToWhatsApp();
connectToMongoDB();
sendMessageAtTime();

export {
  sock
}