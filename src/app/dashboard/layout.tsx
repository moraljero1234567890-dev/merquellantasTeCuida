import React from 'react';
import BienestarChat from './components/chat';
import ExternoGuard from './ExternoGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ExternoGuard>{children}</ExternoGuard>
      <BienestarChat />
    </>
  );
}
