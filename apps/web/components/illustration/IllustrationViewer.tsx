'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StorySegment } from '@/types/story';

interface IllustrationViewerProps {
  segments: StorySegment[];
  initialIndex?: number;
  onClose?: () => void;
}

export function IllustrationViewer({ segments, initialIndex = 0, onClose }: IllustrationViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const segmentsWithImages = segments.filter((s) => s.imageUrl);
  const currentSegment = segmentsWithImages[currentIndex];

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
    setIsLoaded(false);
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) =>
      prev < segmentsWithImages.length - 1 ? prev + 1 : prev
    );
    setIsLoaded(false);
  }, [segmentsWithImages.length]);

  const toggleZoom = useCallback(() => {
    setIsZoomed((prev) => !prev);
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    setIsFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!isFullscreen) {
      const viewer = document.getElementById('illustration-viewer');
      if (viewer?.requestFullscreen) {
        await viewer.requestFullscreen();
        setIsFullscreen(true);
      }
    } else {
      await exitFullscreen();
    }
  }, [exitFullscreen, isFullscreen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          exitFullscreen();
        } else if (onClose) {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exitFullscreen, goToNext, goToPrevious, isFullscreen, onClose]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleDownload = useCallback(() => {
    if (currentSegment?.imageUrl) {
      const link = document.createElement('a');
      link.href = currentSegment.imageUrl;
      link.download = `${currentSegment.title || `illustration-${currentIndex + 1}`}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [currentSegment, currentIndex]);

  if (!currentSegment) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        暂无插画
      </div>
    );
  }

  return (
    <div
      id="illustration-viewer"
      className="relative flex flex-col h-full bg-black/95"
    >
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-2 text-white">
          <span className="text-sm">
            {currentIndex + 1} / {segmentsWithImages.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white hover:bg-white/20"
            onClick={toggleZoom}
          >
            {isZoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white hover:bg-white/20"
            onClick={toggleFullscreen}
          >
            <Maximize2 className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white hover:bg-white/20"
            onClick={handleDownload}
          >
            <Download className="h-5 w-5" />
          </Button>

          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-white hover:bg-white/20"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div
          className={`relative transition-transform duration-300 ${
            isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
          }`}
          style={{
            width: isZoomed ? '150%' : '100%',
            height: isZoomed ? '150%' : '100%',
          }}
          onClick={toggleZoom}
        >
          {!isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <img
            src={currentSegment.imageUrl!}
            alt={currentSegment.title || `插画 ${currentIndex + 1}`}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setIsLoaded(true)}
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-black/60 to-transparent">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-white hover:bg-white/20 disabled:opacity-30"
          onClick={goToPrevious}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>

        <div className="flex gap-1">
          {segmentsWithImages.map((_, index) => (
            <button
              key={index}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex ? 'bg-white' : 'bg-white/40 hover:bg-white/60'
              }`}
              onClick={() => {
                setCurrentIndex(index);
                setIsLoaded(false);
              }}
            />
          ))}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-white hover:bg-white/20 disabled:opacity-30"
          onClick={goToNext}
          disabled={currentIndex === segmentsWithImages.length - 1}
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>

      {currentSegment.title && (
        <div className="absolute bottom-16 left-0 right-0 text-center px-4">
          <p className="text-white text-sm drop-shadow-lg line-clamp-1">
            {currentSegment.title}
          </p>
        </div>
      )}
    </div>
  );
}
