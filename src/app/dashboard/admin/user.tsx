'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Search,
  User,
  Cake,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Briefcase,
  Wallet,
  HeartPulse,
  Mail,
} from 'lucide-react';
interface UserExtra {
  'Dpto Donde Labora': string;
  'ARL': string;
  'Banco': string;
  'CAJA DE COMPENSACION': string;
  'EPS': string;
  'FONDO DE PENSIONES': string;
  'Fecha Ingreso': string;
  'Fondo Cesantías': string;
  'Cargo Empleado': string;
  'Número Cuenta': string;
  'Tipo Cuenta': string;
  'Tipo de Documento': string;
  'posicion': string;
  'fechaNacimiento': string;
  'rol': 'user' | 'admin' | 'fondo';
  'Area': string;
  'Contrato': string;
  'Clase Riesgo': string;
}

interface User {
  id: string;
  cedula: string;
  email: string;
  createdAt: Date;
  extra: UserExtra;
  nombre: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string | Date;
  description: string;
  type: 'general' | 'birthday';
  userId: string;
}

const Users: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  // Bulk upload state
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    total_rows: number;
    created: number;
    updated: number;
    errors: number;
    fondo_relinked: number;
    results: { row: number; cedula: string; nombre: string; status: string; error?: string; fondo_relinked?: number }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wipe-all state
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [wipeTyped, setWipeTyped] = useState('');
  const [wiping, setWiping] = useState(false);

  const initialFormData: {
  cedula: string;
  nombre: string;
  email: string;
  extra: UserExtra;
} = {
  cedula: '',
  nombre: '',
  email: '',
  extra: {
    'Dpto Donde Labora': '',
    'ARL': '',
    'Banco': '',
    'CAJA DE COMPENSACION': '',
    'EPS': '',
    'FONDO DE PENSIONES': '',
    'Fecha Ingreso': '',
    'Fondo Cesantías': '',
    'Cargo Empleado': '',
    'Número Cuenta': '',
    'Tipo Cuenta': '',
    'Tipo de Documento': '',
    'posicion': '',
    'fechaNacimiento': '',
    'rol': 'user',
    'Area': '',
    'Contrato': '',
    'Clase Riesgo': '',
  }
};

  const [formData, setFormData] = useState(initialFormData);

  // Default pattern for auto-generated emails. Admins can override with a real
  // address per-user via the edit modal; this is only the fallback when none is set.
  const generateEmail = (cedula: string) => {
    return `${cedula}@merque.com`;
  };

  const dateToExcelSerial = (dateString: string): number => {
    if (!dateString) return 0;
    const date = new Date(dateString);
    const epoch = new Date(1900, 0, 1);
    const diffTime = date.getTime() - epoch.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const excelSerialToDate = (serial: number): string => {
    if (!serial || serial === 0) return '';
    const epoch = new Date(1900, 0, 1);
    const date = new Date(epoch.getTime() + (serial - 1) * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  };

  const fetchCalendarEvents = async () => {
    try {
      const res = await fetch('/api/calendar');
      if (!res.ok) throw new Error('Error fetching calendar');
      const allEvents: CalendarEvent[] = await res.json();
      const birthdayEvents = allEvents.filter(e => e.type === 'birthday');
      setCalendarEvents(birthdayEvents);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
    }
  };

  const getBirthdayFromCalendar = (userName: string): string => {
    const birthdayEvent = calendarEvents.find(event =>
      event.title.toLowerCase().includes(userName.toLowerCase()) ||
      (event.title.toLowerCase().includes('cumpleaños') &&
       event.title.toLowerCase().includes(userName.toLowerCase().split(' ')[0]))
    );

    if (birthdayEvent && birthdayEvent.date) {
      const date = birthdayEvent.date instanceof Date
        ? birthdayEvent.date
        : new Date(birthdayEvent.date);

      date.setDate(date.getDate() + 1);
      return date.toISOString().split('T')[0];
    }

    return '';
  };

  const createUser = async () => {
    if (!formData.cedula || !formData.nombre) {
      alert('Por favor, complete los campos obligatorios (Cédula y Nombre)');
      return;
    }

    // Use the admin-provided email if any, otherwise fall back to <cedula>@merque.com.
    const email = formData.email.trim() || generateEmail(formData.cedula);

    try {
      const payload = {
        cedula: formData.cedula,
        nombre: formData.nombre,
        email,
        departamento: formData.extra['Dpto Donde Labora'],
        arl: formData.extra['ARL'],
        banco: formData.extra['Banco'],
        caja_compensacion: formData.extra['CAJA DE COMPENSACION'],
        eps: formData.extra['EPS'],
        fondo_pensiones: formData.extra['FONDO DE PENSIONES'],
        fecha_ingreso: formData.extra['Fecha Ingreso'],
        fondo_cesantias: formData.extra['Fondo Cesantías'],
        cargo_empleado: formData.extra['Cargo Empleado'],
        numero_cuenta: formData.extra['Número Cuenta'],
        tipo_cuenta: formData.extra['Tipo Cuenta'],
        tipo_documento: formData.extra['Tipo de Documento'],
        posicion: formData.extra['posicion'],
        fecha_nacimiento: formData.extra['fechaNacimiento'],
        rol: formData.extra['rol'],
        area: formData.extra['Area'],
        contrato: formData.extra['Contrato'],
        clase_riesgo: formData.extra['Clase Riesgo'],
      };

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error creating user');
      }

      const created = await res.json();

      const newUser: User = {
        id: created.id,
        cedula: formData.cedula,
        nombre: formData.nombre,
        email,
        createdAt: new Date(),
        extra: {
          ...formData.extra,
          'Fecha Ingreso': formData.extra['Fecha Ingreso']
        }
      };

      setUsers(prev => [...prev, newUser]);
      setFormData(initialFormData);
      setShowCreateForm(false);
      alert('Usuario creado exitosamente');
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error al crear usuario:', error.message);
        alert(`Error al crear usuario: ${error.message}`);
      } else {
        console.error('Error desconocido:', error);
        alert('Error desconocido al crear usuario');
      }
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      await fetchCalendarEvents();

      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Error fetching users');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usersData: any[] = await res.json();

      const fetched: User[] = usersData.map(data => {
        const createdAt = data.created_at ? new Date(data.created_at) : new Date();
        const nombre = (data.nombre || '').toString().trim();

        let birthday: string = data.fecha_nacimiento || '';
        if (!birthday && nombre) {
          birthday = getBirthdayFromCalendar(nombre);
        }

        const completeExtra: UserExtra = {
          'Dpto Donde Labora': data.departamento || '',
          'ARL': data.arl || '',
          'Banco': data.banco || '',
          'CAJA DE COMPENSACION': data.caja_compensacion || '',
          'EPS': data.eps || '',
          'FONDO DE PENSIONES': data.fondo_pensiones || '',
          'Fecha Ingreso': data.fecha_ingreso || '',
          'Fondo Cesantías': data.fondo_cesantias || '',
          'Cargo Empleado': data.cargo_empleado || '',
          'Número Cuenta': data.numero_cuenta || '',
          'Tipo Cuenta': data.tipo_cuenta || '',
          'Tipo de Documento': data.tipo_documento || '',
          'posicion': data.posicion || '',
          'fechaNacimiento': birthday,
          'rol': (data.rol as 'user' | 'admin' | 'fondo') || 'user',
          'Area': data.area || '',
          'Contrato': data.contrato || '',
          'Clase Riesgo': data.clase_riesgo || '',
        };

        return {
          id: (data._id || data.id || '').toString(),
          cedula: data.cedula || '',
          nombre,
          email: data.email || '',
          createdAt,
          extra: completeExtra,
        };
      });
      setUsers(fetched);
    } catch (error) {
      console.error('Error fetching users:', error);
      alert('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async () => {
    if (!editingUser) return;

    const updatedPayload = {
      id: editingUser.id,
      cedula: formData.cedula,
      nombre: formData.nombre,
      email: formData.email.trim() || generateEmail(formData.cedula),
      departamento: formData.extra['Dpto Donde Labora'],
      arl: formData.extra['ARL'],
      banco: formData.extra['Banco'],
      caja_compensacion: formData.extra['CAJA DE COMPENSACION'],
      eps: formData.extra['EPS'],
      fondo_pensiones: formData.extra['FONDO DE PENSIONES'],
      fecha_ingreso: formData.extra['Fecha Ingreso'],
      fondo_cesantias: formData.extra['Fondo Cesantías'],
      cargo_empleado: formData.extra['Cargo Empleado'],
      numero_cuenta: formData.extra['Número Cuenta'],
      tipo_cuenta: formData.extra['Tipo Cuenta'],
      tipo_documento: formData.extra['Tipo de Documento'],
      posicion: formData.extra['posicion'],
      fecha_nacimiento: formData.extra['fechaNacimiento'],
      rol: formData.extra['rol'],
      area: formData.extra['Area'],
      contrato: formData.extra['Contrato'],
      clase_riesgo: formData.extra['Clase Riesgo'],
    };

    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPayload),
      });

      if (!res.ok) throw new Error('Error updating user');

      setUsers(prevUsers =>
        prevUsers.map(user =>
          user.id === editingUser.id
            ? {
                ...user,
                cedula: formData.cedula,
                nombre: formData.nombre,
                email: updatedPayload.email,
                extra: { ...formData.extra },
              }
            : user
        )
      );

      cancelEdit();
      alert("Usuario actualizado con éxito");
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error al actualizar usuario');
    }
  };

  const deleteUser = async (uid: string) => {
    if (!confirm('¿Eliminar este usuario permanentemente?')) return;

    try {
      const res = await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: uid })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error);
        return;
      }

      setUsers(prev => prev.filter(u => u.id !== uid));

      alert('Usuario eliminado completamente');
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Error al eliminar usuario. Por favor intente nuevamente.');
    }
  };

  const handleInputChange = <K extends keyof UserExtra>(
  field: K,
  value: UserExtra[K]
): void => {
  setFormData(prev => ({
    ...prev,
    extra: {
      ...prev.extra,
      [field]: value
    }
  }));
};

  const startEdit = (user: User) => {
  setEditingUser(user);
  setFormData({
    cedula: user.cedula,
    nombre: user.nombre,
    email: user.email || '',
    extra: { ...user.extra },
  });
  setShowCreateForm(true);
};
  const cancelEdit = () => {
    setEditingUser(null);
    setFormData(initialFormData);
    setShowCreateForm(false);
  };

  const filteredUsers = users.filter(u => {
  const searchLower = searchTerm.toLowerCase();
  return (
    u.cedula?.toLowerCase().includes(searchLower) ||
    u.nombre?.toLowerCase().includes(searchLower) ||
    u.email?.toLowerCase().includes(searchLower)
  );
});

  const calculateAge = (birthday: string): number | null => {
    if (!birthday) return null;
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleBulkUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      const res = await fetch('/api/users/bulk-upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error al cargar el archivo');
        return;
      }
      setUploadResult(data);
      await fetchUsers();
    } catch (error) {
      console.error('Bulk upload error:', error);
      alert('Error al cargar el archivo');
    } finally {
      setUploading(false);
    }
  };

  const closeBulkUpload = () => {
    setShowBulkUpload(false);
    setUploadFile(null);
    setUploadResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleWipeAll = async () => {
    if (wipeTyped !== 'WIPE') return;
    setWiping(true);
    try {
      const res = await fetch('/api/users/wipe-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'WIPE' }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error al borrar usuarios');
        return;
      }
      alert(`Se eliminaron ${data.total_deleted} registros. Ahora puedes volver a cargar el Excel.`);
      setShowWipeConfirm(false);
      setWipeTyped('');
      await fetchUsers();
    } catch (error) {
      console.error('Wipe error:', error);
      alert('Error al borrar usuarios');
    } finally {
      setWiping(false);
    }
  };

  const adminCount = users.filter(u => u.extra?.rol === 'admin').length;
  const totalCount = users.length;

  return (
    <div className="text-black mt-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Black hero header */}
        <div className="relative p-5 sm:p-6 bg-black text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 90% 30%, #f4a900 0, transparent 50%)",
            }}
          />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#f4a900]/20 text-[#f4a900] flex items-center justify-center">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold">Gestión de Usuarios</h2>
                <p className="text-xs text-white/60">
                  {totalCount} {totalCount === 1 ? 'usuario' : 'usuarios'} · {adminCount} admin{adminCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowWipeConfirm(true)}
                className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 text-red-300 text-sm font-semibold hover:bg-red-500/20 active:scale-95 transition-all border border-red-400/30"
                title="Borrar todos los usuarios"
              >
                <Trash2 className="h-4 w-4" /> Borrar todo
              </button>
              <button
                onClick={() => setShowBulkUpload(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 active:scale-95 transition-all border border-white/20"
              >
                <Upload className="h-4 w-4" /> Cargar Excel
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#f4a900] text-black text-sm font-bold hover:bg-[#f4a900] active:scale-95 transition-all shadow-lg shadow-[#f4a900]/20"
              >
                <Plus className="h-4 w-4" /> Nuevo Usuario
              </button>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 bg-gray-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por cédula, nombre o email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f4a900] text-sm placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-hidden">
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="border-b border-gray-200">
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Laboral</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Financiero</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cumpleaños</th>
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Ingreso</th>
                  <th className="px-5 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">Cargando...</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">No hay usuarios</td></tr>
                ) : (
                  filteredUsers.map(user => {
                    const age = calculateAge(user.extra?.['fechaNacimiento']);
                    const userRol = user.extra?.rol || 'user';
                    const isSpecialRole = userRol === 'admin' || userRol === 'fondo';
                    const initials = (user.nombre || 'U U')
                      .split(' ')
                      .map(p => p[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();
                    const rolBadge: Record<string, { bg: string; label: string }> = {
                      admin: { bg: 'bg-black text-[#f4a900]', label: 'Admin' },
                      fondo: { bg: 'bg-emerald-700 text-white', label: 'Fonalmerque' },
                    };
                    return (
                      <tr key={user.id} className="hover:bg-[#f4a900]/5 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              isSpecialRole ? (userRol === 'admin' ? 'bg-black text-[#f4a900]' : 'bg-emerald-700 text-white') : 'bg-[#f4a900]/10 text-[#f4a900]'
                            }`}>
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-bold text-gray-900 truncate">{user.nombre || 'Sin nombre'}</p>
                                {isSpecialRole && rolBadge[userRol] && (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${rolBadge[userRol].bg}`}>{rolBadge[userRol].label}</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">CC {user.cedula}</p>
                              <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm text-gray-900 truncate max-w-[200px]">{user.extra?.['Cargo Empleado'] || '—'}</div>
                          <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {user.extra?.['Area'] && (
                              <span className="font-semibold text-[#f4a900]">{user.extra['Area']}</span>
                            )}
                            {user.extra?.['Dpto Donde Labora'] && (
                              <span className="text-gray-400">· {user.extra['Dpto Donde Labora']}</span>
                            )}
                            {user.extra?.['Contrato'] && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{user.extra['Contrato']}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-sm text-gray-900">{user.extra?.Banco || '—'}</div>
                          <div className="text-xs text-gray-500">
                            {user.extra?.['Tipo Cuenta'] || ''}
                            {user.extra?.['Número Cuenta'] ? ` · ${user.extra['Número Cuenta']}` : ''}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {user.extra?.['fechaNacimiento'] ? (
                            <div className="flex items-center gap-1.5">
                              <Cake className="h-3.5 w-3.5 text-pink-500 flex-shrink-0" />
                              <div>
                                <div className="text-sm text-gray-900">
                                  {new Date(user.extra['fechaNacimiento']).toLocaleDateString('es-CO')}
                                </div>
                                {age !== null && (
                                  <div className="text-[11px] text-gray-400">{age} años</div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-xs text-gray-600">
                          {user.extra?.['Fecha Ingreso']
                            ? new Date(user.extra['Fecha Ingreso']).toLocaleDateString('es-CO')
                            : '—'}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => startEdit(user)}
                              className="p-2 rounded-lg text-gray-500 hover:text-[#f4a900] hover:bg-[#f4a900]/10 transition"
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => deleteUser(user.id)}
                              className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create / Edit user modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-black to-gray-900 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#f4a900]/20 text-[#f4a900] flex items-center justify-center">
                  {editingUser ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-base">
                    {editingUser ? 'Editar usuario' : 'Crear usuario'}
                  </h3>
                  <p className="text-xs text-white/60">
                    {editingUser
                      ? `${editingUser.nombre} · CC ${editingUser.cedula}`
                      : 'Completa los datos del nuevo colaborador'}
                  </p>
                </div>
              </div>
              <button
                onClick={cancelEdit}
                className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 bg-gray-50">
              <div className="p-6 space-y-6">
                {/* Información personal */}
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-3 flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-[#f4a900]" />
                    Información personal
                  </h4>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Cédula *" required>
                      <input
                        type="text"
                        placeholder="1005822654"
                        value={formData.cedula}
                        onChange={e => setFormData(prev => ({ ...prev, cedula: e.target.value.replace(/\D/g, '') }))}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                      {formData.cedula && (
                        <p className="mt-1 text-[11px] text-gray-500">
                          Contraseña inicial:{' '}
                          <code className="font-mono font-semibold text-gray-700">
                            {formData.cedula.slice(-8).padStart(8, '0')}
                          </code>
                        </p>
                      )}
                    </Field>
                    <Field label="Tipo de documento">
                      <select
                        value={formData.extra['Tipo de Documento']}
                        onChange={e => handleInputChange('Tipo de Documento', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      >
                        <option value="">Seleccione</option>
                        <option value="Cédula Ciudadanía">Cédula Ciudadanía</option>
                        <option value="Cédula Extranjería">Cédula Extranjería</option>
                        <option value="Pasaporte">Pasaporte</option>
                      </select>
                    </Field>
                    <Field label="Nombre completo *" required className="sm:col-span-2">
                      <input
                        type="text"
                        placeholder="Nombre y apellidos"
                        value={formData.nombre}
                        onChange={e => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="Fecha de nacimiento" icon={<Cake className="h-3.5 w-3.5 text-pink-500" />}>
                      <input
                        type="date"
                        value={formData.extra['fechaNacimiento']}
                        onChange={e => handleInputChange('fechaNacimiento', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="Rol del sistema">
                      <select
                        value={formData.extra.rol}
                        onChange={e => handleInputChange('rol', e.target.value as 'user' | 'admin' | 'fondo')}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      >
                        <option value="user">Usuario</option>
                        <option value="admin">Administrador</option>
                        <option value="fondo">Fonalmerque</option>
                      </select>
                    </Field>
                    <Field
                      label="Correo electrónico"
                      icon={<Mail className="h-3.5 w-3.5 text-[#f4a900]" />}
                      className="sm:col-span-2"
                    >
                      <input
                        type="email"
                        placeholder={formData.cedula ? `${formData.cedula}@merque.com (por defecto)` : 'Correo real del empleado (opcional)'}
                        value={formData.email}
                        onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        Si lo dejas en blanco, usaremos <code className="font-mono text-[10px]">{formData.cedula || 'cedula'}@merque.com</code>.
                        Este correo también se usa para notificaciones de aprobación de vacaciones/permisos.
                      </p>
                    </Field>
                  </div>
                </section>

                {/* Información laboral */}
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-3 flex items-center gap-2">
                    <Briefcase className="h-3.5 w-3.5 text-[#f4a900]" />
                    Información laboral
                  </h4>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Cargo">
                      <input
                        type="text"
                        placeholder="Ej: Agente Call Center"
                        value={formData.extra['Cargo Empleado']}
                        onChange={e => handleInputChange('Cargo Empleado', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="Área / CANAL">
                      <input
                        type="text"
                        placeholder="Ej: Call Center, Lubricentro, Administrativo, ..."
                        value={formData.extra['Area']}
                        onChange={e => handleInputChange('Area', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="Departamento donde labora">
                      <input
                        type="text"
                        placeholder="Ej: Bogotá"
                        value={formData.extra['Dpto Donde Labora']}
                        onChange={e => handleInputChange('Dpto Donde Labora', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="Tipo de contrato">
                      <input
                        type="text"
                        placeholder="Ej: Indefinido"
                        value={formData.extra['Contrato']}
                        onChange={e => handleInputChange('Contrato', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="Fecha de ingreso">
                      <input
                        type="date"
                        value={formData.extra['Fecha Ingreso']}
                        onChange={e => handleInputChange('Fecha Ingreso', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="Clase de riesgo">
                      <input
                        type="text"
                        placeholder="Ej: Clase 3"
                        value={formData.extra['Clase Riesgo']}
                        onChange={e => handleInputChange('Clase Riesgo', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                  </div>
                </section>

                {/* Información financiera */}
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-3 flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5 text-[#f4a900]" />
                    Información financiera
                  </h4>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Field label="Banco" className="sm:col-span-2">
                      <input
                        type="text"
                        placeholder="Ej: Banco de Bogotá"
                        value={formData.extra.Banco}
                        onChange={e => handleInputChange('Banco', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="Tipo de cuenta">
                      <select
                        value={formData.extra['Tipo Cuenta']}
                        onChange={e => handleInputChange('Tipo Cuenta', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      >
                        <option value="">Seleccione</option>
                        <option value="AHORRO">Ahorro</option>
                        <option value="CORRIENTE">Corriente</option>
                      </select>
                    </Field>
                    <Field label="Número de cuenta" className="sm:col-span-3">
                      <input
                        type="text"
                        placeholder="Número de cuenta bancaria"
                        value={formData.extra['Número Cuenta']}
                        onChange={e => handleInputChange('Número Cuenta', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                  </div>
                </section>

                {/* Información de beneficios */}
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mb-3 flex items-center gap-2">
                    <HeartPulse className="h-3.5 w-3.5 text-[#f4a900]" />
                    Beneficios y aportes
                  </h4>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="EPS">
                      <input
                        type="text"
                        placeholder="Ej: EPS Sanitas S.A."
                        value={formData.extra.EPS}
                        onChange={e => handleInputChange('EPS', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="ARL">
                      <input
                        type="text"
                        placeholder="Ej: ARL Sura"
                        value={formData.extra.ARL}
                        onChange={e => handleInputChange('ARL', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="AFP / Fondo de pensiones">
                      <input
                        type="text"
                        placeholder="Ej: Porvenir"
                        value={formData.extra['FONDO DE PENSIONES']}
                        onChange={e => handleInputChange('FONDO DE PENSIONES', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="Caja de compensación">
                      <input
                        type="text"
                        placeholder="Ej: Colsubsidio"
                        value={formData.extra['CAJA DE COMPENSACION']}
                        onChange={e => handleInputChange('CAJA DE COMPENSACION', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                    <Field label="Fondo de cesantías" className="sm:col-span-2">
                      <input
                        type="text"
                        placeholder="Ej: Protección"
                        value={formData.extra['Fondo Cesantías']}
                        onChange={e => handleInputChange('Fondo Cesantías', e.target.value)}
                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent focus:bg-white transition"
                      />
                    </Field>
                  </div>
                </section>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-white">
              <button
                onClick={cancelEdit}
                className="px-4 py-2.5 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
              <button
                onClick={editingUser ? updateUser : createUser}
                disabled={!formData.cedula || !formData.nombre}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#f4a900] text-black text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow"
              >
                <Save className="h-4 w-4" />
                {editingUser ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe confirmation modal */}
      {showWipeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-red-50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">Borrar todos los usuarios</h3>
                <p className="text-xs text-red-700">Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="p-5 space-y-3 text-sm text-gray-700">
              <p>
                Se eliminarán <b>todos los usuarios</b> y sus datos relacionados (calendario, solicitudes,
                cesantías, cursos, PQRSF). Los registros del fondo se preservan y se re-vinculan
                automáticamente al volver a subir el Excel.
              </p>
              <p className="text-gray-600">
                Escribe <code className="px-1.5 py-0.5 rounded bg-gray-100 text-red-700 font-mono text-xs">WIPE</code> para confirmar.
              </p>
              <input
                type="text"
                value={wipeTyped}
                onChange={(e) => setWipeTyped(e.target.value)}
                placeholder="WIPE"
                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                autoFocus
              />
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
              <button
                onClick={() => { setShowWipeConfirm(false); setWipeTyped(''); }}
                disabled={wiping}
                className="px-4 py-2 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleWipeAll}
                disabled={wipeTyped !== 'WIPE' || wiping}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed shadow"
              >
                {wiping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {wiping ? 'Borrando...' : 'Borrar todo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk upload modal */}
      {showBulkUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#f4a900]/20 flex items-center justify-center">
                  <Upload className="h-4 w-4 text-[#f4a900]" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Cargar usuarios desde Excel</h3>
                  <p className="text-xs text-gray-500">.xlsx, .xls o .csv — encabezados en la primera fila</p>
                </div>
              </div>
              <button
                onClick={closeBulkUpload}
                disabled={uploading}
                className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {!uploadResult && (
                <>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-xs text-orange-900">
                    <p className="font-bold mb-1">Columnas esperadas:</p>
                    <p className="leading-relaxed">
                      Número Documento · Primer Apellido · Segundo Apellido · Nombre Empleado · Fecha Nacimiento · Fecha Ingreso · Contrato · Dpto Donde Labora · Cargo Empleado · Tipo Cuenta · Número Cuenta · Banco · EPS · AFP · Caja Compensación · ARL · Clase Riesgo · Fondo Cesantías · CANAL
                    </p>
                    <p className="mt-2 text-orange-800">
                      Las fechas se aceptan en formato DD/MM/AAAA. La contraseña inicial son los últimos 8 dígitos de la cédula. Los registros del fondo (saldos, cartera, etc.) se re-vinculan automáticamente por cédula.
                    </p>
                  </div>

                  <label
                    htmlFor="bulk-file"
                    className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#f4a900] hover:bg-orange-50/30 transition"
                  >
                    <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    {uploadFile ? (
                      <>
                        <p className="font-semibold text-gray-800 text-sm">{uploadFile.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {(uploadFile.size / 1024).toFixed(1)} KB · click para cambiar
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-gray-700 text-sm">Click para seleccionar archivo</p>
                        <p className="text-xs text-gray-500 mt-1">o arrástralo aquí</p>
                      </>
                    )}
                    <input
                      id="bulk-file"
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </>
              )}

              {uploadResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-green-700">Creados</p>
                      <p className="text-2xl font-extrabold text-green-800">{uploadResult.created}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-blue-700">Actualizados</p>
                      <p className="text-2xl font-extrabold text-blue-800">{uploadResult.updated}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Re-vinculados</p>
                      <p className="text-2xl font-extrabold text-amber-800">{uploadResult.fondo_relinked}</p>
                      <p className="text-[10px] text-amber-600 mt-0.5">registros fondo</p>
                    </div>
                    <div className={`rounded-xl p-3 border ${uploadResult.errors > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                      <p className={`text-[10px] uppercase tracking-wider font-bold ${uploadResult.errors > 0 ? 'text-red-700' : 'text-gray-500'}`}>Errores</p>
                      <p className={`text-2xl font-extrabold ${uploadResult.errors > 0 ? 'text-red-800' : 'text-gray-700'}`}>{uploadResult.errors}</p>
                    </div>
                  </div>

                  {uploadResult.errors > 0 && (
                    <div className="border border-red-200 rounded-xl overflow-hidden">
                      <div className="bg-red-50 px-3 py-2 text-xs font-bold text-red-700 uppercase tracking-wider">
                        Filas con error
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-red-100 text-sm">
                        {uploadResult.results
                          .filter((r) => r.status === 'error')
                          .map((r) => (
                            <div key={r.row} className="px-3 py-2 flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-700">
                                  <span className="font-semibold">Fila {r.row}</span>
                                  {r.cedula && <span className="text-gray-500"> · {r.cedula}</span>}
                                  {r.nombre && <span className="text-gray-500"> · {r.nombre}</span>}
                                </p>
                                <p className="text-xs text-red-700">{r.error}</p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {(uploadResult.created > 0 || uploadResult.updated > 0) && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Procesados ({uploadResult.created + uploadResult.updated})
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 text-sm">
                        {uploadResult.results
                          .filter((r) => r.status !== 'error')
                          .map((r) => (
                            <div key={r.row} className="px-3 py-2 flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-800 truncate">
                                  <span className="font-semibold">{r.nombre}</span>
                                  <span className="text-gray-500"> · {r.cedula}</span>
                                </p>
                              </div>
                              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${r.status === 'created' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                {r.status === 'created' ? 'Nuevo' : 'Actualizado'}
                              </span>
                              {r.fondo_relinked ? (
                                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                  +{r.fondo_relinked} fondo
                                </span>
                              ) : null}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50">
              <button
                onClick={closeBulkUpload}
                disabled={uploading}
                className="px-4 py-2 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50"
              >
                {uploadResult ? 'Cerrar' : 'Cancelar'}
              </button>
              {!uploadResult && (
                <button
                  onClick={handleBulkUpload}
                  disabled={!uploadFile || uploading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#f4a900] text-black text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? 'Procesando...' : 'Cargar usuarios'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function Field({
  label,
  children,
  required = false,
  icon,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
        {icon}
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export default Users;