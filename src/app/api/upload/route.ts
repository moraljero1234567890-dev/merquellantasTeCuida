import { NextRequest, NextResponse } from 'next/server';
import { GridFSBucket } from 'mongodb';
import { Readable } from 'stream';
import { getDb } from '../../../lib/db';
import { auth } from '../../../lib/auth';

export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.webm', '.mov',
]);

// POST /api/upload — upload a file, store in MongoDB GridFS
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const folder = (formData.get('folder') as string) || 'uploads';

  if (!file) {
    return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'El archivo excede el tamaño máximo de 50MB' }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 });
  }

  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 });
  }

  // Auto-cleanup windows: calendar media lives 2 days, shop-followup photos
  // live 2 weeks (the admin page also purges these on load). Everything else
  // is kept indefinitely.
  const expiresAt =
    folder === 'calendar'
      ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      : folder === 'shop-followup'
        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        : null;

  const db = await getDb();
  const bucket = new GridFSBucket(db, { bucketName: 'uploads' });

  const buffer = Buffer.from(await file.arrayBuffer());
  const readable = Readable.from(buffer);

  const uploadStream = bucket.openUploadStream(file.name, {
    metadata: {
      contentType: file.type || 'application/octet-stream',
      folder,
      uploaded_by: session.user.id,
      uploaded_at: new Date(),
      expires_at: expiresAt,
    },
  });

  await new Promise<void>((resolve, reject) => {
    readable.pipe(uploadStream)
      .on('error', reject)
      .on('finish', () => resolve());
  });

  const fileId = uploadStream.id.toString();
  const fileUrl = `/api/upload/${fileId}`;

  return NextResponse.json({
    url: fileUrl,
    webUrl: fileUrl,
    name: file.name,
    id: fileId,
  });
}
