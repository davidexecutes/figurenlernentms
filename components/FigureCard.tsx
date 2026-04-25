'use client';

import { useEffect, useRef } from 'react';
import { FigureStatus } from '@/lib/types';

interface Props {
  imageUrl: string;
  status: FigureStatus;
  overlaySvg?: string;
  overlayLoading?: boolean;
}

export default function FigureCard({
  imageUrl,
  status,
  overlaySvg,
  overlayLoading,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      const size = 360;
      canvas.width = size;
      canvas.height = size;

      ctx.clearRect(0, 0, size, size);

      const scale = Math.min(size / img.width, size / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const offsetX = (size - drawW) / 2;
      const offsetY = (size - drawH) / 2;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      if (status === 'learned') {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
        ctx.font = 'bold 64px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓', size / 2, size / 2);
      }
    };
  }, [imageUrl, status]);

  return (
    <div
      className="relative rounded-xl overflow-hidden bg-white"
      style={{ width: 360, height: 360, maxWidth: '100%' }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      {overlaySvg && status !== 'learned' && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
          dangerouslySetInnerHTML={{ __html: overlaySvg }}
        />
      )}
      {overlayLoading && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/70 px-2 py-1 rounded-lg pointer-events-none">
          <div className="w-3 h-3 border border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-zinc-200">Skizze...</span>
        </div>
      )}
    </div>
  );
}
