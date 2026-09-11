const express = require('express');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const activeBots = {};
const MAX_BOTS = 4; // Limite de 4 bots ativos por instância/usuário

app.get('/', (req, res) => {
  res.send('Servidor de Hospedagem de Bots Discord Ativo (Multi-Bot Mode)!');
});

app.post('/api/bot/start', async (req, res) => {
  const { botId, token, customCommands } = req.body;

  if (!token) return res.status(400).json({ success: false, message: 'Token do bot é obrigatório!' });
  if (!botId) return res.status(400).json({ success: false, message: 'ID do bot não especificado!' });

  // Verifica se o botId está dentro do limite permitido (bot-1 até bot-4)
  const botNumber = parseInt(botId.replace('bot-', ''));
  if (isNaN(botNumber) || botNumber < 1 || botNumber > MAX_BOTS) {
    return res.status(400).json({ success: false, message: `O limite é de no máximo ${MAX_BOTS} bots ativos!` });
  }

  // Se este slot específico já tiver um bot rodando, encerra o anterior antes de iniciar o novo
  if (activeBots[botId]) {
    try {
      activeBots[botId].client.destroy();
    } catch (e) {}
    delete activeBots[botId];
  }

  try {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    const commandsList = customCommands || [];
    const slashCommandsData = [];

    commandsList.forEach(cmd => {
      const builder = new SlashCommandBuilder()
        .setName(cmd.name.toLowerCase())
        .setDescription(cmd.description || 'Comando personalizado');

      if (cmd.useAI || cmd.hasInput) {
        builder.addStringOption(option =>
          option.setName('prompt')
            .setDescription('O que você deseja perguntar/falar?')
            .setRequired(true)
        );
      }
      slashCommandsData.push(builder.toJSON());
    });

    client.once('ready', async () => {
      console.log(`Bot [${botId}] conectado como ${client.user.tag}`);
      const rest = new REST({ version: '10' }).setToken(token);
      try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommandsData });
      } catch (err) {
        console.error(`Erro ao registrar comandos para ${botId}:`, err);
      }
    });

    client.on('interactionCreate', async interaction => {
      if (!interaction.isChatInputCommand()) return;

      const matchedCmd = commandsList.find(c => c.name.toLowerCase() === interaction.commandName);
      if (!matchedCmd) return;

      await interaction.deferReply();

      try {
        if (matchedCmd.useAI) {
          const userPrompt = interaction.options.getString('prompt');
          const apiUrl = matchedCmd.aiUrl || 'https://api.openai.com/v1/chat/completions';
          const aiModel = matchedCmd.aiModel || 'gpt-3.5-turbo';
          const apiKey = matchedCmd.aiKey;

          if (!apiKey) return await interaction.editReply('Erro: Chave de API não configurada neste comando.');

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: aiModel,
              messages: [{ role: 'user', content: userPrompt }]
            })
          });

          const data = await response.json();
          const aiResponse = data.choices?.[0]?.message?.content || 'A IA não retornou uma resposta válida.';
          const finalResponse = aiResponse.length > 2000 ? aiResponse.substring(0, 1997) + '...' : aiResponse;
          await interaction.editReply(finalResponse);
        } else {
          await interaction.editReply(matchedCmd.response || 'Comando executado!');
        }
      } catch (error) {
        console.error('Erro na execução do comando:', error);
        await interaction.editReply('Ocorreu um erro ao processar o comando.');
      }
    });

    await client.login(token);
    activeBots[botId] = { client, tag: client.user.tag };

    return res.json({ success: true, message: `Bot ${client.user.tag} iniciado no Slot ${botNumber}!` });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Erro ao iniciar bot: ${error.message}` });
  }
});

app.post('/api/bot/stop', (req, res) => {
  const { botId } = req.body;
  if (activeBots[botId]) {
    try {
      activeBots[botId].client.destroy();
    } catch (e) {}
    delete activeBots[botId];
    return res.json({ success: true, message: `Slot ${botId} foi desligado com sucesso.` });
  }
  return res.status(404).json({ success: false, message: 'Nenhum bot ativo encontrado neste slot.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
