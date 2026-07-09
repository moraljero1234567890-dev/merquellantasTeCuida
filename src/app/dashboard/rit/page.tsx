"use client";

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import DashboardNavbar from '../navbar';
import { ShieldAlert } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const PDFViewer = dynamic(() => import('./PDFViewer'), { ssr: false });

export default function RITPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/auth/login');
  }, [status, router]);

  // Block Ctrl+S / Ctrl+P on this page
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p')) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', block);
    return () => window.removeEventListener('keydown', block);
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNavbar activePage="rit" />
        <main className="pt-20 sm:pt-24 px-4 max-w-7xl mx-auto">
          <div className="w-full rounded-2xl bg-gray-100 animate-pulse" style={{ height: 'calc(100vh - 160px)' }} />
        </main>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700">
          <ShieldAlert className="h-6 w-6 flex-shrink-0" />
          <p className="text-sm font-medium">No tienes acceso a este documento.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNavbar activePage="rit" />

      <main className="pt-20 sm:pt-24 pb-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">Reglamento Interno de Trabajo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Versión 2026 — Merquellantas</p>
        </div>

        <div
          className="relative w-full rounded-2xl overflow-y-auto shadow-lg border border-gray-200 bg-gray-100"
          style={{ height: 'calc(100vh - 160px)' }}
          onContextMenu={e => e.preventDefault()}
        >
          <PDFViewer url="/api/rit" />
        </div>

        <p className="mt-3 text-[11px] text-gray-400 text-center">
          Documento de uso interno y confidencial. Prohibida su reproducción o distribución.
        </p>
      </main>
    </div>
  );
}
