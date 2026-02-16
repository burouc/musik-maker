import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// -----------------------------------------------------------------------
// Projects storage (file-based JSON)
// -----------------------------------------------------------------------

const DATA_DIR = path.join(import.meta.dirname, '../../data/projects');

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getProjectPath(id: string): string {
  // Sanitize id to prevent path traversal
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(DATA_DIR, `${safeId}.json`);
}

// -----------------------------------------------------------------------
// API routes
// -----------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// List all saved projects (metadata only)
app.get('/api/projects', (_req, res) => {
  ensureDataDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  const projects = files.map((f) => {
    const raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf-8');
    const data = JSON.parse(raw);
    return { id: data.id, name: data.name, updatedAt: data.updatedAt, createdAt: data.createdAt };
  });
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json(projects);
});

// Get a single project
app.get('/api/projects/:id', (req, res) => {
  const filePath = getProjectPath(req.params.id);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  res.json(JSON.parse(raw));
});

// Create or update a project
app.put('/api/projects/:id', (req, res) => {
  ensureDataDir();
  const project = req.body;
  if (!project || !project.id) {
    res.status(400).json({ error: 'Invalid project data' });
    return;
  }
  project.updatedAt = new Date().toISOString();
  const filePath = getProjectPath(project.id);
  if (!fs.existsSync(filePath)) {
    project.createdAt = project.updatedAt;
  }
  fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf-8');
  res.json({ id: project.id, name: project.name, updatedAt: project.updatedAt });
});

// Delete a project
app.delete('/api/projects/:id', (req, res) => {
  const filePath = getProjectPath(req.params.id);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

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
