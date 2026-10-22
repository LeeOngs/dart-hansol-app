import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isValidAdminPassword } from '../_lib/adminAuth.js';
import { checkFilingForRating } from '../_lib/dartLookup.js';

// The slow step if DART throttles us (it does for overseas IPs). One
// filing per call keeps each invocation inside the Hobby plan's 300s limit
// (with Fluid compute); the client loops over filings.
export const config = { maxDuration: 300 };

// Leaves room under maxDuration for unzip/decode/response after the download.
const DOWNLOAD_TIMEOUT_MS = 280000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { adminPassword, rceptNo } = req.body ?? {};
  if (!(await isValidAdminPassword(adminPassword))) {
    res.status(401).json({ error: '관리자 인증에 실패했습니다.' });
    return;
  }
  if (typeof rceptNo !== 'string') {
    res.status(400).json({ error: 'rceptNo가 필요합니다.' });
    return;
  }

  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '서버에 DART_API_KEY가 설정되어 있지 않습니다.' });
    return;
  }

  try {
    const found = await checkFilingForRating(rceptNo, apiKey, DOWNLOAD_TIMEOUT_MS);
    res.status(200).json({ found });
  } catch (err) {
    // A filing too large to download within the time budget is skipped, not
    // failed: the client moves on to the next filing. If none can be read the
    // company ends up "rating unconfirmed" — never a guessed rating.
    if ((err as Error).name === 'AbortError') {
      console.error(`check-filing ${rceptNo} timed out downloading; skipping`);
      res.status(200).json({ found: null, skipped: 'timeout' });
      return;
    }
    console.error('check-filing failed:', err);
    res.status(500).json({ error: `공시서류 확인 실패: ${(err as Error).message}` });
  }
}
