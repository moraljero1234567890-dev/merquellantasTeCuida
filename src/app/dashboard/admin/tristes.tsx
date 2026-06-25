"use client";

import { useState, useEffect } from "react";
import {
  AlertCircle,
  Frown,
  Clock,
  CheckCircle,
  Loader2,
  MessageSquare,
} from "lucide-react";

interface UserSummary {
  user_id: string | null;
  cedula: string | null;
  nombre: string;
  email: string;
  cargo: string;
  area: string;
  departamento: string;
  latest_mood: "feliz" | "neutral" | "triste";
  latest_note: string | null;
  latest_help_topic: string | null;
  latest_at: string;
  checkin_count: number;
  consecutive_triste: number;
  triste_count: number;
  latest_triste_at: string | null;
  latest_triste_note: string | null;
}

interface SadWorker {
  id: string;
  name: string;
  position: string;
  department: string;
  sadCount: number;
  avatar: string;
  avatarColor: string;
  email: string;
  lastMoodDate: Date;
  latestNote: string | null;
}

function avatarInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function avatarColor(i: number) {
  const palette = [
    "bg-blue-100 text-blue-600",
    "bg-green-100 text-green-600",
    "bg-purple-100 text-purple-600",
    "bg-pink-100 text-pink-600",
    "bg-yellow-100 text-yellow-600",
    "bg-indigo-100 text-indigo-600",
    "bg-red-100 text-red-600",
    "bg-orange-100 text-orange-600",
  ];
  return palette[i % palette.length];
}

export default function TristesCard() {
  const [sadWorkers, setSadWorkers] = useState<SadWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSadWorkers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/users/mood/stats?days=30");
      if (!res.ok) throw new Error("Error fetching mood stats");
      const data = await res.json();
      const summaries = (data.userSummaries as UserSummary[]) || [];

      const workers: SadWorker[] = summaries
        .filter((u) => u.triste_count > 0)
        .sort(
          (a, b) =>
            b.triste_count - a.triste_count ||
            new Date(b.latest_triste_at ?? b.latest_at).getTime() -
              new Date(a.latest_triste_at ?? a.latest_at).getTime(),
        )
        .map((u, i) => ({
          id: u.user_id || u.cedula || u.nombre,
          name: u.nombre || "Usuario sin nombre",
          position: u.cargo || "Sin cargo",
          department: u.departamento || u.area || "Sin departamento",
          sadCount: u.triste_count,
          avatar: avatarInitials(u.nombre || "NN"),
          avatarColor: avatarColor(i),
          email: u.email || "",
          lastMoodDate: new Date(u.latest_triste_at ?? u.latest_at),
          latestNote: u.latest_triste_note ?? u.latest_note,
        }));

      setSadWorkers(workers);
    } catch (err) {
      console.error(err);
      setError("Error al cargar los datos de trabajadores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSadWorkers();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center mb-5">
          <Frown className="h-5 w-5 mr-2 text-red-500" />
          Trabajadores Tristes
        </h2>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Cargando trabajadores...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-gray-900 flex items-center">
            <Frown className="h-5 w-5 mr-2 text-red-500" />
            Trabajadores Tristes
          </h2>
          <button onClick={fetchSadWorkers} className="text-sm text-gray-500 hover:text-gray-700 flex items-center">
            <Clock className="h-4 w-4 mr-1" /> Actualizar
          </button>
        </div>
        <div className="flex items-center justify-center py-8">
          <AlertCircle className="h-6 w-6 text-red-400" />
          <span className="ml-2 text-red-500">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-lg font-bold text-gray-900 flex items-center">
          <Frown className="h-5 w-5 mr-2 text-red-500" />
          Trabajadores Tristes ({sadWorkers.length})
        </h2>
        <button onClick={fetchSadWorkers} className="text-sm text-gray-500 hover:text-gray-700 flex items-center">
          <Clock className="h-4 w-4 mr-1" /> Actualizar
        </button>
      </div>

      <div className="space-y-4">
        {sadWorkers.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
            <p className="text-gray-500">
              No hay trabajadores tristes por el momento.
            </p>
          </div>
        ) : (
          sadWorkers.map((w) => (
            <div
              key={w.id}
              className="p-3 rounded-xl hover:bg-gray-50 transition-colors border border-gray-100 hover:border-red-200 hover:shadow-sm"
            >
              <div className="flex items-center">
                <div className={`w-10 h-10 rounded-full ${w.avatarColor} flex items-center justify-center font-medium`}>
                  {w.avatar}
                </div>
                <div className="flex-1 ml-3 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">{w.name}</h3>
                  <p className="text-xs text-gray-500 truncate">
                    {w.position} · {w.department}
                  </p>
                  {w.email && <p className="text-xs text-gray-400 truncate">{w.email}</p>}
                </div>
                <div className="flex-shrink-0">
                  <div className="px-3 py-1 flex items-center rounded-full bg-red-100 text-sm font-medium text-red-800">
                    <Frown className="h-3.5 w-3.5 mr-1.5" />
                    {w.sadCount} {w.sadCount === 1 ? "vez" : "veces"}
                  </div>
                </div>
              </div>
              {w.latestNote && (
                <div className="mt-2 flex items-start gap-2 bg-red-50/50 border-l-2 border-red-300 pl-2 py-1 pr-2 rounded-r">
                  <MessageSquare className="h-3 w-3 mt-0.5 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-gray-700 italic line-clamp-2">
                    &ldquo;{w.latestNote}&rdquo;
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
