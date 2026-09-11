const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Rota inicial de teste
app.get('/', (req, res) => {
  res.send('Servidor do Bot SaaS rodando com sucesso!');
});

// Endpoint para iniciar o bot
app.post('/api/bot/start', (req, res) => {
  const { botId } = req.body;
  console.log(`Solicitação para iniciar o bot: ${botId}`);
  res.json({ success: true, message: `Bot ${botId} iniciado!` });
});

// O Render injeta a porta automaticamente em process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
    
