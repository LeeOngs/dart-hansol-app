import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isValidAdminPassword } from '../_lib/adminAuth.js';
import { findDartCorp } from '../_lib/dartLookup.js';

// Fast (no throttled bulk download — the corp list is pre-baked, and
// company.json is small/unthrottled JSON), so this can run as one call.
export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { adminPassword, name, bizNo } = req.body ?? {};
  if (!isValidAdminPassword(adminPassword)) {
    res.status(401).json({ error: '관리자 인증에 실패했습니다.' });
    return;
  }
  if (typeof name !== 'string' || typeof bizNo !== 'string') {
    res.status(400).json({ error: 'name, bizNo가 필요합니다.' });
    return;
  }

  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '서버에 DART_API_KEY가 설정되어 있지 않습니다.' });
    return;
  }

  // Errors must surface as errors — returning null here would be reported
  // to the user as "not on DART", a false claim about the company.
  try {
    const dartCorp = await findDartCorp(name, bizNo, apiKey);
    res.status(200).json({ dartCorp });
  } catch (err) {
    console.error('find-corp failed:', err);
    res.status(500).json({ error: `DART 조회 실패: ${(err as Error).message}` });
  }
}
