"use client";

import { useEffect, useRef, useState } from "react";

export default function PDFViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

        const res = await fetch(url);
        if (!res.ok) throw new Error("fetch failed");
        const buffer = await res.arrayBuffer();

        const pdf = await pdfjs.getDocument({ data: buffer }).promise;

        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";

        for (let num = 1; num <= pdf.numPages; num++) {
          if (cancelled) break;
          const page = await pdf.getPage(num);
          const dpr = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: dpr * 1.5 });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = "block";
          canvas.style.width = "100%";
          canvas.style.marginBottom = num < pdf.numPages ? "8px" : "0";
          canvas.draggable = false;

          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;

          if (containerRef.current && !cancelled) {
            containerRef.current.appendChild(canvas);
            if (num === 1) setLoading(false);
          }
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="relative w-full h-full">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-2xl">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm">Cargando documento…</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-2xl">
          <p className="text-sm text-red-500">No se pudo cargar el documento.</p>
        </div>
      )}

      {/* Pages rendered as canvas — no native browser PDF toolbar */}
      <div
        ref={containerRef}
        className="w-full"
        onContextMenu={(e) => e.preventDefault()}
        style={{ userSelect: "none", WebkitUserSelect: "none" }}
      />

      {/* Transparent overlay blocks right-click without interrupting scroll */}
      <div
        className="absolute inset-0 z-10"
        style={{ pointerEvents: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
