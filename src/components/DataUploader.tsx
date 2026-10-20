import React, { useRef, useState } from 'react';
import { Upload, Download, Plus, FileSpreadsheet, Sparkles, Building } from 'lucide-react';
import { parseCompanyFile, downloadSampleTemplate } from '../utils/excelUtils';
import type { CompanyRawData } from '../types';

interface DataUploaderProps {
  onDataLoaded: (companies: CompanyRawData[], uploadLabel?: string) => void;
  onAddManualCompany: (company: CompanyRawData) => void;
  onLoadSamples: () => void;
  currentCount: number;
}

export const DataUploader: React.FC<DataUploaderProps> = ({
  onDataLoaded,
  onAddManualCompany,
  onLoadSamples,
  currentCount
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');

  const [manualName, setManualName] = useState('');
  const [manualAddr, setManualAddr] = useState('');
  const [manualBizNo, setManualBizNo] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    try {
      const companies = await parseCompanyFile(files[0]);
      onDataLoaded(companies, uploadLabel.trim() || undefined);
      setUploadLabel('');
    } catch (err) {
      alert('파일을 읽는 도중 오류가 발생했습니다. 엑셀/CSV 양식을 확인해 주세요.');
      console.error(err);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setIsLoading(true);
      try {
        const companies = await parseCompanyFile(e.dataTransfer.files[0]);
        onDataLoaded(companies, uploadLabel.trim() || undefined);
        setUploadLabel('');
      } catch (err) {
        alert('파일 업로드 중 오류가 발생했습니다.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualAddr.trim()) {
      alert('기업명과 주소를 입력해 주세요.');
      return;
    }

    const newCompany: CompanyRawData = {
      id: `manual-${Date.now()}`,
      name: manualName.trim(),
      address: manualAddr.trim(),
      bizNo: manualBizNo.trim() || undefined
    };

    onAddManualCompany(newCompany);
    setManualName('');
    setManualAddr('');
    setManualBizNo('');
    setShowManualAdd(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-400" />
            <span>Raw Data 업로드 및 데이터 등록</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            분석 대상 기업 리스트가 포함된 엑셀(.xlsx, .xls), CSV, JSON 파일을 업로드하세요.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={downloadSampleTemplate}
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-all flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>샘플 양식 다운로드</span>
          </button>

          <button
            onClick={() => setShowManualAdd(!showManualAdd)}
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            <span>직접 입력 추가</span>
          </button>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-sm font-bold text-slate-200 mb-1.5">업로드 이름 (선택 · 비워두면 자동 생성)</label>
        <input
          type="text"
          value={uploadLabel}
          onChange={(e) => setUploadLabel(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="예: 2025년 업체 리스트"
          className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:border-blue-500"
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10 scale-[1.005]'
            : 'border-slate-800 hover:border-slate-700 bg-slate-950/50 hover:bg-slate-950'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".xlsx,.xls,.csv,.json"
          className="hidden"
        />

        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-1">
            {isLoading ? (
              <Sparkles className="w-6 h-6 animate-spin text-blue-400" />
            ) : (
              <FileSpreadsheet className="w-6 h-6" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">
              클릭하거나 엑셀/CSV 파일을 이곳으로 드래그앤드롭 하세요
            </p>
            <p className="text-xs text-slate-500 mt-1">
              지원 형식: .xlsx, .xls, .csv, .json (컬럼명: 기업명, 주소, 사업자번호 등 자동인식)
            </p>
          </div>

          <div className="pt-2 flex items-center gap-3 text-xs text-slate-400">
            <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-md">
              현재 등록 기업: <strong className="text-blue-400">{currentCount}개사</strong>
            </span>
            <span>또는</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLoadSamples();
              }}
              className="text-blue-400 hover:text-blue-300 font-semibold underline flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" /> 15개 추천 기업 샘플 즉시 로드
            </button>
          </div>
        </div>
      </div>

      {showManualAdd && (
        <form onSubmit={handleManualSubmit} className="mt-4 p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3 animate-fade-in">
          <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Building className="w-4 h-4 text-blue-400" />
            <span>개별 기업 직접 추가</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">기업명 *</label>
              <input
                type="text"
                required
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="예: (주)한솔물류"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">본사/공장 주소 *</label>
              <input
                type="text"
                required
                value={manualAddr}
                onChange={(e) => setManualAddr(e.target.value)}
                placeholder="예: 충청남도 아산시 탕정면 정정로 212"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">사업자등록번호 (선택)</label>
              <input
                type="text"
                value={manualBizNo}
                onChange={(e) => setManualBizNo(e.target.value)}
                placeholder="예: 123-81-45678"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowManualAdd(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              닫기
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-md"
            >
              기업 추가하기
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
