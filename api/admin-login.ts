import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isValidAdminPassword } from './_lib/adminAuth.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const { password } = req.body ?? {};
  if (!isValidAdminPassword(password)) {
    res.status(401).json({ ok: false, error: '비밀번호가 올바르지 않습니다.' });
    return;
  }

  res.status(200).json({ ok: true });
}
