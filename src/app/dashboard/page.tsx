"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import DashboardNavbar from './navbar';
import { useRouter } from 'next/navigation';
import {
  Calendar, DollarSign, Briefcase, ChevronRight, Clock, MessageSquare, FileText, Activity, User, CheckCircle,
  PersonStanding,
  ChevronLeft,
  LayoutDashboard,
  UserCircle2,
  X,
} from 'lucide-react';
import Solicitudes from "./components/solicitudes";
import AdminPage from './admin/page';
import EventWall from './components/EventWall';
import { useSession } from 'next-auth/react'
import { getIcon } from './admin/quickActionIcons';

interface DynamicQuickAction {
  id: string;
  title: string;
  href: string;
  icon: string;
  order: number;
  active: boolean;
}
interface CalendarEvent {
  id?: string;
  title: string;
  description: string;
  image: string;
  date: string;
  type?: string;
  videoUrl?: string;
  videoPath?: string;
  user_id?: string | null;
}

interface PendingRequest {
  id: string;
  tipo: 'cesantias' | 'enfermedad' | 'permiso';
  createdAt: string;
  estado: string;
  motivoRespuesta?: string;
}

interface MyPqrsf {
  _id: string;
  type: string;
  message: string;
  is_anonymous: boolean;
  created_at: string;
  respuesta?: string | null;
  respondido_at?: string | null;
}

interface UserProfile {
  nombre: string;
  rol: string;
  antiguedad: number;
  antiguedadMeses: number;
  posicion: string;
  dpto: string;
  eps: string;
  banco: string;
  pensiones: string;
  arl: string;
  cedula: string;
  email: string;
  tipoDocumento: string;
  fechaNacimiento: string;
  fechaIngreso: string;
  cargo: string;
  area: string;
  contrato: string;
  claseRiesgo: string;
  tipoCuenta: string;
  numeroCuenta: string;
  caja: string;
  cesantias: string;
}

interface UserData {
  nombre: string;
  rol: string;
  posicion: string;
  antiguedad: number | string; // Can be Excel date number or regular number
  extra?: {
    "Nombre Área Funcional"?: string;
    "EPS"?: string;
    "Banco"?: string;
    "FONDO DE PENSIONES"?: string;
    "ARL"?: string;
    "Fecha Ingreso"?: number | string; // Excel date number or date string
  };
}

const Dashboard = () => {
  const [showSolicitudes, setShowSolicitudes] = useState(false);
  const [userRole, setUserRole] = useState<string>("user");
  const [adminView, setAdminView] = useState<boolean>(true);
  const [requestsTab, setRequestsTab] = useState<'activas' | 'respondidas'>('activas');
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  // Carousel position: regular users browse up to 3 upcoming events, but the
  // reactions wall (hearts + stickies) only shows on the closest one.
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  // Pending requests state
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  // My PQRSF state
  const [myPqrsf, setMyPqrsf] = useState<MyPqrsf[]>([]);
  const [loadingMyPqrsf, setLoadingMyPqrsf] = useState(true);
  const [selectedPqrsf, setSelectedPqrsf] = useState<MyPqrsf | null>(null);

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Vacations balance
  const [vacation, setVacation] = useState<{
    days: number | null;
    as_of_date: string | null;
    scraped_at: string | null;
    stale: boolean;
  } | null>(null);
  const [loadingVacation, setLoadingVacation] = useState(true);

  // Upcoming events state
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // Dynamic quick actions from API
  const [dynamicActions, setDynamicActions] = useState<DynamicQuickAction[] | null>(null);

const [todayEventsCount, setTodayEventsCount] = useState(0);
const [additionalTodayEvents, setAdditionalTodayEvents] = useState<CalendarEvent[]>([]);
const [showTodayPopup, setShowTodayPopup] = useState(false);
const [todayPopupEvents, setTodayPopupEvents] = useState<CalendarEvent[]>([]);
const [popupAnimating, setPopupAnimating] = useState(false);

// Helper function to add one day to a date
const addOneDay = (date: Date) => {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + 1);
  return newDate;
};

// Helper function to convert Excel date number to JavaScript Date
const convertExcelDateToJSDate = (excelDate: number | string): Date => {
  if (typeof excelDate === 'string') {
    // If it's already a string, try to parse it as a date
    const parsed = new Date(excelDate);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    // If parsing fails, try to convert to number
    const num = parseFloat(excelDate);
    if (!isNaN(num)) {
      excelDate = num;
    } else {
      return new Date(); // fallback to current date
    }
  }
  
  if (typeof excelDate === 'number') {
    // Excel date calculation: days since January 1, 1900
    // Note: Excel incorrectly treats 1900 as a leap year, so we subtract 2 days
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const excelEpoch = new Date(1900, 0, 1); // January 1, 1900
    const jsDate = new Date(excelEpoch.getTime() + (excelDate - 2) * millisecondsPerDay);
    return jsDate;
  }
  
  return new Date(); // fallback
};

// Helper function to calculate years of service
const calculateYearsOfService = (startDate: Date): number => {
  const today = new Date();
  const diffTime = today.getTime() - startDate.getTime();
  const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25); // Account for leap years
  return Math.floor(diffYears);
};

// Total full months between start and today
const calculateMonthsOfService = (startDate: Date): number => {
  const today = new Date();
  let months = (today.getFullYear() - startDate.getFullYear()) * 12;
  months += today.getMonth() - startDate.getMonth();
  if (today.getDate() < startDate.getDate()) months -= 1;
  return Math.max(0, months);
};

// Format YYYY-MM-DD / ISO / Excel serial into a Spanish date label
const formatSpanishDate = (value: unknown): string => {
  if (value == null || value === '') return '';
  let d: Date | null = null;
  if (typeof value === 'number') {
    d = convertExcelDateToJSDate(value);
  } else if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const [y, m, day] = value.slice(0, 10).split('-').map(Number);
      d = new Date(y, (m || 1) - 1, day || 1);
    } else {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  } else if (value instanceof Date) {
    d = value;
  }
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};

const maskAccount = (value: string): string => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

// Helper function to determine if an event is happening today (after adding one day)
const isEventToday = (eventDate: Date) => {
  const adjustedDate = eventDate;
  const today = new Date();
  return adjustedDate.toDateString() === today.toDateString();
};

const getEventStatus = (event: CalendarEvent) => {
  const eventDate = new Date(event.date);
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const eventDateOnly = new Date(eventDate);
  eventDateOnly.setHours(0, 0, 0, 0);

  // For birthdays, check if it's today based on month and day
  if (event.type === 'cumpleaños' || event.type === 'birthday' || event.title.toLowerCase().includes('cumpleaños')) {
    const isBirthdayToday =
      eventDate.getDate() === today.getDate() &&
      eventDate.getMonth() === today.getMonth();

    if (isBirthdayToday) {
      return { status: 'today', label: 'Hoy', color: 'bg-green-500' };
    } else if (eventDateOnly > today) {
      return { status: 'upcoming', label: 'Próximo', color: 'bg-[#f4a900]' };
    }
  }

  // For regular events
  if (eventDateOnly.getTime() === today.getTime()) {
    const originalDate = new Date(event.date);
    const isAllDay = originalDate.getHours() === 0 && originalDate.getMinutes() === 0 && originalDate.getSeconds() === 0;
    if (isAllDay || eventDate > now) {
      return { status: 'today', label: 'Hoy', color: 'bg-green-500' };
    } else {
      return { status: 'happening', label: 'En curso', color: 'bg-blue-500' };
    }
  } else if (eventDateOnly > today) {
    return { status: 'upcoming', label: 'Próximo', color: 'bg-[#f4a900]' };
  }
  return { status: 'past', label: 'Pasado', color: 'bg-gray-500' };
};

  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  // Auth check — redirect to login if unauthenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.replace('/auth/login');
    }
  }, [sessionStatus, router]);

  // Load pending requests
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;

    async function fetchRequests() {
      setLoadingRequests(true);
      try {
        const [cesRes, solRes] = await Promise.all([
          fetch('/api/cesantias'),
          fetch('/api/solicitudes'),
        ]);

        const cesData = cesRes.ok ? await cesRes.json() : [];
        const solData = solRes.ok ? await solRes.json() : [];

        const ces: PendingRequest[] = (Array.isArray(cesData) ? cesData : []).map((d: Record<string, unknown>) => ({
          id: String(d.id),
          tipo: 'cesantias' as const,
          createdAt: d.created_at as string,
          estado: d.estado as string,
          motivoRespuesta: (d.motivo_respuesta as string | undefined),
        }));
        const sol: PendingRequest[] = (Array.isArray(solData) ? solData : []).map((d: Record<string, unknown>) => ({
          id: String(d.id),
          tipo: d.tipo as 'enfermedad' | 'permiso',
          createdAt: d.created_at as string,
          estado: d.estado as string,
          motivoRespuesta: (d.motivo_respuesta as string | undefined),
        }));

        const all = [...ces, ...sol].sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setPendingRequests(all);
      } catch (err) {
        console.error('Error loading pending requests', err);
        setPendingRequests([]);
      } finally {
        setLoadingRequests(false);
      }
    }

    fetchRequests();
  }, [sessionStatus]);

  // Fetch user's PQRSF history
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    let mounted = true;

    async function fetchMyPqrsf() {
      setLoadingMyPqrsf(true);
      try {
        // mine=true forces server to filter to the logged-in user only,
        // even if they're an admin (so admins don't see all PQRSFs here)
        const res = await fetch('/api/pqrsf?limit=100&mine=true');
        if (!mounted) return;
        if (res.ok) {
          const data = await res.json();
          setMyPqrsf(Array.isArray(data) ? data : []);
        }
      } catch {
        if (mounted) setMyPqrsf([]);
      } finally {
        if (mounted) setLoadingMyPqrsf(false);
      }
    }

    fetchMyPqrsf();
    return () => { mounted = false; };
  }, [sessionStatus]);

// Normaliza una fecha de cumpleaños al próximo cumpleaños válido
const normalizeBirthdayDate = (originalDate: Date): Date => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();

  const birthdayThisYear = new Date(
    currentYear,
    originalDate.getMonth(),
    originalDate.getDate()
  );

  birthdayThisYear.setHours(0, 0, 0, 0);

  // Si ya pasó este año (estrictamente), usar el siguiente. Hoy se mantiene.
  if (birthdayThisYear.getTime() < today.getTime()) {
    birthdayThisYear.setFullYear(currentYear + 1);
  }

  return birthdayThisYear;
};

const isBirthdayToday = (originalDate: Date): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const checkDate = new Date(originalDate);
  checkDate.setHours(0, 0, 0, 0);
  
  return (
    today.getDate() === checkDate.getDate() &&
    today.getMonth() === checkDate.getMonth()
  );
};

// Map raw DB calendar docs to frontend CalendarEvent (video_url → videoUrl, etc.)
const mapCalendarData = (raw: Record<string, unknown>[]): CalendarEvent[] =>
  raw.map(d => ({
    id: d._id ? String(d._id) : d.id ? String(d.id) : undefined,
    title: String(d.title || ''),
    description: String(d.description || ''),
    image: String(d.image || ''),
    date: String(d.date || ''),
    type: String(d.type || ''),
    videoUrl: String(d.video_url || d.videoUrl || ''),
    videoPath: String(d.video_path || d.videoPath || ''),
    user_id: d.user_id ? String(d.user_id) : d.userId ? String(d.userId) : null,
  }));

useEffect(() => {
  // Fire-and-forget cleanup of expired calendar media
  fetch('/api/cleanup').catch(() => {});

  async function fetchNextEvents() {
    try {
      setLoadingEvent(true);

      const res = await fetch('/api/calendar');
      const calendarData: CalendarEvent[] = res.ok ? mapCalendarData(await res.json()) : [];

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const events = calendarData
        .map(data => {
          const storedDate = new Date(data.date);
          const displayDate = addOneDay(storedDate);

          let comparisonDate: Date;

          if (
            data.type === 'cumpleaños' ||
            data.type === 'birthday' ||
            data.title.toLowerCase().includes('cumpleaños')
          ) {
            comparisonDate = normalizeBirthdayDate(displayDate);
          } else {
            comparisonDate = new Date(displayDate);
          }

          comparisonDate.setHours(0, 0, 0, 0);

          return {
            ...data,
            date: comparisonDate.toISOString(),
          };
        })
        .filter(evt => new Date(evt.date) >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 3);

      const todayEvents = events.filter(evt => {
        const evtDate = new Date(evt.date);
        evtDate.setHours(0, 0, 0, 0);
        return evtDate.getTime() === now.getTime();
      });

      setTodayEventsCount(todayEvents.length);

      if (todayEvents.length > 1) {
        setAdditionalTodayEvents(todayEvents.slice(1));
      } else {
        setAdditionalTodayEvents([]);
      }

      setNextEvent(events.length > 0 ? events[0] : null);
      setUpcomingEvents(events);

      // Show popup for today's events (once per login session per day)
      if (todayEvents.length > 0 && typeof window !== 'undefined') {
        const todayKey = new Date().toISOString().slice(0, 10);
        const popupKey = `todayPopup_${todayKey}`;
        if (!sessionStorage.getItem(popupKey)) {
          sessionStorage.setItem(popupKey, '1');
          setTodayPopupEvents(todayEvents);
          setShowTodayPopup(true);
          setTimeout(() => setPopupAnimating(true), 50);
        }
      }
    } catch (error) {
      console.error('Error fetching next events:', error);
      setNextEvent(null);
      setUpcomingEvents([]);
    } finally {
      setLoadingEvent(false);
    }
  }

  fetchNextEvents();
}, []);

  // Load user profile from API
  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      if (sessionStatus === 'unauthenticated') setProfile(null);
      return;
    }

    async function fetchProfile() {
      try {
        const res = await fetch('/api/users/me');
        if (!res.ok) return;
        const data = await res.json();

        const dpto = data.departamento ?? data.extra?.["Nombre Área Funcional"] ?? data.dpto ?? "";
        const eps = data.eps ?? data.extra?.["EPS"] ?? "";
        const banco = data.banco ?? data.extra?.["Banco"] ?? "";
        const pensiones = data.fondo_pensiones ?? data.extra?.["FONDO DE PENSIONES"] ?? data.pensiones ?? "";
        const arl = data.arl ?? data.extra?.["ARL"] ?? "";

        // Handle antiguedad calculation (prefer flat fecha_ingreso)
        let calculatedAntiguedad = 0;
        let calculatedMeses = 0;
        const rawFechaIngreso = data.fecha_ingreso ?? data.extra?.["Fecha Ingreso"];

        if (rawFechaIngreso) {
          const startDate = convertExcelDateToJSDate(rawFechaIngreso);
          calculatedAntiguedad = calculateYearsOfService(startDate);
          calculatedMeses = calculateMonthsOfService(startDate);
        } else if (data.antiguedad) {
          if (typeof data.antiguedad === 'number' && data.antiguedad > 1000) {
            const startDate = convertExcelDateToJSDate(data.antiguedad);
            calculatedAntiguedad = calculateYearsOfService(startDate);
            calculatedMeses = calculateMonthsOfService(startDate);
          } else {
            calculatedAntiguedad = typeof data.antiguedad === 'string'
              ? parseInt(data.antiguedad) || 0
              : data.antiguedad;
            calculatedMeses = calculatedAntiguedad * 12;
          }
        }

        setProfile({
          nombre: data.nombre || '',
          rol: data.rol || 'user',
          posicion: data.cargo_empleado || data.extra?.posicion || data.posicion || '',
          dpto,
          eps,
          banco,
          pensiones,
          arl,
          antiguedad: calculatedAntiguedad,
          antiguedadMeses: calculatedMeses,
          cedula: data.cedula || '',
          email: data.email || '',
          tipoDocumento: data.tipo_documento || '',
          fechaNacimiento: data.fecha_nacimiento || '',
          fechaIngreso: rawFechaIngreso ? String(rawFechaIngreso) : '',
          cargo: data.cargo_empleado || '',
          area: data.area || '',
          contrato: data.contrato || '',
          claseRiesgo: data.clase_riesgo || '',
          tipoCuenta: data.tipo_cuenta || '',
          numeroCuenta: data.numero_cuenta || '',
          caja: data.caja_compensacion || '',
          cesantias: data.fondo_cesantias || '',
        });
        setUserRole(data.rol || "user");
      } catch (err) {
        console.error('Error loading profile', err);
      }
    }

    fetchProfile();

    async function fetchVacation() {
      try {
        setLoadingVacation(true);
        const res = await fetch('/api/vacations/me');
        if (!res.ok) {
          setVacation(null);
          return;
        }
        const data = await res.json();
        setVacation({
          days: typeof data.days === 'number' ? data.days : null,
          as_of_date: data.as_of_date || null,
          scraped_at: data.scraped_at || null,
          stale: !!data.stale,
        });
      } catch (err) {
        console.error('Error loading vacation balance', err);
        setVacation(null);
      } finally {
        setLoadingVacation(false);
      }
    }

    fetchVacation();
  }, [sessionStatus]);

useEffect(() => {
  async function fetchUpcoming() {
    try {
      setLoadingEvents(true);

      const res = await fetch('/api/calendar');
      const calendarData: CalendarEvent[] = res.ok ? mapCalendarData(await res.json()) : [];

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const events = calendarData
        .map(data => {
          const storedDate = new Date(data.date);
          const displayDate = addOneDay(storedDate);

          let comparisonDate: Date;

          if (
            data.type === 'cumpleaños' ||
            data.type === 'birthday' ||
            data.title.toLowerCase().includes('cumpleaños')
          ) {
            comparisonDate = normalizeBirthdayDate(displayDate);
          } else {
            comparisonDate = new Date(displayDate);
          }

          comparisonDate.setHours(0, 0, 0, 0);

          return {
            ...data,
            date: comparisonDate.toISOString(),
          };
        })
        .filter(evt => new Date(evt.date) >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 3);

      setUpcomingEvents(events);
    } catch (e) {
      console.error('Error fetching upcoming:', e);
    } finally {
      setLoadingEvents(false);
    }
  }

  fetchUpcoming();
}, []);

useEffect(() => {
  async function fetchQuickActions() {
    try {
      const res = await fetch('/api/quick-actions');
      const data = res.ok ? await res.json() : [];
      const list: DynamicQuickAction[] = (Array.isArray(data) ? data : []).map((d: Record<string, unknown>) => ({
        id: String(d.id),
        title: d.title as string,
        href: d.href as string,
        icon: d.icon as string,
        order: d.order as number,
        active: d.active as boolean,
      }));
      setDynamicActions(list.filter(a => a.active));
    } catch (e) {
      console.error('Error loading quick actions:', e);
      setDynamicActions([]);
    }
  }
  fetchQuickActions();
}, []);

  // If flagged, render the solicitudes screen instead of the dashboard
  if (showSolicitudes) {
    return (
      <>
        <DashboardNavbar />
        <div className="pt-20 px-4 md:px-6 lg:px-8 max-w-7xl mx-auto">
          <button
            className="mb-4 flex items-center text-sm text-[#f4a900] hover:text-[#e68a00] transition-colors hover:underline group"
            onClick={() => setShowSolicitudes(false)}
          >
            <span className="mr-1 group-hover:-translate-x-1 transition-transform">&larr;</span> Volver al Dashboard
          </button>
<Solicitudes onClose={() => setShowSolicitudes(false)} />
          </div>
      </>
    );
  }

  // Format current date in Spanish
  const formattedDate = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Capitalize first letter of the formatted date
  const capitalizedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNavbar />

        {/* Today's event popup */}
        {showTodayPopup && todayPopupEvents.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
              className={`relative bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden transition-all duration-500 ${
                popupAnimating ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 translate-y-8'
              }`}
            >
              {/* Close button */}
              <button
                onClick={() => { setPopupAnimating(false); setTimeout(() => setShowTodayPopup(false), 300); }}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/80 hover:bg-white shadow-md transition-all"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>

              {/* Merquito header */}
              <div className="bg-gradient-to-r from-[#f4a900] to-[#ffb347] p-6 flex items-center gap-4">
                <div className={`flex-shrink-0 transition-all duration-700 ${popupAnimating ? 'translate-x-0 opacity-100' : '-translate-x-12 opacity-0'}`}>
                  <Image
                    src="/merquito.jpeg"
                    alt="Merquito"
                    width={72}
                    height={72}
                    className="rounded-full border-4 border-white shadow-lg"
                  />
                </div>
                <div className={`transition-all duration-700 delay-200 ${popupAnimating ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}`}>
                  <p className="text-white/80 text-sm font-medium">Merquito te recuerda</p>
                  <h2 className="text-white text-xl font-extrabold">Hoy hay algo especial</h2>
                </div>
              </div>

              {/* Events list */}
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                {todayPopupEvents.map((evt, idx) => {
                  const isBday = evt.type === 'cumpleaños' || evt.type === 'birthday' || evt.title.toLowerCase().includes('cumpleaños');
                  return (
                    <div
                      key={idx}
                      className={`rounded-2xl overflow-hidden border transition-all duration-500 ${
                        popupAnimating ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
                      } ${isBday ? 'border-pink-200 bg-gradient-to-br from-pink-50 to-purple-50' : 'border-orange-200 bg-orange-50'}`}
                      style={{ transitionDelay: `${300 + idx * 150}ms` }}
                    >
                      {/* Media */}
                      {evt.videoUrl && evt.videoUrl.trim() !== '' ? (
                        <div className="w-full h-48 bg-black">
                          <video
                            src={evt.videoUrl}
                            controls
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : evt.image && (evt.image.startsWith('/api/') || evt.image.startsWith('http')) ? (
                        <img
                          src={evt.image}
                          alt={evt.title}
                          className="w-full h-48 object-cover"
                        />
                      ) : isBday ? (
                        <div className="w-full h-32 bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 flex items-center justify-center">
                          <span className="text-6xl">🎂</span>
                        </div>
                      ) : null}

                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          {isBday ? (
                            <span className="text-2xl">🎉</span>
                          ) : (
                            <Calendar className="w-5 h-5 text-[#f4a900]" />
                          )}
                          <h3 className={`font-bold text-lg ${isBday ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-transparent bg-clip-text' : 'text-gray-900'}`}>
                            {evt.title}
                          </h3>
                        </div>
                        {evt.description && (
                          <p className="text-sm text-gray-600 leading-relaxed">{evt.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-6 pb-6">
                <button
                  onClick={() => { setPopupAnimating(false); setTimeout(() => setShowTodayPopup(false), 300); }}
                  className="w-full py-3 rounded-xl bg-[#f4a900] text-white font-bold text-sm hover:bg-[#e68a00] transition-colors shadow-md"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating view-switcher (admins and fondo) */}
        {(userRole === "admin" || userRole === "fondo") && (
          <button
            type="button"
            onClick={() => setAdminView(v => !v)}
            className="fixed bottom-6 left-6 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-black text-white shadow-2xl ring-2 ring-[#f4a900] hover:bg-[#f4a900] hover:text-black active:scale-95 transition-all"
            title={adminView ? "Cambiar a vista de usuario" : (userRole === "fondo" ? "Cambiar a panel fondo" : "Cambiar a vista de admin")}
          >
            {adminView ? (
              <>
                <UserCircle2 className="h-5 w-5" />
                <span className="text-sm font-bold hidden sm:inline">Vista usuario</span>
              </>
            ) : (
              <>
                <LayoutDashboard className="h-5 w-5" />
                <span className="text-sm font-bold hidden sm:inline">{userRole === "fondo" ? "Panel Fonalmerque" : "Vista admin"}</span>
              </>
            )}
          </button>
        )}

        {/* Admin view (only if admin AND adminView toggled on) */}
        {userRole === "admin" && adminView && (
          <main className="pt-20 sm:pt-24">
            <AdminPage embedded />
          </main>
        )}

        {/* Fondo manager view — redirect to fondo panel */}
        {userRole === "fondo" && adminView && (
          <main className="pt-20 sm:pt-24 text-center">
            <a href="/dashboard/fondo" className="inline-flex items-center gap-2 px-6 py-3 bg-[#f4a900] text-black font-bold rounded-xl hover:bg-[#f4a900] transition">
              <LayoutDashboard className="h-5 w-5" />
              Ir al Panel del Fonalmerque
            </a>
          </main>
        )}

        {/* Main user content (hidden when admin/fondo is in panel view) */}
        {!((userRole === "admin" || userRole === "fondo") && adminView) && (
        <main className="pb-16 px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24">
          <div className="max-w-7xl mx-auto">
            {/* HERO — Merquito welcome */}
            <section className="relative mb-8 overflow-hidden rounded-3xl bg-black text-white shadow-xl">
              {/* decorative glows */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 15% 20%, #f4a900 0, transparent 45%), radial-gradient(circle at 85% 90%, #f4a900 0, transparent 35%)',
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage:
                    'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
                  backgroundSize: '36px 36px',
                }}
              />
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#f4a900] to-transparent" />

              <div className="relative flex flex-col-reverse sm:flex-row items-center gap-6 p-6 sm:p-8 lg:p-10">
                <div className="flex-1 text-center sm:text-left">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f4a900]/15 text-[#f4a900] text-xs font-semibold uppercase tracking-wider border border-[#f4a900]/30">
                    <CheckCircle className="h-3.5 w-3.5" /> Hoy es un buen día
                  </span>
                  <h1 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-tight">
                    Bienvenid@{profile?.nombre ? ` ${profile.nombre.split(' ')[0]}` : ''}! 👋
                  </h1>
                  <p className="mt-2 text-sm sm:text-base text-white/70">{capitalizedDate}</p>
                </div>

                <div className="relative flex-shrink-0">
                  <div className="absolute -inset-4 rounded-full bg-[#f4a900] blur-2xl opacity-40" />
                  <div className="absolute inset-0 rounded-2xl border-2 border-[#f4a900]/40 rotate-3" />
                  <Image
                    src="/merquito.jpeg"
                    alt="Merquito - Mascota Merquellantas"
                    width={160}
                    height={160}
                    priority
                    sizes="(max-width: 640px) 120px, 160px"
                    className="relative rounded-2xl ring-4 ring-[#f4a900] shadow-2xl object-cover w-28 h-28 sm:w-36 sm:h-36 lg:w-40 lg:h-40"
                  />
                </div>
              </div>
            </section>

            {/* Main section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left column (spans 2 columns on large screens) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Welcome banner with gradient */}
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 hover:shadow-md transition-shadow duration-300">
  {(() => {
    if (loadingEvent) {
      return (
        <div className="relative p-6 md:p-8">
          <div className="h-48 bg-gray-100 animate-pulse rounded-xl"></div>
        </div>
      );
    }

    if (!upcomingEvents || upcomingEvents.length === 0) {
      return (
        <div className="relative p-6 md:p-8">
          <p className="text-gray-500">No hay eventos próximos</p>
        </div>
      );
    }

    const currentEvent = upcomingEvents[currentEventIndex] ?? upcomingEvents[0];
    const isBirthday = currentEvent && (
      currentEvent.type === 'cumpleaños' ||
      currentEvent.type === 'birthday' ||
      currentEvent.title.toLowerCase().includes('cumpleaños')
    );
    const isCurrentBirthdayToday = isBirthday && isBirthdayToday(new Date(currentEvent.date));
    // True when the signed-in user is the celebrant — prevents self-reactions.
    const isOwnEvent = !!(
      currentEvent?.user_id &&
      profile &&
      session?.user?.id &&
      String(currentEvent.user_id) === String(session.user.id)
    );
    // Reactions wall only renders on the closest event (index 0). The rest of the
    // carousel are read-only previews of what's coming up.
    const showReactions = currentEventIndex === 0;
    // Stable image index so the fallback birthday art doesn't change on every render.
    const birthdayImageIndex = (() => {
      const src = currentEvent?.id || currentEvent?.title || '';
      let h = 0;
      for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
      return h % 3;
    })();

    if (isCurrentBirthdayToday) {
      // Birthday messages array
      const birthdayMessages = [
        "Eres un integrante muy importante de todo el equipo y esperamos que tengas un hermoso día junto a tu familia, compañeros y demás. ¡Que este nuevo año de vida esté lleno de éxitos y alegrías!",
        "Hoy celebramos tu día especial y queremos que sepas lo importante que eres para nuestro equipo. Que este cumpleaños sea el inicio de un año lleno de bendiciones, logros y momentos inolvidables.",
        "Tu dedicación y compromiso hacen de este equipo un lugar mejor cada día. Esperamos que celebres este día rodeado de las personas que más quieres y que recibas todo el amor que mereces. ¡Feliz cumpleaños!",
        "En este día tan especial, queremos reconocer todo lo que aportas a nuestro equipo. Tu presencia marca la diferencia y tu energía nos inspira. Que tu cumpleaños esté lleno de sorpresas maravillosas y momentos de felicidad.",
        "Hoy es un día para celebrarte a ti y todo lo que representas para nosotros. Eres una pieza fundamental de esta familia laboral. Deseamos que este nuevo año de vida te traiga prosperidad, salud y muchos motivos para sonreír."
      ];
      
      // djb2 hash so different names spread across messages instead of colliding by length
      const hash = (currentEvent.title || '')
        .split('')
        .reduce((acc, ch) => ((acc << 5) + acc + ch.charCodeAt(0)) >>> 0, 5381);
      const randomMessage = birthdayMessages[hash % birthdayMessages.length];
      
      return (
        <div className="relative p-6 md:p-8">
          {/* Birthday decorations with orange theme */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#f4a900] via-[#ffb347] to-[#ffd700]"></div>
            <div className="absolute top-4 left-4 text-[#f4a900] text-2xl animate-pulse">🎈</div>
            <div className="absolute top-8 right-8 text-[#ffb347] text-2xl animate-bounce" style={{ animationDelay: '0.2s' }}>🎉</div>
            <div className="absolute bottom-8 left-12 text-[#ffd700] text-xl animate-pulse" style={{ animationDelay: '0.4s' }}>✨</div>
            <div className="absolute bottom-12 right-16 text-[#f4a900] text-xl animate-bounce" style={{ animationDelay: '0.6s' }}>🎊</div>
          </div>

          <div className="relative flex flex-col md:flex-row items-center gap-6">
            {/* Carousel navigation - Left */}
            {upcomingEvents.length > 1 && (
              <button
                onClick={() => setCurrentEventIndex((prev) => (prev === 0 ? upcomingEvents.length - 1 : prev - 1))}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 hover:bg-white shadow-lg hover:shadow-xl transition-all"
              >
                <ChevronLeft className="h-5 w-5 text-[#f4a900]" />
              </button>
            )}

            {/* Birthday content */}
            <div className="md:flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full bg-gradient-to-r from-[#f4a900]/20 via-[#ffb347]/20 to-[#ffd700]/20">
                <span className="text-2xl">🎂</span>
                <span className="text-sm font-bold bg-gradient-to-r from-[#f4a900] to-[#ffb347] text-transparent bg-clip-text">
                  ¡Celebración Especial!
                </span>
              </div>

              <h2 className="text-2xl md:text-3xl font-bold mb-3 bg-gradient-to-r from-[#f4a900] to-[#ffb347] text-transparent bg-clip-text">
                {currentEvent.title}
              </h2>

              {(() => {
                const dt = new Date(currentEvent.date);
                const adjustedDt = dt;
                const isToday = isEventToday(dt);

                return (
                  <p className="text-sm text-gray-600 mb-4 font-medium">
                    {isToday ? '🎈 ¡Hoy es el gran día!' : `📅 ${adjustedDt.toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long'
                    })}`}
                  </p>
                );
              })()}

              <div className="bg-gradient-to-br from-[#f4a900]/10 via-[#ffb347]/10 to-[#ffd700]/10 rounded-xl p-5 mb-5 border-2 border-[#f4a900]/30">
                <p className="text-gray-700 leading-relaxed text-sm md:text-base">
                  {randomMessage}
                </p>
              </div>

              {/* Carousel indicator dots */}
              {upcomingEvents.length > 1 && (
                <div className="flex justify-center md:justify-start gap-2 mb-4">
                  {upcomingEvents.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentEventIndex(idx)}
                      className={`h-2 rounded-full transition-all ${
                        idx === currentEventIndex
                          ? 'w-8 bg-[#f4a900]'
                          : 'w-2 bg-gray-300 hover:bg-gray-400'
                      }`}
                    />
                  ))}
                </div>
              )}

              <a href='dashboard/calendar'>
                <button className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-[#f4a900] to-[#ffb347] text-white rounded-full font-bold text-sm hover:from-[#e68a00] hover:to-[#f4a900] transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1 duration-200">
                  Ver más celebraciones
                  <ChevronRight className="ml-2 h-5 w-5" />
                </button>
              </a>
            </div>

            {/* Right side - Image/Video */}
            <div className="flex-shrink-0 w-full md:w-auto relative">
              {currentEvent.videoUrl && currentEvent.videoUrl.trim() !== '' ? (
                <div className="h-48 w-full md:w-72 rounded-2xl overflow-hidden shadow-2xl ring-4 ring-[#f4a900]/30 bg-black">
                  <video
                    src={currentEvent.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : currentEvent.image || isBirthday ? (
                <img
                  src={currentEvent.image && currentEvent.image.startsWith('/api/')
                    ? currentEvent.image
                    : isBirthday
                      ? ["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ28hdK2YMK1kT1QcKgtTpMVKX-PzNDQy0GGg&s","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQx_br_f6lRM6GlR4pC_lTXijSfA2d3ovsdSw&s","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRJF6XSwytfBht0vJcIbdWDCpif4C9esFJ0_g&s"][birthdayImageIndex]
                      : currentEvent.image
                  }
                  alt={currentEvent.title}
                  className="rounded-2xl shadow-2xl h-48 w-full object-cover md:w-72 ring-4 ring-[#f4a900]/30"
                />
              ) : (
                <div className="h-48 w-full md:w-72 flex items-center justify-center text-6xl rounded-2xl bg-gradient-to-br from-[#f4a900]/20 via-[#ffb347]/20 to-[#ffd700]/20 shadow-xl">
                  🎂
                </div>
              )}
            </div>

            {/* Carousel navigation - Right */}
            {upcomingEvents.length > 1 && (
              <button
                onClick={() => setCurrentEventIndex((prev) => (prev === upcomingEvents.length - 1 ? 0 : prev + 1))}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 hover:bg-white shadow-lg hover:shadow-xl transition-all"
              >
                <ChevronRight className="h-5 w-5 text-[#f4a900]" />
              </button>
            )}
          </div>

          {/* Reactions wall — only on the closest event (index 0). Carousel previews
              of the following events stay read-only. */}
          {showReactions && currentEvent.id && (
            <div className="relative px-6 md:px-8 pb-6 md:pb-8 -mt-2">
              <EventWall
                eventId={currentEvent.id}
                eventTitle={currentEvent.title}
                isOwnEvent={isOwnEvent}
                compact
              />
            </div>
          )}
        </div>
      );
    }

    // Regular event (birthday or not, but not today)
    return (
      <div className="relative p-6 md:p-8">
        <div className={`absolute top-0 ${isBirthday ? 'left' : 'right'}-0 w-full h-1 bg-gradient-to-${isBirthday ? 'r' : 'r'} from-[#f4a900] via-[#ffb347] to-white`}></div>

        <div className="relative flex flex-col md:flex-row items-center">
        {/* Carousel navigation - Left */}
        {upcomingEvents.length > 1 && (
          <button
            onClick={() => setCurrentEventIndex((prev) => (prev === 0 ? upcomingEvents.length - 1 : prev - 1))}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white hover:bg-gray-50 shadow-md hover:shadow-lg transition-all"
          >
            <ChevronLeft className="h-5 w-5 text-[#f4a900]" />
          </button>
        )}

        <div className="md:flex-1 mb-6 md:mb-0 md:pr-6">
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                isBirthday 
                  ? 'bg-[#f4a900]/20 text-[#f4a900] border-2 border-[#f4a900]/30' 
                  : 'bg-[#f4a900]/10 text-[#f4a900]'
              }`}>
                {isBirthday ? '🎂 Próximo cumpleaños' : 'Evento destacado'}
              </div>
              {(() => {
                const eventStatus = getEventStatus(currentEvent);
                return (
                  <div className={`inline-block px-2 py-1 rounded-full ${eventStatus.color} text-white text-xs font-medium`}>
                    {eventStatus.label}
                  </div>
                );
              })()}
            </div>

            <h2 className={`text-xl md:text-2xl font-bold mb-2 ${
              isBirthday 
                ? 'bg-gradient-to-r from-[#f4a900] to-[#ffb347] text-transparent bg-clip-text' 
                : 'text-gray-900'
            }`}>
              {currentEvent.title}
            </h2>

            {(() => {
              const dt = new Date(currentEvent.date);
              const adjustedDt = dt;
              const isAllDay = dt.getHours() === 0 && dt.getMinutes() === 0 && dt.getSeconds() === 0;
              const isToday = isEventToday(dt);

              if (isAllDay) {
                return (
                  <p className="text-xs text-gray-500 mb-3">
                    {isToday ? 'Hoy' : adjustedDt.toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: isBirthday ? undefined : 'numeric'
                    })} — Todo el día
                  </p>
                );
              } else {
                return (
                  <p className="text-xs text-gray-500 mb-3">
                    {isToday ? 'Hoy' : adjustedDt.toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: isBirthday ? undefined : 'numeric'
                    })},{' '}
                    {dt.toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                );
              }
            })()}

            {(() => {
  if (isBirthday) {
    const birthdayMessages = [
     "¡Feliz cumpleaños! En Merquellantas nos sentimos orgullosos de contar con tu talento. Que este nuevo año de vida venga cargado de kilómetros de éxitos y alegrías. ¡Disfruta tu día!",
  "Hoy celebramos la vida de una pieza fundamental de nuestra familia. De parte de todo el equipo de Merquellantas, te deseamos un cumpleaños extraordinario. ¡Gracias por rodar con nosotros!",
  "¡Felicidades en tu día! Para Merquellantas es un honor tenerte en el equipo. Esperamos que este día esté lleno de sonrisas, buena compañía y el reconocimiento que mereces.",
  "¡Llegó el momento de celebrar! En Merquellantas nos unimos a tu alegría y te deseamos un año lleno de prosperidad y momentos inolvidables. ¡Que pases un muy feliz cumpleaños!",
  "Hoy los aplausos son para ti. En Merquellantas celebramos no solo un año más de tu vida, sino tu valiosa contribución a nuestra empresa. ¡Que sea un día memorable!",
  "¡Es momento de hacer una parada para celebrar! En Merquellantas te deseamos un feliz cumpleaños lleno de buena energía y que este año sigas avanzando con paso firme hacia tus metas.",
  "¡Felicidades! Que este nuevo año sea como un camino libre de obstáculos y lleno de grandes destinos. Gracias por poner todo tu esfuerzo y pasión en el equipo de Merquellantas.",
  "En Merquellantas celebramos tu vida y tu talento. Deseamos que este día sea el inicio de una vuelta más al sol llena de salud, éxito y momentos especiales junto a los que más quieres.",
  "¡Feliz cumpleaños! Eres parte del engranaje que hace que Merquellantas llegue cada día más lejos. Esperamos que disfrutes de un día extraordinario y muy merecido.",
  "¡Hoy celebramos que eres parte de Merquellantas! Que la alegría de este día te acompañe durante todo el año y que sigamos compartiendo muchos éxitos más en el camino."
];
    
    const randomMessage = birthdayMessages[currentEvent.title.length % birthdayMessages.length];
    
    return (
      <div className="mb-4 p-4 bg-gradient-to-br from-[#f4a900]/10 to-[#ffb347]/10 rounded-lg border-l-4 border-[#f4a900]">
        <p className="text-gray-700 leading-relaxed text-sm md:text-base">
          {randomMessage}
        </p>
      </div>
    );
  } else {
    return <p className="mb-4 text-gray-600">{currentEvent.description}</p>;
  }
})()}

            {isBirthday && currentEvent.videoUrl && (
              <div className="mb-4 p-3 bg-[#f4a900]/10 rounded-lg border border-[#f4a900]/30">
                <p className="text-sm text-[#f4a900] font-medium flex items-center">
                  <span className="mr-2">🎬</span> Este cumpleaños tiene un video especial
                </p>
              </div>
            )}

            {/* Carousel indicator dots */}
            {upcomingEvents.length > 1 && (
              <div className="flex gap-2 mb-4">
                {upcomingEvents.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentEventIndex(idx)}
                    className={`h-2 rounded-full transition-all ${
                      idx === currentEventIndex
                        ? 'w-8 bg-[#f4a900]'
                        : 'w-2 bg-gray-300 hover:bg-gray-400'
                    }`}
                  />
                ))}
              </div>
            )}

            <a href='dashboard/calendar'>
              <button className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-[#f4a900] to-[#ffb347] text-white rounded-full font-medium text-sm hover:from-[#e68a00] hover:to-[#f4a900] transition-all shadow-sm hover:shadow transform hover:-translate-y-0.5 duration-200">
                Ver detalles
                <ChevronRight className="ml-1 h-4 w-4" />
              </button>
            </a>
          </>
        </div>

        <div className="flex-shrink-0 w-full md:w-auto">
          {currentEvent.videoUrl && currentEvent.videoUrl.trim() !== '' ? (
            <div className={`h-40 w-full md:w-64 rounded-xl overflow-hidden bg-black shadow ${
              isBirthday ? 'ring-4 ring-[#f4a900]/30' : ''
            }`}>
              <video
                key={currentEvent.videoUrl}
                src={currentEvent.videoUrl}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full object-contain"
              />
            </div>
          ) : currentEvent.image || isBirthday ? (
            <img
              src={currentEvent.image && currentEvent.image.startsWith('/api/')
                ? currentEvent.image
                : isBirthday
                  ? ["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ28hdK2YMK1kT1QcKgtTpMVKX-PzNDQy0GGg&s","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQx_br_f6lRM6GlR4pC_lTXijSfA2d3ovsdSw&s","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRJF6XSwytfBht0vJcIbdWDCpif4C9esFJ0_g&s"][birthdayImageIndex]
                  : currentEvent.image
              }
              alt={currentEvent.title}
              className={`rounded-xl shadow h-40 w-full object-cover md:w-64 ${
                isBirthday ? 'ring-4 ring-[#f4a900]/30' : ''
              }`}
            />
          ) : (
            <div className={`h-40 w-full md:w-64 flex items-center justify-center rounded-xl border border-gray-200 ${
              isBirthday
                ? 'text-6xl bg-gradient-to-br from-[#f4a900]/20 to-[#ffb347]/20'
                : 'text-gray-400'
            }`}>
              {isBirthday ? '🎂' : 'No hay media'}
            </div>
          )}
        </div>

        {/* Carousel navigation - Right */}
        {upcomingEvents.length > 1 && (
          <button
            onClick={() => setCurrentEventIndex((prev) => (prev === upcomingEvents.length - 1 ? 0 : prev + 1))}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white hover:bg-gray-50 shadow-md hover:shadow-lg transition-all"
          >
            <ChevronRight className="h-5 w-5 text-[#f4a900]" />
          </button>
        )}
        </div>

        {/* Reactions wall — only on the closest event; carousel previews stay read-only. */}
        {showReactions && currentEvent.id && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <EventWall
              eventId={currentEvent.id}
              eventTitle={currentEvent.title}
              isOwnEvent={isOwnEvent}
              compact
            />
          </div>
        )}
      </div>
    );
  })()}
</div>

                {/* Quick actions — black/yellow speed grid */}
                <div className="bg-black rounded-2xl shadow-xl p-6 relative overflow-hidden text-white">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-30"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at 90% 10%, #f4a900 0, transparent 40%)',
                    }}
                  />
                  <div className="relative">
                    <h2 className="text-lg font-bold mb-5 flex items-center">
                      <Briefcase className="h-5 w-5 mr-2 text-[#f4a900]" />
                      Acciones rápidas
                    </h2>
                    {dynamicActions === null ? (
                      <p className="text-sm text-white/60">Cargando...</p>
                    ) : dynamicActions.length === 0 ? (
                      <p className="text-sm text-white/60">No hay acciones rápidas configuradas.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {dynamicActions.map(action => {
                          const Icon = getIcon(action.icon);
                          const isExternal = action.href.startsWith('http');
                          return (
                            <a
                              key={action.id}
                              href={action.href}
                              className="group flex flex-col items-center justify-center p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-[#f4a900] hover:border-[#f4a900] active:scale-95 transition-all"
                              target={isExternal ? "_blank" : "_self"}
                              rel={isExternal ? "noopener noreferrer" : ""}
                            >
                              <div className="w-11 h-11 rounded-full bg-[#f4a900]/20 group-hover:bg-black/20 flex items-center justify-center mb-2 text-[#f4a900] group-hover:text-black transition-colors">
                                <Icon className="h-5 w-5" />
                              </div>
                              <span className="text-xs font-semibold text-white/90 group-hover:text-black text-center leading-tight">
                                {action.title}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Upcoming activities with hover effects */}
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow duration-300 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-500 to-white"></div>
                  <div className="flex justify-between items-center mb-5">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center">
                      <Calendar className="h-5 w-5 mr-2 text-[#f4a900]" />
                      Próximas actividades
                    </h2>
                    <a href="/dashboard/calendar" className="text-[#f4a900] text-sm font-medium flex items-center hover:underline">
                      Ver calendario
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </a>
                  </div>

                  <div className="space-y-3">
  {loadingEvents ? (
    // loading skeletons
    [1,2,3].map(i => (
      <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
    ))
  ) : upcomingEvents.length > 0 ? (
    upcomingEvents.map((evt, idx) => {
      const dt = new Date(evt.date);
      const adjustedDt = dt;
      const isAllDay = dt.getHours()===0 && dt.getMinutes()===0 && dt.getSeconds()===0;
      const isBirthday = evt.type === 'cumpleaños' || evt.type === 'birthday' || evt.title.toLowerCase().includes('cumpleaños');
      
      const dateLabel = isAllDay
        ? `${adjustedDt.toLocaleDateString('es-ES',{ day: 'numeric', month: 'long', year: 'numeric' })} — Todo el día`
        : `${adjustedDt.toLocaleDateString('es-ES',{ day: 'numeric', month: 'long', year: 'numeric' })}, ${dt.toLocaleTimeString('es-ES',{ hour:'2-digit',minute:'2-digit' })}`;

      return (
        <div
          key={idx}
          className={`flex items-start p-4 rounded-xl transition-colors border hover:shadow-sm ${
            isBirthday 
              ? 'bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 border-pink-200 hover:border-pink-300' 
              : 'hover:bg-gray-50 border-gray-100 hover:border-[#f4a900]/30'
          }`}
        >
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center mr-4 ${
            isBirthday 
              ? 'bg-gradient-to-br from-pink-400 to-purple-400' 
              : 'bg-[#f4a900]/10'
          }`}>
            {isBirthday ? (
              <span className="text-2xl">🎂</span>
            ) : (
              <Activity className="h-6 w-6 text-[#f4a900]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-medium truncate ${
              isBirthday ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-transparent bg-clip-text' : 'text-gray-900'
            }`}>
              {evt.title}
            </h3>
            <p className={`text-xs mt-1 ${isBirthday ? 'text-purple-600' : 'text-gray-500'}`}>
              {dateLabel}
            </p>
            {isBirthday && evt.videoUrl && (
              <p className="text-xs text-pink-600 mt-1 flex items-center">
                <span className="mr-1">🎬</span> Con video
              </p>
            )}
          </div>
        </div>
      );
    })
  ) : (
    <p className="text-gray-500">No hay próximas actividades</p>
  )}
</div>
                </div>
              </div>
              
              {/* Right column */}
              <div className="space-y-6">
                {/* Personal summary — expanded profile with all user data */}
                {(() => {
                  const fn = (v?: string) => (v && v.trim() ? v.trim() : null);

                  let antiguedadLabel: string | null = null;
                  if (profile) {
                    if (profile.antiguedad >= 1) {
                      antiguedadLabel = `${profile.antiguedad} ${profile.antiguedad === 1 ? 'año' : 'años'}`;
                      const extraMonths = profile.antiguedadMeses - profile.antiguedad * 12;
                      if (extraMonths > 0) {
                        antiguedadLabel += ` · ${extraMonths} ${extraMonths === 1 ? 'mes' : 'meses'}`;
                      }
                    } else if (profile.antiguedadMeses > 0) {
                      antiguedadLabel = `${profile.antiguedadMeses} ${profile.antiguedadMeses === 1 ? 'mes' : 'meses'}`;
                    }
                  }

                  const sections: {
                    title: string;
                    fields: { label: string; value: string | null; full?: boolean }[];
                  }[] = [
                    {
                      title: 'Personal',
                      fields: [
                        { label: 'Cédula', value: fn(profile?.cedula) },
                        { label: 'Tipo de documento', value: fn(profile?.tipoDocumento) },
                        { label: 'Fecha de nacimiento', value: fn(formatSpanishDate(profile?.fechaNacimiento)) },
                        { label: 'Correo', value: fn(profile?.email), full: true },
                      ],
                    },
                    {
                      title: 'Laboral',
                      fields: [
                        { label: 'Cargo', value: fn(profile?.cargo) || fn(profile?.posicion) },
                        { label: 'Área', value: fn(profile?.area) },
                        { label: 'Departamento', value: fn(profile?.dpto) },
                        { label: 'Contrato', value: fn(profile?.contrato) },
                        { label: 'Fecha de ingreso', value: fn(formatSpanishDate(profile?.fechaIngreso)) },
                        { label: 'Antigüedad', value: antiguedadLabel },
                        { label: 'Clase de riesgo', value: fn(profile?.claseRiesgo) },
                      ],
                    },
                    {
                      title: 'Financiero',
                      fields: [
                        { label: 'Banco', value: fn(profile?.banco) },
                        { label: 'Tipo de cuenta', value: fn(profile?.tipoCuenta) },
                        { label: 'Número de cuenta', value: fn(profile?.numeroCuenta) ? maskAccount(profile!.numeroCuenta) : null },
                      ],
                    },
                    {
                      title: 'Beneficios',
                      fields: [
                        { label: 'EPS', value: fn(profile?.eps) },
                        { label: 'ARL', value: fn(profile?.arl) },
                        { label: 'Pensión (AFP)', value: fn(profile?.pensiones) },
                        { label: 'Caja de compensación', value: fn(profile?.caja) },
                        { label: 'Fondo de cesantías', value: fn(profile?.cesantias), full: true },
                      ],
                    },
                  ]
                    .map(s => ({ ...s, fields: s.fields.filter(f => !!f.value) }))
                    .filter(s => s.fields.length > 0);

                  const rolBadge: Record<string, { bg: string; label: string }> = {
                    admin: { bg: 'bg-black text-[#f4a900]', label: 'Admin' },
                    fondo: { bg: 'bg-emerald-700 text-white', label: 'Fonalmerque' },
                  };
                  const showBadge = profile && (profile.rol === 'admin' || profile.rol === 'fondo');

                  return (
                    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow duration-300 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-l from-[#f4a900] via-[#ffb347] to-white" />
                      <div className="flex items-center mb-5">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#f4a900]/20 to-[#f4a900]/40 flex items-center justify-center flex-shrink-0">
                          <User className="h-8 w-8 text-[#f4a900]" />
                        </div>
                        <div className="ml-4 min-w-0">
                          <div className="flex items-center gap-2">
                            <h2 className="font-bold text-gray-900 truncate">
                              {profile?.nombre ?? 'Cargando...'}
                            </h2>
                            {showBadge && rolBadge[profile!.rol] && (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${rolBadge[profile!.rol].bg}`}>
                                {rolBadge[profile!.rol].label}
                              </span>
                            )}
                          </div>
                          {profile?.cargo?.trim() && (
                            <p className="text-sm text-gray-600 truncate">{profile.cargo}</p>
                          )}
                          {profile?.area?.trim() && (
                            <p className="text-xs text-[#f4a900] font-semibold truncate">{profile.area}</p>
                          )}
                        </div>
                      </div>

                      {sections.length > 0 && (
                        <div className="border-t border-gray-100 pt-4 space-y-5">
                          {sections.map(section => (
                            <div key={section.title}>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                                {section.title}
                              </p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                {section.fields.map(f => (
                                  <div key={f.label} className={f.full ? 'col-span-2' : ''}>
                                    <p className="text-[11px] text-gray-500">{f.label}</p>
                                    <p className="font-medium text-gray-900 text-sm break-words">
                                      {f.value}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Certificado de ingresos y retenciones download is temporarily
                          disabled. Re-enable by restoring this block (see git history). */}
                    </div>
                  );
                })()}

                {/* Vacation balance — above Mis Solicitudes */}
                {(() => {
                  const days = vacation?.days;
                  const hasData = typeof days === 'number';
                  const canRequest = hasData && days! >= 1;
                  const scrapedAt = vacation?.scraped_at
                    ? new Date(vacation.scraped_at).toLocaleString('es-CO', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : null;
                  const asOf = vacation?.as_of_date
                    ? new Date(vacation.as_of_date + 'T00:00:00').toLocaleDateString('es-CO', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : null;

                  return (
                    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow duration-300 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center">
                          <Calendar className="h-5 w-5 mr-2 text-emerald-500" />
                          Vacaciones
                        </h2>
                        {vacation?.stale && hasData && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                            pendiente actualizar
                          </span>
                        )}
                      </div>

                      {loadingVacation ? (
                        <div className="h-20 rounded-xl bg-gray-100 animate-pulse" />
                      ) : !hasData ? (
                        <div className="text-sm text-gray-500 py-2">
                          Aún no tenemos tus días registrados. El equipo los sincroniza cada primero de mes.
                        </div>
                      ) : (
                        <>
                          <div className="flex items-end gap-2 mb-3">
                            <span className="text-5xl font-extrabold text-emerald-600 leading-none">
                              {Number(days).toFixed(days! % 1 === 0 ? 0 : 2)}
                            </span>
                            <span className="text-sm text-gray-500 pb-1">
                              {days === 1 ? 'día disponible' : 'días disponibles'}
                            </span>
                          </div>
                          {asOf && (
                            <p className="text-xs text-gray-500">
                              Corte: <span className="font-semibold text-gray-700">{asOf}</span>
                            </p>
                          )}
                          {scrapedAt && (
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              Actualizado: {scrapedAt}
                            </p>
                          )}
                        </>
                      )}

                      <button
                        onClick={() => router.push('/dashboard/solicitud?tipo=vacaciones')}
                        disabled={!canRequest}
                        className={`w-full mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                          canRequest
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 shadow shadow-emerald-600/20'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <Calendar className="h-4 w-4" />
                        Pedir vacaciones
                      </button>
                      {hasData && !canRequest && (
                        <p className="text-[11px] text-gray-500 mt-2 text-center">
                          Necesitas al menos 1 día disponible para solicitar vacaciones.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* User requests with Activas / Respondidas tabs */}
                {(() => {
                  const activas = pendingRequests.filter(r => r.estado === 'pendiente');
                  const respondidas = pendingRequests.filter(r => r.estado !== 'pendiente');
                  const list = requestsTab === 'activas' ? activas : respondidas;
                  return (
                    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow duration-300 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-[#f4a900]" />
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center">
                          <FileText className="h-5 w-5 mr-2 text-[#f4a900]" />
                          Mis Solicitudes
                        </h2>
                      </div>

                      {/* Tabs */}
                      <div className="flex gap-2 mb-4">
                        <button
                          onClick={() => setRequestsTab('activas')}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                            requestsTab === 'activas'
                              ? 'bg-black text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Activas ({activas.length})
                        </button>
                        <button
                          onClick={() => setRequestsTab('respondidas')}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                            requestsTab === 'respondidas'
                              ? 'bg-black text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Respondidas ({respondidas.length})
                        </button>
                      </div>

                      <div className="space-y-3">
                        {loadingRequests ? (
                          [1, 2].map(i => (
                            <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
                          ))
                        ) : list.length > 0 ? (
                          list.map(req => {
                            const dt = new Date(req.createdAt);
                            const title = req.tipo === 'cesantias'
                              ? 'Solicitud de Cesantías'
                              : req.tipo === 'enfermedad'
                                ? 'Solicitud de Incapacidad'
                                : 'Solicitud de Permiso';

                            const isApproved = req.estado === 'aprobado';
                            const isRejected = req.estado === 'rechazado';
                            const badgeClass = isApproved
                              ? 'bg-green-100 text-green-700'
                              : isRejected
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700';
                            const accentClass = isApproved
                              ? 'border-l-green-500'
                              : isRejected
                                ? 'border-l-red-500'
                                : 'border-l-[#f4a900]';

                            return (
                              <div
                                key={req.id}
                                className={`border border-gray-100 border-l-4 ${accentClass} rounded-xl p-4 hover:shadow-sm transition-all`}
                              >
                                <div className="flex justify-between items-start gap-3">
                                  <div className="min-w-0">
                                    <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </p>
                                  </div>
                                  <span className={`inline-block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded-full ${badgeClass}`}>
                                    {req.estado}
                                  </span>
                                </div>

                                {req.motivoRespuesta && (
                                  <div className={`mt-3 p-3 rounded-lg text-xs ${
                                    isRejected
                                      ? 'bg-red-50 text-red-700 border border-red-100'
                                      : 'bg-green-50 text-green-700 border border-green-100'
                                  }`}>
                                    <p className="font-bold mb-0.5">
                                      {isRejected ? 'Motivo del rechazo:' : 'Comentario:'}
                                    </p>
                                    <p>{req.motivoRespuesta}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-sm text-gray-500 text-center py-6">
                            {requestsTab === 'activas'
                              ? 'No tienes solicitudes activas.'
                              : 'Aún no tienes solicitudes respondidas.'}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Mis PQRSF */}
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow duration-300 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center">
                      <MessageSquare className="h-5 w-5 mr-2 text-amber-500" />
                      Mis PQRSF
                    </h2>
                    <a
                      href="/dashboard/pqrsf"
                      className="text-xs font-semibold text-amber-600 hover:text-amber-800"
                    >
                      Nueva PQRSF →
                    </a>
                  </div>

                  <div className="space-y-3">
                    {loadingMyPqrsf ? (
                      [1, 2].map(i => (
                        <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
                      ))
                    ) : myPqrsf.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-6">
                        Aún no has enviado ninguna PQRSF.
                      </p>
                    ) : (
                      myPqrsf.slice(0, 5).map(p => {
                        const dt = new Date(p.created_at);
                        const hasResponse = !!p.respuesta;
                        const accentClass = hasResponse ? 'border-l-emerald-500' : 'border-l-amber-500';
                        const typeColors: Record<string, string> = {
                          'Petición': 'bg-blue-100 text-blue-700',
                          'Queja': 'bg-red-100 text-red-700',
                          'Reclamo': 'bg-orange-100 text-orange-700',
                          'Sugerencia': 'bg-green-100 text-green-700',
                          'Felicitación': 'bg-purple-100 text-purple-700',
                        };
                        const messageIsLong = (p.message?.length || 0) > 120;
                        const responseIsLong = (p.respuesta?.length || 0) > 180;
                        return (
                          <button
                            key={p._id}
                            onClick={() => setSelectedPqrsf(p)}
                            className={`text-left w-full border border-gray-100 border-l-4 ${accentClass} rounded-xl p-4 hover:shadow-md hover:bg-gray-50/50 transition-all`}
                          >
                            <div className="flex justify-between items-start gap-2 mb-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${typeColors[p.type] || 'bg-gray-100 text-gray-700'}`}>
                                  {p.type}
                                </span>
                                {p.is_anonymous && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                    Anónimo
                                  </span>
                                )}
                                {hasResponse ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                    <CheckCircle className="h-3 w-3" />
                                    Respondido
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                                    <Clock className="h-3 w-3" />
                                    En espera
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-gray-400 flex-shrink-0">
                                {dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mt-2 line-clamp-2">{p.message}</p>
                            {hasResponse && p.respuesta && (
                              <div className="mt-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                                <div className="flex items-center justify-between gap-1.5 mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle className="h-3 w-3 text-emerald-600" />
                                    <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider">
                                      Respuesta
                                    </span>
                                  </div>
                                </div>
                                <p className="text-xs text-gray-800 line-clamp-3">{p.respuesta}</p>
                              </div>
                            )}
                            {(messageIsLong || responseIsLong) && (
                              <p className="mt-2 text-[10px] font-semibold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1">
                                Ver completo →
                              </p>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Salario emocional section */}
            </div>
          </div>
        </div>
      </main>
        )}

        {/* Mis PQRSF detail modal */}
        {selectedPqrsf && (() => {
          const sp = selectedPqrsf;
          const dt = new Date(sp.created_at);
          const respDt = sp.respondido_at ? new Date(sp.respondido_at) : null;
          const typeColors: Record<string, string> = {
            'Petición': 'bg-blue-100 text-blue-700',
            'Queja': 'bg-red-100 text-red-700',
            'Reclamo': 'bg-orange-100 text-orange-700',
            'Sugerencia': 'bg-green-100 text-green-700',
            'Felicitación': 'bg-purple-100 text-purple-700',
          };
          return (
            <div
              className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm"
              onClick={() => setSelectedPqrsf(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4 flex-shrink-0">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${typeColors[sp.type] || 'bg-gray-100 text-gray-700'}`}>
                        {sp.type}
                      </span>
                      {sp.is_anonymous && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                          Enviado como anónimo
                        </span>
                      )}
                      {sp.respuesta ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                          <CheckCircle className="h-3 w-3" /> Respondido
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                          <Clock className="h-3 w-3" /> En espera
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Enviada el {dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedPqrsf(null)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                    aria-label="Cerrar"
                  >
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-5">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Tu mensaje
                    </label>
                    <div className="mt-2 p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {sp.message}
                    </div>
                  </div>

                  {sp.respuesta && (
                    <div>
                      <label className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Respuesta del Administrador
                        {respDt && (
                          <span className="text-gray-400 normal-case font-normal ml-2">
                            ({respDt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })})
                          </span>
                        )}
                      </label>
                      <div className="mt-2 p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                        {sp.respuesta}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-gray-100 flex justify-end flex-shrink-0">
                  <button
                    onClick={() => setSelectedPqrsf(null)}
                    className="px-5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm transition"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
};

export default Dashboard;