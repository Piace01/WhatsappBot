require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
const readline = require('readline');
const https = require('https');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

let tempNumbers = [];

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Ciao! Inviami un file CSV con i numeri di telefono (una riga per numero), poi scrivimi il messaggio da inviare.');
});

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.document.file_id;

  try {
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

    const filePath = path.join(__dirname, 'numeri_contatti.csv');
    const fileStream = fs.createWriteStream(filePath);

    https.get(fileUrl, (response) => {
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        tempNumbers = fs.readFileSync(filePath, 'utf-8')
          .split('\n')
          .map(n => n.trim())
          .filter(n => n.length > 0);
        bot.sendMessage(chatId, 'File ricevuto! Ora inviami il messaggio da mandare.');
      });
    });
  } catch (err) {
    bot.sendMessage(chatId, 'Errore durante il download del file.');
    console.error(err);
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (msg.document || !tempNumbers.length || !msg.text || msg.text.startsWith('/')) return;

  const messaggio = msg.text;
  bot.sendMessage(chatId, 'Invio dei messaggi in corso...');

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: './sessione_whatsapp',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto('https://web.whatsapp.com');
  await page.waitForSelector('canvas, ._3NwY5', { timeout: 0 });

  for (const numero of tempNumbers) {
    try {
      const url = `https://wa.me/${numero.replace('+', '')}?text=${encodeURIComponent(messaggio)}`;
      const nuovaScheda = await browser.newPage();
      await nuovaScheda.goto(url);
      await nuovaScheda.waitForSelector('a[href*="send"]', { timeout: 15000 });
      await nuovaScheda.click('a[href*="send"]');
      await new Promise(resolve => setTimeout(resolve, 5000));
      await nuovaScheda.keyboard.press('Enter');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await nuovaScheda.close();
    } catch (err) {
      console.error(`Errore con ${numero}:`, err.message);
    }
  }

  await browser.close();
  bot.sendMessage(chatId, 'Messaggi inviati con successo!');
  tempNumbers = [];
});
