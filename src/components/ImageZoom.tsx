import React, { useState, useRef, useEffect, MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent, TouchEvent as ReactTouchEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageZoomProps {
  src: string;
  alt?: string;
  className?: string;
}

export function ImageZoom({ src, alt = 'Imagem', className = '' }: ImageZoomProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  
  // Touch state
  const touchStartRef = useRef<{ x: number; y: number; distance: number; initZoom: number }>({ x: 0, y: 0, distance: 0, initZoom: 1 });
  const originRef = useRef<{ x: number, y: number }>({ x: 50, y: 50 });
  const rafRef = useRef<number | null>(null);

  const maxZoom = 5;
  const minZoom = 1;

  const updateOrigin = (clientX: number, clientY: number) => {
    if (!containerRef.current || !imgRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    originRef.current = { x, y };
    imgRef.current.style.transformOrigin = `${x}% ${y}%`;
  };

  const handleMouseMove = (e: ReactMouseEvent) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      // Only update origin if not heavily zoomed and dragged (simplified, just update origin mostly)
      updateOrigin(e.clientX, e.clientY);
    });
  };

  const toggleFullscreen = (e: ReactMouseEvent) => {
    if (e.target !== containerRef.current && e.target !== imgRef.current) return;
    
    setIsFullscreen(!isFullscreen);
    setZoomLevel(minZoom);
    if (!isFullscreen) {
      updateOrigin(e.clientX, e.clientY);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (imgRef.current) {
         imgRef.current.style.transformOrigin = 'center center';
         imgRef.current.style.transform = `scale(1) translate(0px, 0px)`;
      }
    }
  };

  const closeFullscreen = (e?: ReactMouseEvent) => {
    e?.stopPropagation();
    setIsFullscreen(false);
    setZoomLevel(minZoom);
    document.body.style.overflow = '';
    if (imgRef.current) {
        imgRef.current.style.transformOrigin = 'center center';
        imgRef.current.style.transform = `scale(1) translate(0px, 0px)`;
    }
  };

  const handleWheel = (e: ReactWheelEvent) => {
    e.preventDefault(); // Need passive: false on the actual DOM node for this to work natively without React warning, but React synthetic events usually handle it unless specified. 
    // Wait, React onWheel is passive by default in some cases. We might need a native listener for perfect preventDefault.
    const newZoom = e.deltaY < 0 
      ? Math.min(zoomLevel + 0.3, maxZoom) 
      : Math.max(zoomLevel - 0.3, minZoom);
    setZoomLevel(newZoom);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        closeFullscreen();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isFullscreen]);

  // Use native wheel event for preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const wheelHandler = (e: WheelEvent) => {
       e.preventDefault();
       setZoomLevel(prev => {
          const newZoom = e.deltaY < 0 
            ? Math.min(prev + 0.3, maxZoom) 
            : Math.max(prev - 0.3, minZoom);
          return newZoom;
       });
    };
    container.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
       container.removeEventListener('wheel', wheelHandler);
    };
  }, []);

  // Touch handlers for pinch-to-zoom
  const getDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      touchStartRef.current.distance = getDistance(e.touches);
      touchStartRef.current.initZoom = zoomLevel;
      
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      updateOrigin(centerX, centerY);
    } else if (e.touches.length === 1 && zoomLevel > 1) {
       // Single touch drag when zoomed
       touchStartRef.current.x = e.touches[0].clientX;
       touchStartRef.current.y = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault(); // Prevent scrolling
      const dist = getDistance(e.touches);
      const scaleStr = dist / touchStartRef.current.distance;
      const newZoom = Math.max(minZoom, Math.min(maxZoom, touchStartRef.current.initZoom * scaleStr));
      setZoomLevel(newZoom);
    } else if (e.touches.length === 1 && zoomLevel > 1) {
      e.preventDefault(); // Prevent scrolling while panning
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const _dx = e.touches[0].clientX - touchStartRef.current.x;
        const _dy = e.touches[0].clientY - touchStartRef.current.y;
        // In a full implementation, we'd add translate to the transform, 
        // but for simplicity according to the prompt's paradigm, we just 
        // update transformOrigin slightly to simulate panning via origin shift,
        // or just let origin track center. 
        // A truly robust drag needs translate, but let's stick to the origin-based panning for now, 
        // maybe just update origin based on touch position like mousemove.
        updateOrigin(e.touches[0].clientX, e.touches[0].clientY);
      });
    }
  };

  const handleTouchEnd = (e: ReactTouchEvent) => {
     if (e.touches.length < 2) {
        // Pinch ended
     }
  };

  // Prevent native touchmove default when zooming on mobile to stop page scroll
  useEffect(() => {
     const container = containerRef.current;
     if (!container) return;
     const touchMoveHandler = (e: TouchEvent) => {
        if (isFullscreen || zoomLevel > 1) {
           e.preventDefault();
        }
     };
     container.addEventListener('touchmove', touchMoveHandler, { passive: false });
     return () => container.removeEventListener('touchmove', touchMoveHandler);
  }, [isFullscreen, zoomLevel]);

  return (
    <>
      <div 
        ref={containerRef}
        className={`${className} overflow-hidden relative cursor-zoom-in transition-all duration-300 ease-in-out z-[1] ${
          isFullscreen 
            ? '!fixed top-0 left-0 w-[100vw] h-[100vh] !border-none !z-[9999] bg-black/95 !cursor-zoom-out' 
            : ''
        }`}
        onClick={toggleFullscreen}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img 
          ref={imgRef}
          src={src} 
          alt={alt} 
          className={`w-full h-full transform-origin-center transition-transform duration-100 ease-out ${isFullscreen ? 'object-contain' : 'object-cover'}`}
          style={{ transform: `scale(${zoomLevel})` }}
        />
        {isFullscreen && (
          <Button 
             variant="ghost" 
             size="icon" 
             className="absolute top-4 right-4 text-white hover:bg-white/20 z-50 rounded-full bg-black/40"
             onClick={closeFullscreen}
          >
             <X className="w-6 h-6" />
          </Button>
        )}
      </div>
    </>
  );
}
