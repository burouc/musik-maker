import express from 'express';
import cors from 'cors';
import path from 'node:path';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// -----------------------------------------------------------------------
// API routes (placeholder for future song storage)
// -----------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Future: song CRUD endpoints will go here
// app.get('/api/songs', ...)
// app.post('/api/songs', ...)
// app.get('/api/songs/:id', ...)
// app.put('/api/songs/:id', ...)
// app.delete('/api/songs/:id', ...)

// -----------------------------------------------------------------------
// Serve React client in production
// -----------------------------------------------------------------------

const clientBuildPath = path.join(import.meta.dirname, '../../client/dist');
app.use(express.static(clientBuildPath));

// All non-API routes fall through to the React app
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
