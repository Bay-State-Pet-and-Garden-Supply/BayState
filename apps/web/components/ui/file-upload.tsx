'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, File, X, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
    onFileSelect: (file: File | null) => void;
    accept?: string;
    maxSize?: number;
    loading?: boolean;
    label?: React.ReactNode;
    selectedFile?: File | null;
    disabled?: boolean;
    className?: string;
}

export function FileUpload({
    onFileSelect,
    accept,
    maxSize = 10,
    loading = false,
    label,
    selectedFile,
    disabled = false,
    className
}: FileUploadProps) {
    const [dragOver, setDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback((file: File) => {
        setError(null);
        
        if (file.size > maxSize * 1024 * 1024) {
            setError(`File size must be less than ${maxSize}MB`);
            return;
        }

        onFileSelect(file);
    }, [maxSize, onFileSelect]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);

        if (disabled || loading) return;

        const file = e.dataTransfer.files?.[0];
        if (file) {
            handleFile(file);
        }
    }, [disabled, loading, handleFile]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFile(file);
        }
        e.target.value = '';
    }, [handleFile]);

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        onFileSelect(null);
        setError(null);
    };

    return (
        <div className={cn("space-y-2", className)}>
            <div
                className={cn(
                    "relative flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg transition-colors duration-200 ease-in-out",
                    dragOver 
                        ? "border-purple-500 bg-purple-50" 
                        : "border-gray-300 bg-gray-50 hover:bg-gray-100",
                    (disabled || loading) ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                    "min-h-[8rem] p-6"
                )}
                onDragOver={(e) => {
                    e.preventDefault();
                    if (!disabled && !loading) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !disabled && !loading && inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    accept={accept}
                    onChange={handleChange}
                    disabled={disabled || loading}
                />

                <div className="flex flex-col items-center justify-center text-center space-y-2">
                    {loading ? (
                        <>
                            <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                            <p className="text-sm text-gray-500">Processing...</p>
                        </>
                    ) : selectedFile ? (
                        <>
                            <div className="p-3 bg-purple-100 rounded-full">
                                <File className="w-8 h-8 text-purple-600" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-gray-900 break-all max-w-xs">
                                    {selectedFile.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {(selectedFile.size / 1024).toFixed(1)} KB
                                </p>
                            </div>
                            {!disabled && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8"
                                    onClick={handleRemove}
                                >
                                    Remove file
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            <div className={cn(
                                "p-3 rounded-full transition-colors",
                                dragOver ? "bg-purple-100" : "bg-gray-100"
                            )}>
                                <Upload className={cn(
                                    "w-8 h-8",
                                    dragOver ? "text-purple-600" : "text-gray-400"
                                )} />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-gray-600">
                                    {label || (
                                        <>
                                            <span className="font-semibold text-purple-600">Click to upload</span> or drag and drop
                                        </>
                                    )}
                                </p>
                                {accept && (
                                    <p className="text-xs text-gray-500 uppercase">
                                        {accept.replace(/,/g, ', ')}
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 animate-in slide-in-from-top-1 fade-in">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}
