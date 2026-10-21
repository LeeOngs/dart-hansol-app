import React from 'react';
import { CalendarDays, Plus } from 'lucide-react';

interface YearTabsProps {
  years: string[]; // newest first
  selectedYear: string | null;
  onSelect: (year: string) => void;
  onAddYear?: () => void; // admin only
  disabled?: boolean; // while an upload into the selected year is running
}

export const YearTabs: React.FC<YearTabsProps> = ({ years, selectedYear, onSelect, onAddYear, disabled }) => (
  <div className="flex flex-wrap items-center gap-2 mb-6">
    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mr-1">
      <CalendarDays className="w-4 h-4 text-blue-400" />
      자료 연도
    </span>
    {years.map((year) => (
      <button
        key={year}
        onClick={() => onSelect(year)}
        disabled={disabled}
        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
          year === selectedYear
            ? 'bg-blue-600 border-blue-500 text-white'
            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
        }`}
      >
        {year}년
      </button>
    ))}
    {onAddYear && (
      <button
        onClick={onAddYear}
        disabled={disabled}
        className="px-3 py-1.5 rounded-xl text-xs font-medium border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="w-3.5 h-3.5" />
        새 연도
      </button>
    )}
  </div>
);
