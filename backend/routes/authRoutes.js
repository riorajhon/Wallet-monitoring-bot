import express from 'express';

const router = express.Router();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Admin password not configured (ADMIN_PASSWORD)' });
  }
  if (String(password || '') === ADMIN_PASSWORD) {
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid password' });
});

export default router;
