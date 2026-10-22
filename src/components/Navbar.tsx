import React from 'react';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';

interface NavbarProps {
  isAdmin: boolean;
  onOpenAdminModal: () => void;
  passedCount: number;
  totalCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  isAdmin,
  onOpenAdminModal,
  passedCount,
  totalCount
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100 px-4 lg:px-8 py-3.5 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-bold text-lg">
            H
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                한솔로지스틱스 CY/ICD 거점별 기업 분석
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-md flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> DART OpenAPI 연동
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span>Raw Data 업로드</span> • <span>DART B등급 이상 필터링</span> • <span>4대 컨테이너 거점 거리 정렬</span>
            </p>
          </div>
        </div>

        {/* Right Actions & Status Badges */}
        <div className="flex items-center flex-wrap gap-2.5">
          {totalCount > 0 && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-xs">
              <span className="text-slate-400">충족 업체 (B등급 이상):</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> {passedCount} / {totalCount}개사
              </span>
            </div>
          )}

          <button
            onClick={onOpenAdminModal}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 ${
              isAdmin
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/20'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isAdmin ? '관리자 모드 ON' : '관리자 모드'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
