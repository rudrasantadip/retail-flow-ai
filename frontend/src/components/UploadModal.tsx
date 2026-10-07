import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileVideo, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  Compass
} from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (newVideoId: string) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStep, setUploadStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.type.includes('video') || dropped.name.match(/\.(mp4|avi|mov|mkv)$/i)) {
        setFile(dropped);
        if (!title) {
          setTitle(dropped.name.replace(/\.[^/.]+$/, ''));
        }
        setErrorMsg(null);
      } else {
        setErrorMsg('Please upload a valid video file (.mp4, .avi, .mov).');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, ''));
      }
      setErrorMsg(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMsg('Please select a video file to upload.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    setUploadStep('Uploading CCTV video file to server...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title || file.name);

    const apiBase = window.location.port === '5173' ? 'http://127.0.0.1:5000' : '';

    try {
      const response = await fetch(`${apiBase}/api/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `Upload failed (Status ${response.status})` }));
        throw new Error(err.error || 'Failed to process video');
      }

      const data = await response.json();
      const newVideoId = data.video_id;

      // Poll pipeline status until person detection, face blurring & artifacts are ready.
      // On CPU this can take several minutes, so there is no fixed attempt cap.
      setUploadStep('Video uploaded! Starting YOLO person detection & FaceNet face blurring...');
      const stageText: Record<string, string> = {
        loading_models: 'Loading YOLO & FaceNet models',
        detecting_people: 'Detecting people (YOLO)',
        blurring_faces: 'Blurring faces (FaceNet)',
        finalizing: 'Finalizing analytics'
      };
      let ready = false;
      while (!ready) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const sRes = await fetch(`${apiBase}/api/pipeline/status/${newVideoId}`);
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.status === 'ready') {
              ready = true;
              break;
            }
            if (sData.status === 'error') {
              throw new Error(sData.error || 'Video analysis failed on the server.');
            }
            const label = stageText[sData.stage] || 'Processing';
            setUploadStep(`${label}… ${Math.round((sData.progress || 0) * 100)}%`);
          }
        } catch (pollErr: any) {
          if (pollErr instanceof Error && pollErr.message && !/fetch|network/i.test(pollErr.message)) {
            throw pollErr;
          }
        }
      }

      setUploadStep('Analysis complete! Loading store map & opening floor calibration...');

      setTimeout(() => {
        setIsUploading(false);
        onUploadSuccess(newVideoId);
        onClose();
      }, 600);

    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect to backend server. Make sure http://localhost:5000 is running.');
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <UploadCloud className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Upload CCTV Video Clip
              </h2>
              <p className="text-xs text-slate-400">
                Person tracking (YOLO) with automatic face blurring (FaceNet) & heatmap analysis
              </p>
            </div>
          </div>
          {!isUploading && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Drag & drop upload area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
              dragActive
                ? 'border-indigo-500 bg-indigo-950/20'
                : file
                ? 'border-emerald-500/80 bg-emerald-950/10'
                : 'border-slate-700 hover:border-slate-500 bg-slate-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/avi,video/quicktime,video/x-matroska"
              onChange={handleFileChange}
              className="hidden"
            />

            {file ? (
              <>
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <FileVideo className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-slate-200">
                  {file.name}
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </div>
                <span className="text-[11px] text-emerald-400 mt-1">
                  Click or drag to change file
                </span>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="text-sm font-medium text-slate-200">
                  Click to select or drag and drop CCTV video
                </div>
                <div className="text-xs text-slate-500">
                  Supported formats: MP4, AVI, MOV (Recommended: 1–3 min fixed camera clip)
                </div>
              </>
            )}
          </div>

          {/* Video Title / Camera Name */}
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
              Camera / Store Location Name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Main Entrance & Checkout Aisle"
              disabled={isUploading}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-950/50 border border-red-800 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Upload & Progress State */}
          {isUploading && (
            <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-800/60 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
              <div className="text-xs">
                <div className="font-semibold text-indigo-200">Processing Video</div>
                <div className="text-indigo-400 text-[11px]">{uploadStep}</div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !file}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                isUploading || !file
                  ? 'bg-indigo-950 text-indigo-400 border border-indigo-900 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Upload & Run Pipeline</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
