const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // Caso use para chamar a IA (Groq)

const app = express();
app.use(express.json());

// Arquivo local para salvar os dados na nuvem do Render
const DATA_FILE = path.join(__dirname, 'bots.json');

// Armazena as instâncias ativas dos bots na memória
const activeBots = {};

// Função para carregar dados salvos
function carregarDados() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        } catch (e) {
            return {};
        }
    }
    return {};
}

// Função para salvar dados
function salvarDados(dados) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(dados, null, 2));
}

// Função central para iniciar um bot de forma persistente
async function iniciarInstanciaBot(botId, token, customCommands) {
    // Se já houver uma instância rodando, desliga primeiro para evitar duplicidade
    if (activeBots[botId]) {
        try {
            await activeBots[botId].destroy();
        } catch (e) {}
        delete activeBots[botId];
    }

    if (!token) return false;

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });

    client.once('ready', async () => {
        console.log(`[BOT] ${client.user.tag} (${botId}) conectado com sucesso!`);
        
        // Registra os comandos Slash no Discord
        const guildas = await client.guilds.fetch();
        for (const [guildId] of guildas) {
            try {
                const guild = await client.guilds.fetch(guildId);
                const slashCommandsData = customCommands.map(cmd => ({
                    name: cmd.name.replace('/', ''),
                    description: cmd.description || 'Comando personalizado'
                }));
                await guild.commands.set(slashCommandsData);
            } catch (err) {
                console.error(`Erro ao registrar comandos na guilda ${guildId}:`, err);
            }
        }
    });

    // Manipulador de interações (comandos)
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;

        const cmdName = '/' + interaction.commandName;
        const comandoConfig = customCommands.find(c => c.name === cmdName);

        if (!comandoConfig) {
            return interaction.reply({ content: 'Comando não encontrado.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            if (comandoConfig.type === 'code' && comandoConfig.scriptCode) {
                // Executa o script JavaScript configurado
                const executarScript = new Function('interaction', 'async', `
                    return (async () => {
                        ${comandoConfig.scriptCode}
                    })();
                `);
                const resultado = await executarScript(interaction, axios);
                await interaction.editReply(resultado ? String(resultado) : 'Comando executado.');
            } 
            else if (comandoConfig.type === 'ai' && comandoConfig.aiKey) {
                // Integração com a API Groq / OpenAI
                const promptUser = interaction.options.getString('texto') || 'Olá!';
                const responseAI = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                    model: comandoConfig.aiModel || 'llama-3.3-70b-versatile',
                    messages: [{ role: 'user', content: promptUser }]
                }, {
                    headers: { 'Authorization': `Bearer ${comandoConfig.aiKey}` }
                });

                const respostaTexto = responseAI.data.choices[0].message.content;
                await interaction.editReply(respostaTexto);
            } else {
                await interaction.editReply('Comando sem configuração válida.');
            }
        } catch (error) {
            console.error('Erro ao executar comando:', error);
            await interaction.editReply('Ocorreu um erro ao executar este comando.');
        }
    });

    try {
        await client.login(token);
        activeBots[botId] = client;
        return true;
    } catch (error) {
        console.error(`Erro ao logar o bot ${botId}:`, error);
        return false;
    }
}

// Rota para ligar/atualizar o bot pelo painel
app.post('/api/bot/start', async (req, res) => {
    const { botId, token, customCommands } = req.body;
    if (!botId || !token) {
        return res.json({ success: false, message: 'Dados incompletos.' });
    }

    // Salva no arquivo JSON do servidor para persistência
    const dadosSalvos = carregarDados();
    dadosSalvos[botId] = { token, customCommands: customCommands || [] };
    salvarDados(dadosSalvos);

    const ligado = await iniciarInstanciaBot(botId, token, customCommands || []);
    if (ligado) {
        res.json({ success: true, message: 'Bot ligado e salvo com sucesso!' });
    } else {
        res.json({ success: false, message: 'Token inválido ou erro ao ligar.' });
    }
});

// Rota para desligar o bot
app.post('/api/bot/stop', async (req, res) => {
    const { botId } = req.body;
    if (activeBots[botId]) {
        try {
            await activeBots[botId].destroy();
        } catch (e) {}
        delete activeBots[botId];
    }

    // Remove do arquivo persistente
    const dadosSalvos = carregarDados();
    if (dadosSalvos[botId]) {
        delete dadosSalvos[botId];
        salvarDados(dadosSalvos);
    }

    res.json({ success: true, message: 'Slot desligado com sucesso.' });
});

// Rota básica para o UptimeRobot acessar e manter acordado
app.get('/', (req, res) => {
    res.send('Servidor de Hospedagem de Bots Online.');
});

// AUTO-RELIGAR: Quando o servidor do Render ligar ou reiniciar, religa todos os bots salvos automaticamente!
const dadosIniciais = carregarDados();
for (const [botId, config] of Object.entries(dadosIniciais)) {
    if (config.token) {
        console.log(`[AUTO-RESTART] Religando ${botId} automaticamente...`);
        iniciarInstanciaBot(botId, config.token, config.comandos || []);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Painel rodando na porta ${PORT}`);
});
                    
