const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Armazena as instâncias dos bots ativos
const activeBots = {};

app.get('/', (req, res) => {
  res.send('Servidor de Hospedagem de Bots Discord Rodando!');
});

// Rota para Ligar o Bot do Discord via Token
app.post('/api/bot/start', async (req, res) => {
  const { botId, token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Token do bot é obrigatório!' });
  }

  if (activeBots[botId]) {
    return res.json({ success: true, message: `Bot ${botId} já está online!` });
  }

  try {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    client.once('ready', () => {
      console.log(`Bot ligado como: ${client.user.tag}`);
    });

    // Exemplo de comando básico do bot no Discord
    client.on('messageCreate', (message) => {
      if (message.author.bot) return;
      if (message.content === '!ping') {
        message.reply('Pong! Bot hospedado com sucesso.');
      }
    });

    await client.login(token);
    activeBots[botId] = client;

    return res.json({ success: true, message: `Bot ${client.user.tag} iniciado com sucesso!` });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Erro ao ligar bot: ${error.message}` });
  }
});

// Rota para Desligar o Bot
app.post('/api/bot/stop', (req, res) => {
  const { botId } = req.body;

  if (activeBots[botId]) {
    activeBots[botId].destroy();
    delete activeBots[botId];
    return res.json({ success: true, message: `Bot ${botId} foi desligado.` });
  }

  return res.status(404).json({ success: false, message: 'Bot não encontrado ou já desligado.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
  
