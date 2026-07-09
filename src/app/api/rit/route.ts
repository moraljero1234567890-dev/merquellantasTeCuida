import { NextResponse } from 'next/server';
import { auth } from '../../../lib/auth';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const filePath = join(process.cwd(), 'private', 'rit.pdf');
  const fileBuffer = readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="reglamento-interno.pdf"',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
