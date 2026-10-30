import { Router } from 'express';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { getCachedInsight, getOrCreateInsight } from './insights.service.js';

// Ejecuta el limitador solo cuando de verdad se va a llamar a Claude.
const runAiLimiter = (req, res) =>
  new Promise((resolve, reject) => aiLimiter(req, res, (err) => (err ? reject(err) : resolve())));

export const insightsRouter = Router();

insightsRouter.get('/', async (req, res) => {
  const cached = await getCachedInsight(req.user);
  if (cached) return res.json(cached);
  await runAiLimiter(req, res);
  res.json(await getOrCreateInsight(req.user));
});

insightsRouter.post('/refresh', async (req, res) => {
  await runAiLimiter(req, res);
  res.json(await getOrCreateInsight(req.user, { force: true }));
});
