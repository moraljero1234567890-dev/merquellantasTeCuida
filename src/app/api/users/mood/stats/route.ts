import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '../../../../../lib/db';
import { auth } from '../../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/users/mood/stats?days=90  (admin)
 *   Returns:
 *     - `checkins` — raw mood_checkins documents (bounded by `days`, capped at 5000)
 *     - `userSummaries` — one entry per user with their latest mood + consecutive-triste
 *       streak (counted across distinct days, resets on a non-triste check-in).
 *
 * All aggregation is done here so the admin UI can render without refetching.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days') || 90)));
  const since = new Date(Date.now() - days * 86400000);

  const db = await getDb();
  const checkins = await db
    .collection('mood_checkins')
    .find({ created_at: { $gte: since } })
    .sort({ created_at: -1 })
    .limit(5000)
    .toArray();

  // Group check-ins by user, newest first in each group.
  const byUser = new Map<string, typeof checkins>();
  for (const c of checkins) {
    const key = (c.user_id as string) || (c.cedula as string) || '';
    if (!key) continue;
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key)!.push(c);
  }

  // Compute streak of consecutive distinct days with `mood === 'triste'` ending on the
  // latest check-in. A gap of more than 2 calendar days between triste check-ins breaks
  // the streak so we don't rubber-band across long absences.
  function consecutiveTristeDays(rows: typeof checkins): number {
    if (rows.length === 0) return 0;
    // Reduce to one entry per calendar day (most recent).
    const byDay = new Map<string, string>();
    for (const r of rows) {
      const d = new Date(r.created_at as Date);
      const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth()).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      if (!byDay.has(day)) byDay.set(day, String(r.mood));
    }
    const sorted = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
    let streak = 0;
    let prevDayMs: number | null = null;
    for (const [dayKey, mood] of sorted) {
      if (mood !== 'triste') break;
      const [y, m, d] = dayKey.split('-').map(Number);
      const ms = Date.UTC(y, m, d);
      if (prevDayMs !== null && prevDayMs - ms > 2 * 86400000) break;
      streak++;
      prevDayMs = ms;
    }
    return streak;
  }

  const userSummaries = [...byUser.entries()].map(([key, rows]) => {
    const latest = rows[0];
    // rows are newest-first, so the first triste row is the most recent one.
    const tristeRows = rows.filter((r) => r.mood === 'triste');
    const latestTriste = tristeRows[0];
    return {
      user_id: latest.user_id ?? null,
      cedula: latest.cedula ?? null,
      nombre: latest.nombre ?? '',
      email: latest.email ?? '',
      cargo: latest.cargo ?? '',
      area: latest.area ?? '',
      departamento: latest.departamento ?? '',
      latest_mood: latest.mood as string,
      latest_note: latest.note ?? null,
      latest_help_topic: latest.help_topic ?? null,
      latest_at: latest.created_at,
      checkin_count: rows.length,
      consecutive_triste: consecutiveTristeDays(rows),
      // How many times this user has reported "triste" in the window, plus the
      // most recent sad check-in itself — so the admin card can surface anyone
      // who has been sad even once (not only on consecutive days).
      triste_count: tristeRows.length,
      latest_triste_at: latestTriste?.created_at ?? null,
      latest_triste_note: latestTriste?.note ?? null,
      _groupKey: key,
    };
  });

  return NextResponse.json({
    days,
    since,
    checkins: checkins.map((c) => ({
      id: c._id.toString(),
      user_id: c.user_id ?? null,
      cedula: c.cedula ?? null,
      nombre: c.nombre ?? '',
      cargo: c.cargo ?? '',
      area: c.area ?? '',
      departamento: c.departamento ?? '',
      mood: c.mood,
      note: c.note ?? null,
      help_topic: c.help_topic ?? null,
      created_at: c.created_at,
    })),
    userSummaries,
  });
}
