/**
 * Interactive front end for scripts/bulk-upload.ts, launched by
 * 대량업로드.bat (double-click, or drag an Excel file onto it). Asks for the
 * file, year and label, runs a 20-company dry run, and only after the admin
 * confirms runs the real upload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { isValidDatasetYear, currentYear } from '../src/services/companyStore.js';

const DRY_RUN_SAMPLE = 20;
const DAILY_LIMIT_EXIT_CODE = 2; // see bulk-upload.ts
const BLOCKED_EXIT_CODE = 3; // see bulk-upload.ts

// Lines are queued rather than read with rl.question(): answers typed or
// pasted ahead of the next prompt would otherwise be silently dropped.
const rl = createInterface({ input: process.stdin });
const pendingLines: string[] = [];
const waiting: ((line: string) => void)[] = [];
rl.on('line', (line) => {
  const resolve = waiting.shift();
  if (resolve) resolve(line);
  else pendingLines.push(line);
});
rl.on('close', () => {
  for (const resolve of waiting.splice(0)) resolve('');
});

function ask(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const queued = pendingLines.shift();
  if (queued !== undefined) {
    process.stdout.write(`${queued}\n`);
    return Promise.resolve(queued);
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function cleanPath(raw: string): string {
  // Dragging a file into the console wraps paths containing spaces in quotes.
  return raw.trim().replace(/^["']|["']$/g, '');
}

async function askFile(initial?: string): Promise<string> {
  let candidate = initial ? cleanPath(initial) : '';
  while (true) {
    if (!candidate) candidate = cleanPath(await ask('엑셀 파일을 이 창에 끌어다 놓고 Enter를 누르세요: '));
    const ext = path.extname(candidate).toLowerCase();
    if (fs.existsSync(candidate) && ['.xlsx', '.xls', '.csv', '.json'].includes(ext)) return path.resolve(candidate);
    console.log(`  파일을 찾을 수 없거나 지원하지 않는 형식입니다 (.xlsx .xls .csv .json): ${candidate}`);
    candidate = '';
  }
}

async function askYear(): Promise<string> {
  while (true) {
    const answer = (await ask(`자료 연도를 입력하세요 (Enter = ${currentYear()}): `)).trim() || currentYear();
    if (isValidDatasetYear(answer)) return answer;
    console.log('  연도는 2027처럼 4자리 숫자로 입력해 주세요.');
  }
}

async function confirm(question: string): Promise<boolean> {
  const answer = (await ask(`${question} (Y/N): `)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes' || answer === 'ㅛ';
}

const ENV_FILE = '.env.local';
const APP_URL = 'https://dart-hansol-app.vercel.app';

function readEnvKeys(): Set<string> {
  if (!fs.existsSync(ENV_FILE)) return new Set();
  return new Set(
    fs.readFileSync(ENV_FILE, 'utf-8').split(/\r?\n/).map((line) => line.split('=')[0].trim()).filter(Boolean)
  );
}

/**
 * First run on a new PC: asks for the DART key and the shared admin
 * password, checks the password against the site, and stores both in
 * .env.local (git-ignored). Nothing else is needed to run bulk uploads.
 */
async function ensureCredentials(): Promise<boolean> {
  const present = readEnvKeys();
  const lines: string[] = [];

  if (!present.has('DART_API_KEY')) {
    console.log('처음 실행이라 설정이 필요합니다. (이 PC에 한 번만 저장됩니다)\n');
    while (true) {
      const key = (await ask('DART API 키 (opendart.fss.or.kr 에서 발급, 40자리): ')).trim();
      if (/^[0-9a-zA-Z]{40}$/.test(key)) {
        lines.push(`DART_API_KEY=${key}`);
        break;
      }
      console.log('  DART API 키는 영문·숫자 40자리입니다. 다시 확인해 주세요.');
    }
  }

  if (!present.has('ADMIN_PASSWORD')) {
    while (true) {
      const password = (await ask('관리자 비밀번호: ')).trim();
      if (!password) return false;
      const res = await fetch(`${APP_URL}/api/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        lines.push(`ADMIN_PASSWORD=${password}`);
        break;
      }
      console.log('  비밀번호가 올바르지 않습니다. 다시 입력해 주세요. (그만두려면 Enter)');
    }
  }

  if (lines.length > 0) {
    const prefix = fs.existsSync(ENV_FILE) && !fs.readFileSync(ENV_FILE, 'utf-8').endsWith('\n') ? '\n' : '';
    fs.appendFileSync(ENV_FILE, `${prefix}${lines.join('\n')}\n`);
    console.log(`\n설정을 ${path.resolve(ENV_FILE)} 에 저장했습니다. 이 파일은 다른 사람과 공유하지 마세요.\n`);
  }
  return true;
}

function runBulkUpload(args: string[]): number {
  const result = spawnSync(
    process.execPath,
    ['--env-file=.env.local', '--import', 'tsx', path.join('scripts', 'bulk-upload.ts'), ...args],
    { stdio: 'inherit' }
  );
  return result.status ?? 1;
}

async function main() {
  console.log('==============================================');
  console.log('  DART 기업 대량 업로드');
  console.log('==============================================\n');

  if (!(await ensureCredentials())) {
    console.log('설정을 마치지 않아 종료합니다.');
    return;
  }

  const file = await askFile(process.argv[2]);
  const year = await askYear();
  const label = (await ask('업로드 이름 (Enter = 자동 생성): ')).trim();

  console.log(`\n파일: ${file}\n연도: ${year}년 자료\n이름: ${label || '(자동 생성)'}\n`);
  console.log(`[1단계] 먼저 ${DRY_RUN_SAMPLE}개 기업으로 시험 조회합니다. 아무것도 저장되지 않습니다.\n`);

  if (runBulkUpload([file, '--year', year, '--dry-run', '--limit', String(DRY_RUN_SAMPLE)]) !== 0) {
    console.log('\n시험 조회 중 오류가 발생했습니다. 위 메시지를 확인해 주세요.');
    return;
  }

  console.log('\n위 결과(기업명 · 신용등급)가 맞게 나왔는지 확인해 주세요.');
  if (!(await confirm(`[2단계] 전체 파일을 ${year}년 자료로 실제 업로드할까요?`))) {
    console.log('취소했습니다. 아무것도 저장되지 않았습니다.');
    return;
  }

  console.log('\n실제 업로드를 시작합니다. 완료될 때까지 이 창을 닫지 마세요.\n');
  const labelArgs = label ? ['--label', label] : [];
  const code = runBulkUpload([file, '--year', year, ...labelArgs]);

  if (code === 0) {
    console.log(`\n완료! 사이트에서 ${year}년 탭을 열어 확인하세요: https://dart-hansol-app.vercel.app`);
  } else if (code === DAILY_LIMIT_EXIT_CODE) {
    console.log('\n오늘 DART 요청 한도에 도달했습니다. 진행 상황은 저장됐으니 내일 같은 파일과 연도로 다시 실행하면 이어서 진행합니다.');
  } else if (code === BLOCKED_EXIT_CODE) {
    console.log('\nDART가 일시적으로 접속을 막았습니다. 진행 상황은 저장됐으니 1~2시간 뒤 같은 파일과 연도로 다시 실행하면 이어서 진행합니다.');
  } else {
    console.log('\n오류로 중단됐습니다. 진행 상황은 저장됐으니 같은 파일과 연도로 다시 실행하면 이어서 진행합니다.');
  }
}

main()
  .catch((err) => console.error(err instanceof Error ? err.message : err))
  .finally(() => rl.close());
