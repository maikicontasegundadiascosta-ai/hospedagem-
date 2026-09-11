const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Armazena os bots ativos nos slots
const activeBots = {};

// 1. ROTA PARA LIGAR/ATUALIZAR O BOT E SEUS COMANDOS
app.post('/api/bot/start', async (req, res) => {
    const { botId, token, customCommands } = req.body;

    if (!token) {
        return res.json({ success: false, message: 'Token não fornecido!' });
    }

    try {
        // Se já houver um bot rodando neste slot, desliga ele primeiro
        if (activeBots[botId]) {
            await activeBots[botId].client.destroy();
            delete activeBots[botId];
        }

        const client = new Client({ intents: [GatewayIntentBits.Guilds] });

        client.once('ready', async () => {
            console.log(`Bot do ${botId} conectado como ${client.user.tag}`);

            // Registra os comandos de barra no Discord automaticamente
            const rest = new REST({ version: '10' }).setToken(token);
            const discordCommands = (customCommands || []).map(cmd => ({
                name: cmd.name.replace('/', '').toLowerCase(), // Remove a barra para o Discord registrar certo
                description: cmd.description || 'Comando personalizado'
            }));

            try {
                await rest.put(
                    Routes.applicationCommands(client.user.id),
                    { body: discordCommands },
                );
                console.log(`Comandos registrados com sucesso para ${botId}!`);
            } catch (error) {
                console.error('Erro ao registrar comandos no Discord:', error);
            }
        });

        // 2. ONDE ACONTECE A MÁGICA: EXECUTAR O SEU SCRIPT DE VERDADE
        client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;

            const currentBot = activeBots[botId];
            if (!currentBot) return;

            // Procura o comando correspondente que você criou no painel
            const comandoEncontrado = currentBot.customCommands.find(c => 
                c.name === `/${interaction.commandName}` || c.name === interaction.commandName
            );

            if (comandoEncontrado) {
                if (comandoEncontrado.type === 'code' && comandoEncontrado.scriptCode) {
                    try {
                        // Cria uma função segura para rodar o seu código JS digitado no painel
                        const executarScript = new Function('interaction', 'client', `
                            try {
                                ${comandoEncontrado.scriptCode}
                            } catch (err) {
                                return "❌ Erro no script: " + err.message;
                            }
                        `);

                        // Executa e pega o resultado do seu código
                        const resultado = executarScript(interaction, client);

                        if (resultado) {
                            await interaction.reply(resultado);
                        } else {
                            await interaction.reply('Comando executado com sucesso!');
                        }
                    } catch (erro) {
                        await interaction.reply('❌ Erro crítico ao executar o script do comando.');
                    }
                } 
                else if (comandoEncontrado.type === 'text') {
                    await interaction.reply(comandoEncontrado.response || 'Feito!');
                }
            }
        });

        await client.login(token);
        activeBots[botId] = { client, customCommands };

        res.json({ success: true, message: `Bot ${botId} ligado e comandos sincronizados!` });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'Token inválido ou erro ao iniciar o bot.' });
    }
});

// 3. ROTA PARA DESLIGAR O BOT
app.post('/api/bot/stop', async (req, res) => {
    const { botId } = req.body;
    if (activeBots[botId]) {
        await activeBots[botId].client.destroy();
        delete activeBots[botId];
        return res.json({ success: true, message: `Bot ${botId} desligado com sucesso.` });
    }
    res.json({ success: false, message: 'Este bot já está desligado.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
      
