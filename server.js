const express = require('express');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const activeBots = {};

app.get('/', (req, res) => {
  res.send('Servidor de Hospedagem de Bots Discord Ativo!');
});

// Rota para Ligar Bot com Comandos Customizados e Suporte a IA
app.post('/api/bot/start', async (req, res) => {
  const { botId, token, customCommands } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Token do bot é obrigatório!' });
  }

  // Se já estiver rodando, encerra para aplicar os novos comandos
  if (activeBots[botId]) {
    activeBots[botId].client.destroy();
    delete activeBots[botId];
  }

  try {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    
    // Mapeia os comandos enviados pelo usuário
    const commandsList = customCommands || [];
    const slashCommandsData = [];

    // Monta a estrutura dos Slash Commands do Discord
    commandsList.forEach(cmd => {
      const builder = new SlashCommandBuilder()
        .setName(cmd.name.toLowerCase())
        .setDescription(cmd.description || 'Comando personalizado');

      // Se o comando precisa de prompt para IA, adiciona uma opção de texto
      if (cmd.useAI || cmd.hasInput) {
        builder.addStringOption(option =>
          option.setName('prompt')
            .setDescription('Texto de entrada')
            .setRequired(true)
        );
      }

      slashCommandsData.push(builder.toJSON());
    });

    client.once('ready', async () => {
      console.log(`Bot ${client.user.tag} online!`);

      // Registra os comandos dinâmicos na API do Discord
      const rest = new REST({ version: '10' }).setToken(token);
      try {
        await rest.put(
          Routes.applicationCommands(client.user.id),
          { body: slashCommandsData }
        );
        console.log(`Comandos / registrados para ${client.user.tag}`);
      } catch (err) {
        console.error('Erro ao registrar comandos no Discord:', err);
      }
    });

    // Escuta e processa as interações do Discord
    client.on('interactionCreate', async interaction => {
      if (!interaction.isChatInputCommand()) return;

      const matchedCmd = commandsList.find(c => c.name.toLowerCase() === interaction.commandName);
      if (!matchedCmd) return;

      // Adia a resposta para dar tempo a APIs externas de responderem
      await interaction.deferReply();

      try {
        // RESPOSTA COM INTELIGÊNCIA ARTIFICIAL (OpenAI / ChatGPT)
        if (matchedCmd.useAI) {
          const userPrompt = interaction.options.getString('prompt');
          const apiKey = matchedCmd.aiKey;

          if (!apiKey) {
            return await interaction.editReply('Erro: Chave de API da IA não foi informada.');
          }

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [{ role: 'user', content: userPrompt }]
            })
          });

          const data = await response.json();
          const aiResponse = data.choices?.[0]?.message?.content || 'Erro ao processar resposta da IA.';
          await interaction.editReply(aiResponse);

        // RESPOSTA SIMPLES DE TEXTO EIXADO
        } else {
          await interaction.editReply(matchedCmd.response || 'Comando executado com sucesso!');
        }
      } catch (error) {
        console.error('Erro na execução do comando:', error);
        await interaction.editReply('Ocorreu um erro ao executar este comando.');
      }
    });

    await client.login(token);
    activeBots[botId] = { client, commands: commandsList };

    return res.json({ success: true, message: `Bot ${client.user.tag} ativo com ${commandsList.length} comandos!` });
  } catch (error) {
    return res.status(500).json({ success: false, message: `Erro ao iniciar: ${error.message}` });
  }
});

// Rota para Desligar
app.post('/api/bot/stop', (req, res) => {
  const { botId } = req.body;
  if (activeBots[botId]) {
    activeBots[botId].client.destroy();
    delete activeBots[botId];
    return res.json({ success: true, message: `Bot ${botId} foi desligado.` });
  }
  return res.status(404).json({ success: false, message: 'Bot não encontrado.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
      
