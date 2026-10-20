import React, { useState } from 'react';
import type { UploadHistoryEntry } from '../types';
import { History, ChevronDown, ChevronUp, Building } from 'lucide-react';

interface UploadHistoryPanelProps {
  history: UploadHistoryEntry[];
  activeHistoryId: string | null;
  onSelect: (entry: UploadHistoryEntry) => void;
}

export const UploadHistoryPanel: React.FC<UploadHistoryPanelProps> = ({ history, activeHistoryId, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (history.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 shadow-xl mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <History className="w-4.5 h-4.5 text-blue-400" />
          <span>업로드 히스토리 ({history.length}건)</span>
        </h2>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
          {history.map((entry) => {
            const isActive = entry.id === activeHistoryId;
            return (
              <button
                key={entry.id}
                onClick={() => onSelect(entry)}
                className={`w-full text-left px-3 py-2 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                  isActive
                    ? 'bg-blue-600/15 border-blue-500/40'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {entry.label} <span className="text-slate-500 font-mono">({entry.id})</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(entry.createdAt).toLocaleString('ko-KR')}
                  </div>
                </div>
                <span className="flex items-center gap-1 text-[11px] text-slate-400 flex-shrink-0">
                  <Building className="w-3 h-3" />
                  {entry.rawCompanies.length}개사
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
