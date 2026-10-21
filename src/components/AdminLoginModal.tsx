import React, { useState } from 'react';
import { ShieldCheck, X, Check, Info, AlertCircle, KeyRound, LogOut } from 'lucide-react';

const MIN_PASSWORD_LENGTH = 8; // mirrors api/_lib/adminAuth.ts

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (password: string) => void;
  adminPassword: string | null; // set when already in admin mode
  onLogout: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = (props) => {
  if (!props.isOpen) return null;
  return props.adminPassword ? <AdminSettings {...props} adminPassword={props.adminPassword} /> : <AdminLogin {...props} />;
};

const inputClass =
  'w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-sm text-white placeholder-slate-500 transition-all';

const ModalFrame: React.FC<{ title: string; subtitle: string; onClose: () => void; children: React.ReactNode }> = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-slate-100">
      <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
        <X className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  </div>
);

// Shown while in admin mode: change the shared password, or leave admin mode.
const AdminSettings: React.FC<AdminLoginModalProps & { adminPassword: string }> = ({ onClose, onLoginSuccess, adminPassword, onLogout }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleChange = async () => {
    setError(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) return setError(`새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
    if (newPassword !== confirmPassword) return setError('새 비밀번호가 서로 다릅니다.');

    setIsSaving(true);
    try {
      const res = await fetch('/api/admin-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword, newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || '비밀번호를 변경하지 못했습니다.');
      onLoginSuccess(newPassword);
      setDone(true);
    } catch {
      setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalFrame title="관리자 설정" subtitle="관리자 모드 사용 중" onClose={onClose}>
      <div className="space-y-4">
        {done ? (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5"><Check className="w-4 h-4" /> 비밀번호를 변경했습니다.</p>
            <p className="leading-relaxed">
              다른 관리자에게 새 비밀번호를 알려주세요. 대량업로드.bat을 쓰는 PC는 프로젝트 폴더의 .env.local 파일을 지우고 bat을 다시 실행해 새 비밀번호를 입력해야 합니다.
            </p>
          </div>
        ) : (
          <>
            <div className="p-3 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs text-slate-300 leading-relaxed">
              <div className="flex items-center gap-1.5 font-semibold text-blue-400 mb-1">
                <KeyRound className="w-4 h-4 flex-shrink-0" />
                <span>관리자 비밀번호 변경</span>
              </div>
              모든 관리자가 함께 쓰는 비밀번호입니다. 변경하면 다른 관리자도 새 비밀번호로 다시 로그인해야 합니다.
            </div>
            <div className="space-y-2">
              <input type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                placeholder={`새 비밀번호 (${MIN_PASSWORD_LENGTH}자 이상)`} autoFocus className={inputClass} />
              <input type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleChange()} placeholder="새 비밀번호 확인" className={inputClass} />
              {error && (
                <p className="text-xs text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
                </p>
              )}
            </div>
          </>
        )}

        <div className="flex justify-between gap-2 pt-2">
          <button
            onClick={() => { onLogout(); onClose(); }}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all flex items-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            관리자 모드 종료
          </button>
          {done ? (
            <button onClick={onClose} className="px-5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all">
              닫기
            </button>
          ) : (
            <button
              onClick={handleChange}
              disabled={isSaving || !newPassword || !confirmPassword}
              className="px-5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              <KeyRound className="w-4 h-4" />
              {isSaving ? '변경 중...' : '비밀번호 변경'}
            </button>
          )}
        </div>
      </div>
    </ModalFrame>
  );
};

const AdminLogin: React.FC<AdminLoginModalProps> = ({ onClose, onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleLogin = async () => {
    if (!password.trim()) return;
    setIsChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || '비밀번호가 올바르지 않습니다.');
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onLoginSuccess(password);
        setSuccess(false);
        setPassword('');
        onClose();
      }, 600);
    } catch {
      setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <ModalFrame title="관리자 모드" subtitle="업로드 권한이 있는 관리자만 입력하세요" onClose={onClose}>
        <div className="space-y-4">
          <div className="p-3 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-blue-400">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>안내사항</span>
            </div>
            <p className="leading-relaxed">
              관리자 비밀번호를 입력하면 업로드, 직접 입력, 기업 삭제, 업로드 이력 보기가 가능해집니다. 변경한 내용은 모든 방문자에게 공유됩니다.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              관리자 비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="비밀번호 입력"
              autoFocus
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-sm text-white placeholder-slate-500 transition-all"
            />
            {error && (
              <p className="mt-1.5 text-xs text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
            >
              취소
            </button>
            <button
              onClick={handleLogin}
              disabled={isChecking || !password.trim()}
              className="px-5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              {success ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>인증 완료!</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isChecking ? '확인 중...' : '로그인'}</span>
                </>
              )}
            </button>
          </div>
        </div>
    </ModalFrame>
  );
};
