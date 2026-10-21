import React, { useState } from 'react';
import type { UploadBatch } from '../types';
import { History, ChevronDown, ChevronUp, Building } from 'lucide-react';

interface UploadHistoryPanelProps {
  uploads: UploadBatch[];
  totalCount: number;
  activeUploadId: string | null; // null = whole cumulative list
  onSelect: (uploadId: string | null) => void;
}

export const UploadHistoryPanel: React.FC<UploadHistoryPanelProps> = ({ uploads, totalCount, activeUploadId, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (uploads.length === 0) return null;

  const activeUpload = uploads.find((u) => u.id === activeUploadId);
  const rowClass = (isActive: boolean) =>
    `w-full text-left px-3 py-2 rounded-xl border transition-all flex items-center justify-between gap-3 ${
      isActive ? 'bg-blue-600/15 border-blue-500/40' : 'bg-slate-950 border-slate-800 hover:border-slate-700'
    }`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 shadow-xl mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left gap-3"
      >
        <h2 className="text-sm font-bold text-white flex items-center gap-2 min-w-0">
          <History className="w-4.5 h-4.5 text-blue-400 flex-shrink-0" />
          <span className="truncate">
            업로드 이력 ({uploads.length}회) · 보기: {activeUpload ? `${activeUpload.label} 추가분` : `전체 누적 ${totalCount}개사`}
          </span>
        </h2>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
          <button onClick={() => onSelect(null)} className={rowClass(activeUploadId === null)}>
            <div className="text-xs font-semibold text-slate-100">전체 누적 목록</div>
            <span className="flex items-center gap-1 text-[11px] text-slate-400 flex-shrink-0">
              <Building className="w-3 h-3" />
              {totalCount}개사
            </span>
          </button>
          {uploads.map((upload) => (
            <button key={upload.id} onClick={() => onSelect(upload.id)} className={rowClass(upload.id === activeUploadId)}>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {upload.label} <span className="text-slate-500 font-mono">({upload.id})</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {new Date(upload.createdAt).toLocaleString('ko-KR')} · 중복 건너뜀 {upload.skippedCount}
                  {upload.failedCount > 0 && <span className="text-rose-400"> · 조회 실패 {upload.failedCount}</span>}
                </div>
              </div>
              <span className="flex items-center gap-1 text-[11px] text-slate-400 flex-shrink-0">
                <Building className="w-3 h-3" />
                +{upload.addedCount}개사
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
