"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CompareViewProps {
  originalUrl: string;
  referenceUrl: string | null;
  resultImage: string;
}

const LOUPE_SIZE = 160;
const ZOOM = 2.5;

/** Cursor position normalized to the image content (0–1 in both axes). */
interface LoupePos {
  x: number;
  y: number;
}

/** Rendered box of an object-contain image inside its element. */
function getContentBox(img: HTMLImageElement) {
  const rect = img.getBoundingClientRect();
  const { naturalWidth, naturalHeight } = img;
  if (!naturalWidth || !naturalHeight) return null;
  const scale = Math.min(
    rect.width / naturalWidth,
    rect.height / naturalHeight
  );
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    left: (rect.width - width) / 2,
    top: (rect.height - height) / 2,
    width,
    height,
    rect,
  };
}

interface MagnifiedImageProps {
  src: string;
  alt: string;
  pos: LoupePos | null;
  onMove: (pos: LoupePos | null) => void;
}

type ContentBox = NonNullable<ReturnType<typeof getContentBox>>;

function MagnifiedImage({ src, alt, pos, onMove }: MagnifiedImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<Omit<ContentBox, "rect"> | null>(null);

  const updateBox = useCallback(() => {
    const img = imgRef.current;
    setBox(img ? getContentBox(img) : null);
  }, []);

  useEffect(() => {
    // rAF so the measurement happens outside the effect body (cached images
    // never fire onLoad after hydration, so mount-time measurement is needed).
    const raf = requestAnimationFrame(updateBox);
    window.addEventListener("resize", updateBox);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateBox);
    };
  }, [updateBox, src]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const img = imgRef.current;
      if (!img) return;
      const fresh = getContentBox(img);
      if (!fresh) return;
      const x = (e.clientX - fresh.rect.left - fresh.left) / fresh.width;
      const y = (e.clientY - fresh.rect.top - fresh.top) / fresh.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) {
        onMove(null);
      } else {
        onMove({ x, y });
      }
    },
    [onMove]
  );

  const handleMouseLeave = useCallback(() => onMove(null), [onMove]);

  return (
    <div
      className="relative w-full h-full cursor-crosshair"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={updateBox}
        className="w-full h-[400px] object-contain"
      />
      {pos && box && (
        <div
          className="pointer-events-none absolute rounded-full border-2 border-white shadow-lg ring-1 ring-gray-300"
          style={{
            width: LOUPE_SIZE,
            height: LOUPE_SIZE,
            left: box.left + pos.x * box.width - LOUPE_SIZE / 2,
            top: box.top + pos.y * box.height - LOUPE_SIZE / 2,
            backgroundImage: `url(${src})`,
            backgroundRepeat: "no-repeat",
            backgroundColor: "white",
            backgroundSize: `${box.width * ZOOM}px ${box.height * ZOOM}px`,
            backgroundPosition: `${LOUPE_SIZE / 2 - pos.x * box.width * ZOOM}px ${
              LOUPE_SIZE / 2 - pos.y * box.height * ZOOM
            }px`,
          }}
        />
      )}
    </div>
  );
}

export default function CompareView({
  originalUrl,
  referenceUrl,
  resultImage,
}: CompareViewProps) {
  const [loupePos, setLoupePos] = useState<LoupePos | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
          Оригінал
        </span>
        <div className="w-full border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm flex-1">
          <MagnifiedImage
            src={originalUrl}
            alt="Оригінал"
            pos={loupePos}
            onMove={setLoupePos}
          />
        </div>
        {referenceUrl && (
          <div className="flex flex-col items-center gap-1 mt-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Референс
            </span>
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={referenceUrl}
                alt="Референс"
                className="w-24 h-24 object-contain"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
          Результат
        </span>
        <div className="w-full border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm flex-1">
          <MagnifiedImage
            src={resultImage}
            alt="Результат"
            pos={loupePos}
            onMove={setLoupePos}
          />
        </div>
      </div>
    </div>
  );
}
