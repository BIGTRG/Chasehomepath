import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { query } from '../db/pool.js';

const router = Router();
router.use(authenticate);

router.post('/click', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  await query(
    `INSERT INTO smartcredit_clicks (user_id, clicked_at)
     VALUES ($1, NOW())
     ON CONFLICT (user_id) DO UPDATE SET click_count = smartcredit_clicks.click_count + 1, last_clicked = NOW()`,
    [userId]
  );
  res.json({ ok: true });
}));

router.get('/status', asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT click_count, clicked_at, last_clicked FROM smartcredit_clicks WHERE user_id = $1',
    [req.user.id]
  );
  res.json(rows[0] || { click_count: 0, clicked_at: null, last_clicked: null });
}));

export default router;
