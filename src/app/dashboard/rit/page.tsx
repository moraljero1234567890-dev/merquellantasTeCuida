"use client";

import { useEffect, useRef, useState } from 'react';
import DashboardNavbar from '../navbar';
import { ShieldAlert } from 'lucide-react';

export default function RITPage() {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/rit')
      .then(res => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      })
      .catch(() => setError(true));

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Block Ctrl+S / Ctrl+P globally on this page
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p')) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', block);
    return () => window.removeEventListener('keydown', block);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNavbar activePage="rit" />

      <main className="pt-20 sm:pt-24 pb-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">Reglamento Interno de Trabajo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Versión 2026 — Merquellantas</p>
        </div>

        {error ? (
          <div className="flex items-center gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700">
            <ShieldAlert className="h-6 w-6 flex-shrink-0" />
            <p className="text-sm font-medium">No se pudo cargar el documento. Verifica tu sesión e intenta de nuevo.</p>
          </div>
        ) : !blobUrl ? (
          <div className="w-full h-[80vh] rounded-2xl bg-gray-100 animate-pulse" />
        ) : (
          // Wrapper with overlay that blocks right-click and context menu
          <div
            className="relative w-full rounded-2xl overflow-hidden shadow-lg border border-gray-200"
            style={{ height: 'calc(100vh - 160px)' }}
            onContextMenu={e => e.preventDefault()}
          >
            <iframe
              src={blobUrl}
              className="w-full h-full"
              title="Reglamento Interno de Trabajo 2026"
              sandbox="allow-scripts allow-same-origin"
            />
            {/* Transparent overlay to intercept right-click / drag */}
            <div
              ref={overlayRef}
              className="absolute inset-0 pointer-events-none select-none"
              onContextMenu={e => e.preventDefault()}
              style={{ zIndex: 10, userSelect: 'none' }}
            />
          </div>
        )}

        <p className="mt-3 text-[11px] text-gray-400 text-center">
          Este documento es de uso interno y confidencial de Merquellantas. Queda prohibida su reproducción o distribución.
        </p>
      </main>
    </div>
  );
}
