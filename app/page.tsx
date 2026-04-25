'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import FigureCard from '@/components/FigureCard';
import { Figure } from '@/lib/types';

type Mode = 'upload' | 'select' | 'study';

const MIN_RECT_PCT = 1.5;

interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SelectionRect {
  figureId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

function generateId() {
  return Math.random().toString(36).slice(2);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function cropRectFromImage(
  img: HTMLImageElement,
  rect: PixelRect
): { dataUrl: string; base64: string } {
  const sx = clamp(Math.round(rect.x), 0, img.naturalWidth - 1);
  const sy = clamp(Math.round(rect.y), 0, img.naturalHeight - 1);
  const sw = clamp(Math.round(rect.width), 1, img.naturalWidth - sx);
  const sh = clamp(Math.round(rect.height), 1, img.naturalHeight - sy);

  const side = Math.max(sw, sh);
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, side, side);

  const dx = Math.floor((side - sw) / 2);
  const dy = Math.floor((side - sh) / 2);
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);

  const dataUrl = canvas.toDataURL('image/png');
  return { dataUrl, base64: dataUrl.split(',')[1] };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('upload');
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const sourceImgRef = useRef<HTMLImageElement | null>(null);
  const sourceImgElRef = useRef<HTMLImageElement | null>(null);

  const [figures, setFigures] = useState<Figure[]>([]);
  const [selectionRects, setSelectionRects] = useState<SelectionRect[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const learnedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = figures[currentIndex] ?? null;
  const currentAssoc =
    current && current.associations.length > 0
      ? current.associations[current.selectedAssociation]
      : null;

  const fetchAssociation = useCallback(
    async (croppedBase64: string, excludeNames: string[]) => {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: croppedBase64,
          mediaType: 'image/png',
          excludeNames,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Fehler bei der Analyse');
      if (!data.association) throw new Error('Keine Assoziation erhalten');
      return data.association;
    },
    []
  );

  const analyzeFigure = useCallback(
    async (figure: Figure) => {
      setFigures((prev) =>
        prev.map((f) => (f.id === figure.id ? { ...f, status: 'loading' } : f))
      );

      try {
        const association = await fetchAssociation(figure.croppedBase64, []);
        setFigures((prev) =>
          prev.map((f) =>
            f.id === figure.id
              ? { ...f, status: 'done', associations: [association], selectedAssociation: 0 }
              : f
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setFigures((prev) =>
          prev.map((f) =>
            f.id === figure.id
              ? {
                  ...f,
                  status: 'done',
                  associations: [
                    {
                      name: `Fehler: ${message}`,
                      explanation: 'Bitte prüfe deinen API-Schlüssel und versuche es erneut.',
                      memorability: 1,
                      highlight: 'full',
                    },
                  ],
                  selectedAssociation: 0,
                }
              : f
          )
        );
      }
    },
    [fetchAssociation]
  );

  const requestNewIdea = useCallback(async () => {
    if (!current || current.ideaLoading) return;
    if (current.status !== 'done') return;

    const figureId = current.id;
    const excludeNames = current.associations.map((a) => a.name);

    setFigures((prev) =>
      prev.map((f) => (f.id === figureId ? { ...f, ideaLoading: true } : f))
    );

    try {
      const association = await fetchAssociation(current.croppedBase64, excludeNames);
      setFigures((prev) =>
        prev.map((f) =>
          f.id === figureId
            ? {
                ...f,
                ideaLoading: false,
                associations: [...f.associations, association],
                selectedAssociation: f.associations.length,
              }
            : f
        )
      );
    } catch {
      setFigures((prev) =>
        prev.map((f) => (f.id === figureId ? { ...f, ideaLoading: false } : f))
      );
    }
  }, [current, fetchAssociation]);

  const fetchOverlay = useCallback(
    async (
      figureId: string,
      assocIndex: number,
      assocName: string,
      assocExplanation: string,
      croppedBase64: string
    ) => {
      setFigures((prev) =>
        prev.map((f) => (f.id === figureId ? { ...f, overlayLoading: true } : f))
      );

      try {
        const res = await fetch('/api/overlay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            associationName: assocName,
            associationExplanation: assocExplanation,
            imageBase64: croppedBase64,
            mediaType: 'image/png',
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? 'Overlay-Fehler');
        if (!data.svg) throw new Error('Keine SVG-Daten');

        setFigures((prev) =>
          prev.map((f) =>
            f.id === figureId
              ? {
                  ...f,
                  overlayLoading: false,
                  associations: f.associations.map((a, i) =>
                    i === assocIndex ? { ...a, svg: data.svg } : a
                  ),
                }
              : f
          )
        );
      } catch {
        setFigures((prev) =>
          prev.map((f) => (f.id === figureId ? { ...f, overlayLoading: false } : f))
        );
      }
    },
    []
  );

  const loadSourceFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      sourceImgRef.current = img;
      setSourceUrl(url);
      setFigures([]);
      setSelectionRects([]);
      setDrag(null);
      setMode('select');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  const finalizeRectRef = useRef<(rectPct: { x: number; y: number; width: number; height: number }) => void>(() => {});
  finalizeRectRef.current = (rectPct) => {
    const img = sourceImgRef.current;
    if (!img) return;
    const naturalRect: PixelRect = {
      x: (rectPct.x / 100) * img.naturalWidth,
      y: (rectPct.y / 100) * img.naturalHeight,
      width: (rectPct.width / 100) * img.naturalWidth,
      height: (rectPct.height / 100) * img.naturalHeight,
    };
    let crop;
    try {
      crop = cropRectFromImage(img, naturalRect);
    } catch {
      return;
    }
    const figureId = generateId();
    const figure: Figure = {
      id: figureId,
      imageUrl: crop.dataUrl,
      croppedBase64: crop.base64,
      status: 'pending',
      associations: [],
      selectedAssociation: 0,
    };
    setFigures((prev) => [...prev, figure]);
    setSelectionRects((prev) => [...prev, { figureId, ...rectPct }]);
    analyzeFigure(figure);
  };

  const handleSourceMouseDown = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const newDrag = { startX: x, startY: y, currentX: x, currentY: y };
    dragRef.current = newDrag;
    setDrag(newDrag);
  }, []);

  useEffect(() => {
    if (!drag) return;
    const imgEl = sourceImgElRef.current;
    if (!imgEl) return;

    const onMove = (e: MouseEvent) => {
      const rect = imgEl.getBoundingClientRect();
      const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
      const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
      const cur = dragRef.current;
      if (!cur) return;
      const updated = { ...cur, currentX: x, currentY: y };
      dragRef.current = updated;
      setDrag(updated);
    };

    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      const x1 = Math.min(d.startX, d.currentX);
      const y1 = Math.min(d.startY, d.currentY);
      const w = Math.max(d.startX, d.currentX) - x1;
      const h = Math.max(d.startY, d.currentY) - y1;
      if (w >= MIN_RECT_PCT && h >= MIN_RECT_PCT) {
        finalizeRectRef.current({ x: x1, y: y1, width: w, height: h });
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeFigure = useCallback((figureId: string) => {
    setFigures((prev) => prev.filter((f) => f.id !== figureId));
    setSelectionRects((prev) => prev.filter((p) => p.figureId !== figureId));
  }, []);

  const startStudy = useCallback(() => {
    if (figures.length === 0) return;
    setCurrentIndex(0);
    setMode('study');
  }, [figures.length]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) loadSourceFile(file);
    },
    [loadSourceFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadSourceFile(file);
      e.target.value = '';
    },
    [loadSourceFile]
  );

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, figures.length - 1));
  }, [figures.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const markLearned = useCallback(() => {
    if (!current) return;
    setFigures((prev) =>
      prev.map((f) => (f.id === current.id ? { ...f, status: 'learned' } : f))
    );
    if (learnedTimerRef.current) clearTimeout(learnedTimerRef.current);
    learnedTimerRef.current = setTimeout(() => {
      setCurrentIndex((i) => Math.min(i + 1, figures.length - 1));
    }, 800);
  }, [current, figures.length]);

  const currentId = current?.id;
  const currentSelectedAssoc = current?.selectedAssociation;
  const currentStatus = current?.status;
  const currentAssocSvg = currentAssoc?.svg;
  const currentAssocName = currentAssoc?.name;

  useEffect(() => {
    if (mode !== 'study') return;
    if (
      !current ||
      currentStatus !== 'done' ||
      current.overlayLoading ||
      !currentAssoc ||
      currentAssoc.svg ||
      currentAssoc.name.startsWith('Fehler:')
    ) {
      return;
    }
    fetchOverlay(
      current.id,
      currentSelectedAssoc ?? 0,
      currentAssoc.name,
      currentAssoc.explanation,
      current.croppedBase64
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    currentId,
    currentSelectedAssoc,
    currentStatus,
    currentAssocSvg,
    currentAssocName,
    fetchOverlay,
  ]);

  useEffect(() => {
    if (mode !== 'study') return;
    const handler = (e: KeyboardEvent) => {
      if (!figures.length) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          goPrev();
          break;
        case ' ':
          e.preventDefault();
          markLearned();
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          requestNewIdea();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, figures.length, goNext, goPrev, markLearned, requestNewIdea]);

  useEffect(() => {
    return () => {
      if (learnedTimerRef.current) clearTimeout(learnedTimerRef.current);
    };
  }, []);

  // ---- UPLOAD MODE ----
  if (mode === 'upload') {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-zinc-100 mb-2">TMS Figuren Trainer</h1>
          <p className="text-zinc-400">Lade ein Foto deiner Figurenseite hoch</p>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full max-w-lg rounded-2xl border-2 border-dashed p-16 flex flex-col items-center gap-4 cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-orange-500 bg-orange-500/10'
              : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:bg-zinc-900/80'
          }`}
        >
          <div className="text-5xl">🖼️</div>
          <div className="text-center">
            <p className="text-zinc-200 font-medium text-lg">Figurenseite hier ablegen</p>
            <p className="text-zinc-500 text-sm mt-1">oder klicken zum Auswählen</p>
            <p className="text-zinc-600 text-xs mt-2">
              Du ziehst danach selbst Rahmen um die Figuren, die du lernen möchtest
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInput}
        />
      </main>
    );
  }

  // ---- SELECT MODE ----
  if (mode === 'select') {
    const analyzingCount = figures.filter(
      (f) => f.status === 'loading' || f.status === 'pending'
    ).length;

    const dragRect = drag
      ? {
          left: Math.min(drag.startX, drag.currentX),
          top: Math.min(drag.startY, drag.currentY),
          width: Math.abs(drag.currentX - drag.startX),
          height: Math.abs(drag.currentY - drag.startY),
        }
      : null;

    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h1 className="text-lg font-bold text-zinc-100">Figuren auswählen</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Ziehe einen Rahmen um jede Figur, die du lernen möchtest
            </p>
          </div>
          <button
            onClick={() => {
              setMode('upload');
              setSourceUrl(null);
              setFigures([]);
              setSelectionRects([]);
              setDrag(null);
            }}
            className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Anderes Bild
          </button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            {sourceUrl && (
              <div className="relative inline-block select-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={sourceImgElRef}
                  src={sourceUrl}
                  alt="Figurenseite"
                  onMouseDown={handleSourceMouseDown}
                  className="block max-h-[80vh] max-w-full cursor-crosshair select-none"
                  draggable={false}
                />
                {selectionRects.map((r, i) => (
                  <div
                    key={r.figureId}
                    className="absolute border-2 border-orange-500/80 bg-orange-500/10 pointer-events-none"
                    style={{
                      left: `${r.x}%`,
                      top: `${r.y}%`,
                      width: `${r.width}%`,
                      height: `${r.height}%`,
                    }}
                  >
                    <div className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </div>
                  </div>
                ))}
                {dragRect && (
                  <div
                    className="absolute border-2 border-orange-300 bg-orange-400/20 pointer-events-none"
                    style={{
                      left: `${dragRect.left}%`,
                      top: `${dragRect.top}%`,
                      width: `${dragRect.width}%`,
                      height: `${dragRect.height}%`,
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <aside className="w-64 border-l border-zinc-800 flex flex-col bg-zinc-950">
            <div className="px-4 py-3 border-b border-zinc-800">
              <div className="text-sm text-zinc-300 font-semibold">
                {figures.length} {figures.length === 1 ? 'Figur' : 'Figuren'} ausgewählt
              </div>
              {analyzingCount > 0 && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                  <div className="w-2.5 h-2.5 border border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <span>{analyzingCount} werden analysiert...</span>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {figures.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center mt-8 leading-relaxed">
                  Noch keine Figuren ausgewählt.
                  <br />
                  Ziehe einen Rahmen über das Bild links.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {figures.map((fig, i) => (
                    <div
                      key={fig.id}
                      className="relative group aspect-square rounded-lg overflow-hidden border border-zinc-700 bg-white"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fig.imageUrl}
                        alt={`Figur ${i + 1}`}
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-1 left-1 bg-orange-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {i + 1}
                      </div>
                      <button
                        onClick={() => removeFigure(fig.id)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600/90 hover:bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Entfernen"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-zinc-800">
              <button
                onClick={startStudy}
                disabled={figures.length === 0}
                className="w-full px-4 py-3 rounded-xl bg-green-700 hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold transition-colors"
              >
                Fertig ({figures.length})
              </button>
            </div>
          </aside>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInput}
        />
      </main>
    );
  }

  // ---- STUDY MODE ----
  const showCard = current && current.status === 'done' && currentAssoc;
  const isFigureLoading = current?.status === 'loading' || current?.status === 'pending';
  const isLearned = current?.status === 'learned';
  const ideaBusy = current?.ideaLoading ?? false;
  const learnedCount = figures.filter((f) => f.status === 'learned').length;
  const progress = figures.length > 0 ? (learnedCount / figures.length) * 100 : 0;

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-lg font-bold text-zinc-100">TMS Figuren Trainer</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">
            <span className="text-green-400 font-medium">{learnedCount}</span> /{' '}
            {figures.length} gelernt
          </span>
          <button
            onClick={() => setMode('select')}
            className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Auswahl bearbeiten
          </button>
        </div>
      </header>

      <div className="h-1 bg-zinc-800">
        <div
          className="h-full bg-green-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex gap-2 px-6 py-3 overflow-x-auto border-b border-zinc-800">
        {figures.map((fig, i) => (
          <button
            key={fig.id}
            onClick={() => setCurrentIndex(i)}
            className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
              i === currentIndex
                ? 'border-orange-500 scale-110'
                : fig.status === 'learned'
                  ? 'border-green-600'
                  : 'border-zinc-700'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fig.imageUrl}
              alt={`Figur ${i + 1}`}
              className="w-full h-full object-contain bg-white"
            />
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-6">
        <div className="text-sm text-zinc-500 font-medium">
          Figur {currentIndex + 1} / {figures.length}
        </div>

        <div className="relative">
          {isFigureLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-zinc-900/90 z-10">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
              <span className="text-sm text-zinc-400">Analysiere Figur...</span>
            </div>
          )}
          {current && (
            <FigureCard
              imageUrl={current.imageUrl}
              status={current.status}
              overlaySvg={currentAssoc?.svg}
              overlayLoading={current.overlayLoading}
            />
          )}
        </div>

        <div className="w-full max-w-md min-h-[7rem] flex flex-col items-center text-center">
          {ideaBusy ? (
            <div className="flex items-center gap-2 text-zinc-400 mt-4">
              <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Hole neue Idee...</span>
            </div>
          ) : showCard && currentAssoc ? (
            <>
              <h2 className="text-2xl font-bold text-zinc-100">{currentAssoc.name}</h2>
              <p className="mt-2 text-zinc-400 leading-relaxed">{currentAssoc.explanation}</p>
              <div
                className="mt-3 flex gap-0.5"
                aria-label={`Einprägsamkeit ${currentAssoc.memorability} von 5`}
              >
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={`text-base ${
                      i < currentAssoc.memorability ? 'text-orange-400' : 'text-zinc-700'
                    }`}
                  >
                    ★
                  </span>
                ))}
              </div>
            </>
          ) : isLearned ? (
            <div className="mt-4">
              <div className="text-3xl mb-1">🎉</div>
              <p className="text-green-400 font-semibold">Gelernt!</p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={markLearned}
            disabled={!current || isFigureLoading || isLearned}
            className="px-5 py-2.5 rounded-xl bg-green-700 text-white hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-semibold"
          >
            ✓ Gelernt
          </button>
          <button
            onClick={requestNewIdea}
            disabled={!showCard || ideaBusy || isLearned}
            className="px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-semibold"
          >
            🔄 Neue Idee
          </button>
        </div>

        <div className="text-xs text-zinc-600 text-center leading-relaxed">
          Leertaste = gelernt · N = neue Idee · ← → andere Figur
        </div>
      </div>
    </main>
  );
}
