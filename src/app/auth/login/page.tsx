"use client"

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import {
  Eye,
  EyeOff,
  User,
  Lock,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

export default function MerqeuBienestarLogin() {
  const router = useRouter()
  const { data: session } = useSession()
  const [cedula, setCedula] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Bootstrap upload (temporary — auto-hidden when users exist)
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false)
  const [showBootstrap, setShowBootstrap] = useState(false)
  const [bootstrapFile, setBootstrapFile] = useState<File | null>(null)
  const [bootstrapAdminCedula, setBootstrapAdminCedula] = useState('')
  const [bootstrapUploading, setBootstrapUploading] = useState(false)
  const [bootstrapResult, setBootstrapResult] = useState<{
    total_rows: number
    created: number
    updated: number
    errors: number
    fondo_relinked: number
    admin_promoted: boolean
    admin_cedula: string
    results: { row: number; cedula: string; nombre: string; status: string; error?: string }[]
  } | null>(null)
  const bootstrapFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (session) router.replace('/dashboard')
  }, [session, router])

  useEffect(() => {
    fetch('/api/users/bootstrap-upload')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setBootstrapEnabled(!!d.enabled))
      .catch(() => setBootstrapEnabled(false))
  }, [])

  const runBootstrapUpload = async () => {
    if (!bootstrapFile || !bootstrapAdminCedula) return
    setBootstrapUploading(true)
    setBootstrapResult(null)
    try {
      const fd = new FormData()
      fd.append('file', bootstrapFile)
      fd.append('admin_cedula', bootstrapAdminCedula)
      const res = await fetch('/api/users/bootstrap-upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Error al cargar el archivo')
        return
      }
      setBootstrapResult(data)
      setBootstrapEnabled(false)
    } catch {
      alert('Error al cargar el archivo')
    } finally {
      setBootstrapUploading(false)
    }
  }

  const closeBootstrap = () => {
    setShowBootstrap(false)
    setBootstrapFile(null)
    setBootstrapAdminCedula('')
    setBootstrapResult(null)
    if (bootstrapFileRef.current) bootstrapFileRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!cedula || !password) {
      setError('Ingrese su cédula y contraseña')
      return
    }

    setLoading(true)

    try {
      const res = await signIn('credentials', {
        cedula,
        password,
        redirect: false,
      })

      if (res?.error) {
        setError('Cédula o contraseña inválidos')
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError('Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-black text-white relative overflow-hidden">
      {/* Decorative background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 10%, #f4a900 0, transparent 40%), radial-gradient(circle at 80% 90%, #f4a900 0, transparent 35%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 min-h-screen grid grid-cols-1 lg:grid-cols-2">
        {/* LEFT — Mascot / brand panel */}
        <section className="hidden lg:flex flex-col justify-between p-10 xl:p-14">
          <div className="flex items-center gap-3">
            <div className="bg-[#f4a900] rounded-xl p-2">
              <Sparkles className="h-5 w-5 text-black" />
            </div>
            <span className="font-bold tracking-wide text-lg">Merquellantas · Nuestra Gente</span>
          </div>

          <div className="relative flex-1 flex items-center justify-center">
            <div className="absolute w-[420px] h-[420px] xl:w-[520px] xl:h-[520px] rounded-full bg-[#f4a900] blur-3xl opacity-30" />
            <div className="absolute w-[360px] h-[360px] xl:w-[460px] xl:h-[460px] rounded-full border-2 border-[#f4a900]/40" />
            <div className="absolute w-[280px] h-[280px] xl:w-[360px] xl:h-[360px] rounded-full border border-white/10" />
            <Image
              src="/merquito.jpeg"
              alt="Merquito - Mascota Merquellantas"
              width={420}
              height={420}
              priority
              className="relative rounded-3xl shadow-2xl ring-4 ring-[#f4a900]/60 object-cover"
            />
          </div>

          <div className="max-w-md">
            <h2 className="text-3xl xl:text-4xl font-extrabold leading-tight">
              Bienvenido a <span className="text-[#f4a900]">Nuestra Gente</span>
            </h2>
            <p className="mt-3 text-white/70">
              Tu portal de bienestar, beneficios y comunicación con el equipo Merquellantas.
            </p>
          </div>
        </section>

        {/* RIGHT — Login form */}
        <section className="flex flex-col justify-center items-center px-5 sm:px-8 py-10 sm:py-14">
          {/* Mobile mascot header */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="relative">
              <div className="absolute -inset-3 bg-[#f4a900] rounded-full blur-2xl opacity-40" />
              <Image
                src="/merquito.jpeg"
                alt="Merquito - Mascota Merquellantas"
                width={140}
                height={140}
                priority
                className="relative rounded-2xl ring-4 ring-[#f4a900] object-cover"
              />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-white text-center">
              Nuestra <span className="text-[#f4a900]">Gente</span>
            </h1>
            <p className="text-white/60 text-sm mt-1">Merquellantas</p>
          </div>

          <div className="w-full max-w-md">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-br from-[#f4a900] via-[#f4a900]/40 to-transparent rounded-3xl blur-xl opacity-60" />
              <div className="relative bg-white rounded-3xl shadow-2xl p-6 sm:p-8 md:p-10 text-black">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-1 w-10 rounded-full bg-[#f4a900]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#f4a900]">
                    Acceso seguro
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold mt-2">Inicia sesión</h2>
                <p className="text-gray-500 text-sm mt-1 mb-6">
                  Ingresa con tu cédula y contraseña.
                </p>

                <form onSubmit={handleSubmit} noValidate>
                  {/* Cédula */}
                  <div className="mb-4">
                    <label htmlFor="cedula" className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                      Cédula
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="cedula"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="username"
                        required
                        value={cedula}
                        onChange={e => setCedula(e.target.value.replace(/\D/g, ''))}
                        className="block w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent transition"
                        placeholder="Ej. 1023456789"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="mb-4">
                    <label htmlFor="password" className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
                      Contraseña
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="block w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent transition"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-[#f4a900] transition"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-5">
                    <label className="flex items-center text-sm text-gray-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                        className="h-4 w-4 accent-[#f4a900] border-gray-300 rounded focus:ring-[#f4a900]"
                      />
                      <span className="ml-2">Recordarme</span>
                    </label>
                    <span className="flex items-center text-xs text-gray-500">
                      <ShieldCheck className="h-4 w-4 mr-1 text-[#f4a900]" />
                      Conexión segura
                    </span>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm"
                    >
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !cedula || !password}
                    className="w-full flex justify-center items-center py-3.5 rounded-xl bg-[#f4a900] text-black font-bold text-base hover:bg-[#f4a900] active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#f4a900]/30"
                  >
                    {loading ? 'Ingresando...' : 'Iniciar sesión'}
                    {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
                  </button>
                </form>

                <p className="mt-6 text-center text-xs text-gray-500">
                  ¿Problemas para ingresar? Contacta a Talento Humano.
                </p>

                <a
                  href="/polla/login"
                  className="mt-4 w-full inline-flex items-center justify-center gap-3 py-3 rounded-xl border-2 border-[#f4a900] bg-[#f4a900]/10 text-[#f4a900] text-sm font-bold hover:bg-[#f4a900]/20 transition"
                >
                  <span className="text-lg">⚽</span>
                  ¿Ya llenaste tu Polla Mundialista?
                  <ArrowRight className="h-4 w-4" />
                </a>

                {bootstrapEnabled && (
                  <button
                    type="button"
                    onClick={() => setShowBootstrap(true)}
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 text-orange-800 text-xs font-bold hover:bg-orange-100 transition"
                  >
                    <Upload className="h-4 w-4" />
                    Cargar usuarios iniciales (bootstrap)
                  </button>
                )}
              </div>
            </div>

            <div className="mt-8 text-center">
              <p className="text-xs text-white/50">
                © {new Date().getFullYear()} Merquellantas. Todos los derechos reservados.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Bootstrap upload modal */}
      {showBootstrap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col text-black">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#f4a900]/20 flex items-center justify-center">
                  <Upload className="h-4 w-4 text-[#f4a900]" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Cargar usuarios iniciales</h3>
                  <p className="text-xs text-gray-500">.xlsx, .xls o .csv — encabezados en la primera fila</p>
                </div>
              </div>
              <button
                onClick={closeBootstrap}
                disabled={bootstrapUploading}
                className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {!bootstrapResult && (
                <>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-xs text-orange-900">
                    <p className="font-bold mb-1">Solo disponible cuando no hay usuarios.</p>
                    <p className="leading-relaxed">
                      Esta opción crea los usuarios iniciales después de un wipe. La cédula del administrador será marcada como rol <strong>admin</strong> para que puedas iniciar sesión y gestionar el resto desde el panel.
                    </p>
                    <p className="mt-2">
                      <strong>Columnas:</strong> Número Documento · Primer Apellido · Segundo Apellido · Nombre Empleado · Fecha Nacimiento · Fecha Ingreso · Contrato · Dpto Donde Labora · Cargo Empleado · Tipo Cuenta · Número Cuenta · Banco · EPS · AFP · Caja Compensación · ARL · Clase Riesgo · Fondo Cesantías · CANAL
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                      Cédula del administrador *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={bootstrapAdminCedula}
                      onChange={(e) => setBootstrapAdminCedula(e.target.value.replace(/\D/g, ''))}
                      placeholder="Cédula que deberá quedar como admin"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#f4a900] focus:border-transparent text-sm"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Esta cédula debe estar también dentro del archivo Excel.
                    </p>
                  </div>

                  <label
                    htmlFor="bootstrap-file"
                    className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#f4a900] hover:bg-orange-50/30 transition"
                  >
                    <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    {bootstrapFile ? (
                      <>
                        <p className="font-semibold text-gray-800 text-sm">{bootstrapFile.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {(bootstrapFile.size / 1024).toFixed(1)} KB · click para cambiar
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-gray-700 text-sm">Click para seleccionar archivo</p>
                        <p className="text-xs text-gray-500 mt-1">o arrástralo aquí</p>
                      </>
                    )}
                    <input
                      id="bootstrap-file"
                      ref={bootstrapFileRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => setBootstrapFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </>
              )}

              {bootstrapResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-green-700">Creados</p>
                      <p className="text-2xl font-extrabold text-green-800">{bootstrapResult.created}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-blue-700">Actualizados</p>
                      <p className="text-2xl font-extrabold text-blue-800">{bootstrapResult.updated}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Re-vinculados</p>
                      <p className="text-2xl font-extrabold text-amber-800">{bootstrapResult.fondo_relinked}</p>
                    </div>
                    <div className={`rounded-xl p-3 border ${bootstrapResult.errors > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                      <p className={`text-[10px] uppercase tracking-wider font-bold ${bootstrapResult.errors > 0 ? 'text-red-700' : 'text-gray-500'}`}>Errores</p>
                      <p className={`text-2xl font-extrabold ${bootstrapResult.errors > 0 ? 'text-red-800' : 'text-gray-700'}`}>{bootstrapResult.errors}</p>
                    </div>
                  </div>

                  {bootstrapResult.admin_promoted ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-green-900">
                        <p className="font-bold">Administrador asignado</p>
                        <p className="text-xs mt-1">
                          La cédula <strong>{bootstrapResult.admin_cedula}</strong> ya tiene rol admin. La contraseña son los últimos 8 dígitos de la cédula. Inicia sesión arriba.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-900">
                        <p className="font-bold">Atención</p>
                        <p className="text-xs mt-1">
                          La cédula <strong>{bootstrapResult.admin_cedula}</strong> no estaba en el archivo. Ningún usuario quedó con rol admin. Vuelve a hacer un wipe e incluye la cédula del admin en el Excel.
                        </p>
                      </div>
                    </div>
                  )}

                  {bootstrapResult.errors > 0 && (
                    <div className="border border-red-200 rounded-xl overflow-hidden">
                      <div className="bg-red-50 px-3 py-2 text-xs font-bold text-red-700 uppercase tracking-wider">
                        Filas con error
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-red-100 text-sm">
                        {bootstrapResult.results.filter((r) => r.status === 'error').map((r) => (
                          <div key={r.row} className="px-3 py-2">
                            <p className="text-xs text-gray-700">
                              <span className="font-semibold">Fila {r.row}</span>
                              {r.cedula && <span className="text-gray-500"> · {r.cedula}</span>}
                            </p>
                            <p className="text-xs text-red-700">{r.error}</p>
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
                onClick={closeBootstrap}
                disabled={bootstrapUploading}
                className="px-4 py-2 rounded-xl text-gray-700 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50"
              >
                {bootstrapResult ? 'Cerrar' : 'Cancelar'}
              </button>
              {!bootstrapResult && (
                <button
                  onClick={runBootstrapUpload}
                  disabled={!bootstrapFile || !bootstrapAdminCedula || bootstrapUploading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#f4a900] text-black text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow"
                >
                  {bootstrapUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {bootstrapUploading ? 'Procesando...' : 'Cargar usuarios'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
