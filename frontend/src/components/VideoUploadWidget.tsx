/**
 * VideoUploadWidget.tsx
 *
 * Video upload component with drag-and-drop support and file preview.
 */

import { useRef, useState } from "react";

export interface VideoUploadState {
  file: File | null;
  filename: string;
}

interface VideoUploadWidgetProps {
  value: VideoUploadState;
  onChange: (state: VideoUploadState) => void;
  disabled?: boolean;
}

export function VideoUploadWidget({ value, onChange, disabled = false }: VideoUploadWidgetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("video/")) {
        onChange({
          file,
          filename: file.name,
        });
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onChange({
        file,
        filename: file.name,
      });
    }
  };

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ file: null, filename: "" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-2.5 uppercase tracking-wider">
        Video file
      </label>

      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative p-8 text-center border-2 border-dashed rounded-lg transition-all duration-300 ${
          isDragActive
            ? "border-primary bg-blue-50 shadow-lg shadow-primary/10"
            : "border-gray-300 bg-gray-50 shadow-sm shadow-black/5"
        } ${disabled ? "opacity-50 cursor-default" : "cursor-pointer"}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />

        {!value.file ? (
          <div>
            <div className="text-4xl mb-3 text-primary">↑</div>
            <div className="text-base font-semibold text-gray-900 mb-1.5">
              Drop your video here
            </div>
            <div className="text-sm text-gray-500">
              or click to browse
            </div>
          </div>
        ) : (
          <div>
            <div className="text-3xl mb-3 text-success">✓</div>
            <div className="text-sm font-semibold text-gray-900 mb-1.5 break-words">
              {value.filename}
            </div>
            <div className="text-xs text-gray-500 mb-3.5">
              {value.file && formatFileSize(value.file.size)}
            </div>
            <button
              onClick={handleClear}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded transition-all duration-200 shadow-sm hover:bg-blue-50 hover:border-primary hover:text-primary hover:shadow-md hover:shadow-primary/15"
            >
              Change video
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
