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

const userActivity = new Map();
const INACTIVITY_TIMEOUT = 2 * 60 * 1000;

const updateUserActivity = (userId) => {
  userActivity.set(userId, Date.now());
};

const removeInactiveUsers = () => {
  const now = Date.now();
  const inactiveUsers = [];
  
  userActivity.forEach((lastActivity, userId) => {
    if (now - lastActivity > INACTIVITY_TIMEOUT) {
      inactiveUsers.push(userId);
    }
  });
  
  inactiveUsers.forEach(userId => {
    const userIndex = users.findIndex(user => user.id === userId);
    if (userIndex !== -1) {
      sock.sendMessage(userId, {text: 'Encerrando conversa por inatividade.'})
      users.splice(userIndex, 1);
      console.log(`👤 User ${userId} removed due to inactivity (2 minutes)`);
    }
    
    userActivity.delete(userId);
  });
  
  if (inactiveUsers.length > 0) {
    console.log(`🗑️ Removed ${inactiveUsers.length} inactive user(s)`);
  }
};

setInterval(removeInactiveUsers, 60 * 1000);

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
        
        // Update activity for the user
        updateUserActivity(messageObject.key.remoteJid);
        
        if(user) {
            const response = await handleChatBot(messageObject, user)
            await sock.sendMessage(messageObject.key.remoteJid, response)
            return
        } else {
          if (messageObject.body == "/entrar" || messageObject.body == "/listas") {
            const newUser = new User(messageObject.key.remoteJid, messageObject.pushName, messageObject.key.remoteJid.split('@')[0], steps[0])
            users.push(newUser);
            const response = await handleChatBot(messageObject, newUser)
            await sock.sendMessage(messageObject.key.remoteJid, response)
            return
          }
          const price = await getCoinPrice(messageObject.body)
          if(price.error) {
            const newUser = new User(messageObject.key.remoteJid, messageObject.pushName, messageObject.key.remoteJid.split('@')[0], undefined)
            users.push(newUser);
            const response = await handleChatBot(messageObject, newUser)
            await sock.sendMessage(messageObject.key.remoteJid, response)
          } else {
            await sock.sendMessage(messageObject.key.remoteJid, {text: price.text})
          }
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

const TIMES = '0 8,12,18 * * *';
const TZ = 'America/Fortaleza';
let greeting = 1

const alertCooldowns = new Map();

export const sendMessageAtTime = () => {
  console.log('Cronjob agendado para 08h, 12h e 18h ⏱️');

  cron.schedule(TIMES, async () => {
      try {
      const watchers = await UserWatcher.find({}).lean();
      if (!watchers.length) return;
      const coins = Array.from(new Set(watchers.map(w => w.coin)))
      const priceMap = await Promise.all(coins.map(async (coin) => {
        const resp = await getCoinPrice(coin);
        return {coin, message:resp.text};
      }))
      const watchersByCoin = watchers.reduce((acc, w) => {
        (acc[w.coin] ||= []).push(w);
        return acc;
      }, {});

      for await (const price of priceMap) {
        const list = watchersByCoin[price.coin]
        await Promise.all(list.map( async (w) => {
          await handleSendMessage(w, price.message)
        }))
      }

      console.log(`Mensagens enviadas para ${watchers.length} watcher(s).`);
    } catch (err) {
      console.error('Erro no cron de preços:', err);
    }
  }, { timezone: TZ });
};

export const monitorPrices = () => {
  console.log('🔄 Price monitoring started - checking every 5 minutes');

  cron.schedule('*/5 * * * *', async () => {
    try {
      const watchers = await UserWatcher.find({}).lean();
      if (!watchers.length) return;

      const coins = Array.from(new Set(watchers.map(w => w.coin)));
      
      const pricePromises = coins.map(async (coin) => {
        try {
          const response = await getCoinPrice(coin);
          const priceMatch = response.text.match(/R\$ ([\d,]+\.?\d*)/);
          const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null;
          return { coin, price, success: !!price };
        } catch (error) {
          console.error(`Error fetching price for ${coin}:`, error);
          return { coin, price: null, success: false };
        }
      });

      const priceResults = await Promise.all(pricePromises);
      const priceMap = new Map();
      priceResults.forEach(result => {
        if (result.success) {
          priceMap.set(result.coin, result.price);
        }
      });

      const alertPromises = watchers.map(async (watcher) => {
        const currentPrice = priceMap.get(watcher.coin);
        if (!currentPrice) return;

        if (currentPrice <= watcher.price) {
          const now = Date.now();
          const lastAlert = alertCooldowns.get(watcher.user) || 0;
          const cooldownMs = 20 * 60 * 1000;

          if (now - lastAlert >= cooldownMs) {
            const alertMessage = `🚨${watcher.coin} - R$ ${currentPrice.toFixed(2)} 🚨🚨\n ⚠️ ALERTA DE PREÇO! ⚠️\nA moeda ${watcher.coin} atingiu R$ ${currentPrice.toFixed(2)}, que está ${currentPrice < watcher.price ? 'abaixo do' : 'igual ao'} seu valor alvo de R$ ${watcher.price.toFixed(2)}.\n\nVocê não receberá mais alertas por 20 minutos.`;
            
            try {

              await handleSendMessage(watcher, alertMessage, true);
              alertCooldowns.set(watcher.user, now);
              console.log(`✅ Alert sent to ${watcher.user} for ${watcher.coin} at R$ ${currentPrice.toFixed(2)}`);
            } catch (error) {
              console.error(`❌ Failed to send alert to ${watcher.user}:`, error);
            }
          } else {
            const remainingMinutes = Math.ceil((cooldownMs - (now - lastAlert)) / (60 * 1000));
            console.log(`⏰ ${watcher.user} still in cooldown for ${watcher.coin} (${remainingMinutes}min remaining)`);
          }
        }
      });

      await Promise.all(alertPromises);
      console.log(`📊 Price check completed for ${watchers.length} watchers`);
    } catch (error) {
      console.error('❌ Error in price monitoring:', error);
    }
  }, { timezone: TZ });
};

connectToWhatsApp();
connectToMongoDB();
sendMessageAtTime();
monitorPrices();


export {
  sock
}