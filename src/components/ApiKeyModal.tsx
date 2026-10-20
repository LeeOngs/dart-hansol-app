import React, { useState } from 'react';
import { Key, ExternalLink, ShieldCheck, X, Check, Info } from 'lucide-react';
import { setStoredDartApiKey } from '../services/dartApi';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentApiKey: string;
  onSave: (newKey: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  currentApiKey,
  onSave
}) => {
  const [inputKey, setInputKey] = useState(currentApiKey);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    setStoredDartApiKey(inputKey);
    onSave(inputKey);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">DART Open API Key 설정</h3>
            <p className="text-xs text-slate-400">금융감독원 전자공시시스템 API 인증키</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-3 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-blue-400">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>안내사항</span>
            </div>
            <p className="leading-relaxed">
              DART API Key(40자리)를 입력하시면 실시간 공시 데이터 조회가 가능합니다. API 키가 없어도 **DART 재무분석 시뮬레이션 엔진**으로 모든 기능을 즉시 테스트하실 수 있습니다.
            </p>
            <a
              href="https://opendart.fss.or.kr/uss/umt/EgovMberInsertView.do"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:underline pt-1 font-medium"
            >
              <span>DART 인증키 신청 페이지 바로가기</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              API Key (crtfc_key)
            </label>
            <input
              type="text"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              placeholder="예: 1234567890abcdef1234567890abcdef12345678"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-sm text-white placeholder-slate-500 transition-all font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>저장 완료!</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>API Key 저장</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
