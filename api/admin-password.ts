import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isValidAdminPassword, setAdminPassword, MIN_ADMIN_PASSWORD_LENGTH } from './_lib/adminAuth.js';

// Changes the shared admin password. Every admin (web and bulk-upload PCs)
// must use the new one afterwards.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { adminPassword, newPassword } = req.body ?? {};
  if (!(await isValidAdminPassword(adminPassword))) {
    res.status(401).json({ error: '현재 관리자 비밀번호가 올바르지 않습니다.' });
    return;
  }
  if (typeof newPassword !== 'string' || newPassword.trim() !== newPassword || newPassword.length < MIN_ADMIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `새 비밀번호는 앞뒤 공백 없이 ${MIN_ADMIN_PASSWORD_LENGTH}자 이상이어야 합니다.` });
    return;
  }
  if (newPassword === adminPassword) {
    res.status(400).json({ error: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.' });
    return;
  }

  await setAdminPassword(newPassword);
  res.status(200).json({ ok: true });
}
