import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfjs-dist', '@react-pdf/renderer', 'puppeteer-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/certificados/**': ['./data/templates/**'],
    // @sparticuz/chromium reads its brotli-packed binary from bin/ via fs at
    // runtime, which the tracer can't see — include it explicitly so the
    // conti lambdas ship with the Chromium executable.
    '/api/conti/**': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '55mb',
    },
  },
};

export default nextConfig;
