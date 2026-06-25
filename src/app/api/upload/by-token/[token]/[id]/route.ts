import { NextRequest, NextResponse } from 'next/server';
import { GridFSBucket, ObjectId } from 'mongodb';
import { getDb } from '../../../../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TOKEN_PATTERN = /^[a-f0-9]{32,128}$/i;

function isExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

/** Pull the 24-char GridFS ObjectId out of a stored document url (e.g. "/api/upload/<id>"). */
function extractFileId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/([a-f0-9]{24})/i);
  return m ? m[1] : null;
}

/**
 * GET /api/upload/by-token/:token/:id — serve a stored file to an approver.
 *
 * The token is the credential (no session required), mirroring the public
 * approval page at /aprobar-solicitud/[token]. Access is scoped: a token only
 * unlocks the files attached to *its own* solicitud, so a valid approver can
 * always open the attachments they need to decide — regardless of role.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;

  if (!token || !TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 404 });
  }
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const db = await getDb();

  // Resolve the solicitud the token belongs to.
  const doc = await db.collection('solicitudes').findOne({ approval_token: token });
  if (!doc) {
    return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
  }
  if (isExpired(doc.approval_token_expires_at as Date | null | undefined)) {
    return NextResponse.json({ error: 'El enlace ha expirado' }, { status: 410 });
  }

  // Verify the requested file is actually one of this solicitud's attachments.
  const allowedIds = new Set<string>();
  if (Array.isArray(doc.document_urls)) {
    for (const d of doc.document_urls) {
      const fid = extractFileId(d?.url);
      if (fid) allowedIds.add(fid);
    }
  }
  const legacyId = extractFileId(doc.document_url as string | null | undefined);
  if (legacyId) allowedIds.add(legacyId);

  if (!allowedIds.has(id)) {
    return NextResponse.json({ error: 'Archivo no autorizado' }, { status: 403 });
  }

  const objectId = new ObjectId(id);
  const download = req.nextUrl.searchParams.get('download') === '1';

  // Try GridFS first.
  const gridFile = await db.collection('uploads.files').findOne({ _id: objectId });
  if (gridFile) {
    const bucket = new GridFSBucket(db, { bucketName: 'uploads' });
    const downloadStream = bucket.openDownloadStream(objectId);

    const disposition = download ? 'attachment' : 'inline';
    const headers: Record<string, string> = {
      'Content-Type': gridFile.metadata?.contentType || gridFile.contentType || 'application/octet-stream',
      'Content-Length': String(gridFile.length),
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(gridFile.filename)}"`,
    };

    const webStream = new ReadableStream({
      start(controller) {
        downloadStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        downloadStream.on('end', () => controller.close());
        downloadStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        downloadStream.destroy();
      },
    });

    return new NextResponse(webStream, { status: 200, headers });
  }

  // Legacy base64 fallback.
  const file = await db.collection('file_uploads').findOne({ _id: objectId });
  if (!file) {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }

  const buffer = Buffer.from(file.data, 'base64');
  const headers: Record<string, string> = {
    'Content-Type': file.mimeType || 'application/octet-stream',
    'Content-Length': buffer.length.toString(),
    'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(file.name)}"`,
  };

  return new NextResponse(buffer, { status: 200, headers });
}
