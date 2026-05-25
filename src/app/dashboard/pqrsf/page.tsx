"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardNavbar from '../navbar';
import { X, Send, AlertCircle, History, MessageSquare, CheckCircle, Clock, Calendar, Sparkles } from 'lucide-react';
import { useSession } from 'next-auth/react';

type PqrsfType = 'Petición' | 'Queja' | 'Reclamo' | 'Sugerencia' | 'Felicitación';

interface MyPQRSF {
  _id: string;
  type: string;
  message: string;
  is_anonymous: boolean;
  created_at: string;
  respuesta?: string | null;
  respondido_at?: string | null;
}

export default function PqrsfPage() {
  const { data: session } = useSession();
  const [type, setType] = useState<PqrsfType>('Petición');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // My PQRSF history
  const [myPqrsf, setMyPqrsf] = useState<MyPQRSF[]>([]);
  const [loadingMy, setLoadingMy] = useState(true);

  const fetchMyPqrsf = useCallback(async () => {
    if (!session) return;
    setLoadingMy(true);
    try {
      const res = await fetch('/api/pqrsf?limit=100&mine=true');
      if (res.ok) {
        const data: MyPQRSF[] = await res.json();
        setMyPqrsf(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMy(false);
    }
  }, [session]);

  useEffect(() => {
    fetchMyPqrsf();
  }, [fetchMyPqrsf]);

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('es-CO', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);

  const getTypeColor = (t: string) => {
    const colors: Record<string, string> = {
      'Petición': 'bg-blue-100 text-blue-800',
      'Queja': 'bg-red-100 text-red-800',
      'Reclamo': 'bg-orange-100 text-orange-800',
      'Sugerencia': 'bg-green-100 text-green-800',
      'Felicitación': 'bg-purple-100 text-purple-800',
    };
    return colors[t] || 'bg-gray-100 text-gray-800';
  };

  const handleAnonymousToggle = () => {
    if (!isAnonymous) setShowConfirm(true);
    else setIsAnonymous(false);
  };

  const confirmAnonymous = () => { setIsAnonymous(true); setShowConfirm(false); };
  const cancelAnonymous = () => { setShowConfirm(false); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setSubmitError('El mensaje no puede estar vacío.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);

    try {
      if (!session) throw new Error('Debes iniciar sesión antes de enviar.');

      const res = await fetch('/api/pqrsf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message: message.trim(), isAnonymous }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al enviar');
      }

      // send email notification
      try {
        const emails = [
          'marcelagonzalez@merquellantas.com',
          'saludocupacional@merquellantas.com',
          'dptodelagente@merquellantas.com',
        ];
        const displayName = session.user.nombre || 'Usuario';
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emails,
            userName: displayName,
            subject: `Nueva PQRSF: ${type}`,
            html: `
              <h2>Nueva PQRSF registrada</h2>
              <p>Se ha registrado una nueva PQRSF en el sistema.</p>
              <p><strong>Tipo:</strong> ${type}</p>
              <p><strong>Usuario:</strong> ${displayName}${isAnonymous ? ' (enviado como anónimo)' : ''}</p>
              <p>Por favor ingrese al sistema para revisarla.</p>
            `,
          }),
        });
      } catch (emailErr) {
        console.error('Email notification failed:', emailErr);
      }

      setSubmitted(true);
      fetchMyPqrsf();
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Error al enviar. Intenta de nuevo.';
      setSubmitError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // Success screen after submission — animated Merquito celebration
  if (submitted) {
    return (
      <>
        <DashboardNavbar activePage="pqrsf" />
        <div className="pt-20 min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-white flex items-center justify-center px-4 py-10 text-black overflow-hidden relative">
          {/* Decorative floating particles */}
          <AnimatePresence>
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 0, x: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  y: [-20, -120 - Math.random() * 100],
                  x: [0, (Math.random() - 0.5) * 200],
                  scale: [0, 1, 0.5],
                  rotate: [0, Math.random() * 360],
                }}
                transition={{
                  duration: 3 + Math.random() * 2,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: "easeOut",
                }}
                className="absolute top-1/2 left-1/2 pointer-events-none"
              >
                <Sparkles className={`h-${4 + (i % 3)} w-${4 + (i % 3)} text-[#f4a900]`} />
              </motion.div>
            ))}
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-white p-8 sm:p-10 rounded-3xl shadow-2xl text-center max-w-lg w-full border border-amber-100 z-10"
          >
            {/* Glow behind merquito */}
            <div className="relative w-40 h-40 mx-auto mb-6">
              <motion.div
                animate={{
                  scale: [1, 1.15, 1],
                  opacity: [0.4, 0.7, 0.4],
                }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 bg-[#f4a900] rounded-full blur-2xl"
              />
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.2,
                }}
                className="relative w-full h-full"
              >
                <motion.div
                  animate={{
                    y: [0, -8, 0],
                  }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="w-full h-full"
                >
                  <Image
                    src="/merquito.jpeg"
                    alt="Merquito - Mascota Merquellantas"
                    width={160}
                    height={160}
                    priority
                    className="rounded-full ring-4 ring-[#f4a900] shadow-xl object-cover w-full h-full"
                  />
                </motion.div>
              </motion.div>
            </div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3"
            >
              ¡Gracias por tus <span className="text-[#f4a900]">aportes</span>!
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="text-gray-600 leading-relaxed mb-2 text-sm sm:text-base"
            >
              Merquellantas se está reinventando y lo estamos haciendo de la mano tuya.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.5 }}
              className="text-gray-600 leading-relaxed mb-8 text-sm sm:text-base"
            >
              No dudes en comentarnos cualquier idea o problema y nos aseguraremos que todo se haga de la mejor forma.
            </motion.p>

            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.5 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSubmitted(false)}
              className="px-6 py-3 bg-gradient-to-r from-[#f4a900] to-amber-500 text-black font-bold rounded-full hover:shadow-lg hover:shadow-[#f4a900]/40 transition-all flex items-center justify-center gap-2 w-full sm:w-auto mx-auto"
            >
              <Send size={18} />
              Enviar otra PQRSF
            </motion.button>
          </motion.div>
        </div>
      </>
    );
  }

  // Form screen
  return (
    <>
      <DashboardNavbar activePage='pqrsf' />
      <div className="pt-20 min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-10 px-4 sm:px-6 lg:px-8 text-black">
        <div className="max-w-2xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Enviar una PQRSF</h1>
            <div className="mt-2 sm:mt-0 text-sm text-gray-500 italic">
              Su opinión es importante
            </div>
          </div>

          {submitError && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 border border-red-100">
              <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
              <p>{submitError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tipo */}
            <div className="space-y-2">
              <label htmlFor="type" className="block text-sm font-medium text-gray-700">Tipo de solicitud</label>
              <div className="relative">
                <select
                  id="type"
                  value={type}
                  onChange={e => setType(e.target.value as PqrsfType)}
                  className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 py-3 px-4 bg-white appearance-none"
                >
                  {['Petición','Queja','Reclamo','Sugerencia','Felicitación']
                    .map(o => <option key={o}>{o}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Mensaje */}
            <div className="space-y-2">
              <label htmlFor="message" className="block text-sm font-medium text-gray-700">Mensaje</label>
              <textarea
                id="message"
                rows={6}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Escribe tu mensaje aquí..."
                className="mt-1 block w-full rounded-xl border-gray-300 shadow-sm focus:ring-amber-500 focus:border-amber-500 p-4 resize-y"
              />
              <p className="text-xs text-gray-500 ml-1">
                Sé claro y específico para poder atender mejor tu solicitud.
              </p>
            </div>

            {/* Anónimo */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
              <button
                type="button"
                onClick={handleAnonymousToggle}
                className={`px-5 py-3 rounded-xl border transition-colors ${
                  isAnonymous
                    ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                } flex items-center gap-2`}
              >
                <span className={`w-4 h-4 rounded-full border ${isAnonymous ? 'bg-white border-white' : 'border-gray-400'} flex items-center justify-center`}>
                  {isAnonymous && <span className="w-2 h-2 rounded-full bg-amber-500"></span>}
                </span>
                {isAnonymous ? 'Anónimo activado' : 'Enviar como anónimo'}
              </button>

              {isAnonymous && (
                <span className="text-sm text-gray-600 mt-2 sm:mt-0">
                  Haz clic de nuevo para cancelar el modo anónimo
                </span>
              )}
            </div>

            {/* Submit */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex justify-center items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl shadow-md hover:from-amber-600 hover:to-amber-700 transition-colors disabled:opacity-50 font-medium"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Enviar {type.toLowerCase()}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Mis PQRSF History */}
        <div className="max-w-2xl mx-auto mt-8 bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <History className="h-6 w-6 text-amber-500" />
              Mis PQRSF
            </h2>
            <span className="text-sm text-gray-500">{myPqrsf.length} {myPqrsf.length === 1 ? 'registro' : 'registros'}</span>
          </div>

          {loadingMy ? (
            <div className="py-8 text-center text-gray-400">Cargando...</div>
          ) : myPqrsf.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Aún no has enviado ninguna PQRSF.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {myPqrsf.map((p) => (
                <div key={p._id} className="border border-gray-200 rounded-xl p-4 hover:border-amber-200 hover:bg-amber-50/30 transition-colors">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(p.type)}`}>
                        {p.type}
                      </span>
                      {p.is_anonymous && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                          Enviado como anónimo
                        </span>
                      )}
                      {p.respuesta ? (
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
                    <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                      <Calendar className="h-3 w-3" />
                      {formatDate(new Date(p.created_at))}
                    </span>
                  </div>

                  <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{p.message}</p>

                  {p.respuesta && (
                    <div className="mt-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                      <div className="flex items-center gap-2 mb-1.5">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                          Respuesta del Administrador
                        </span>
                        {p.respondido_at && (
                          <span className="text-xs text-emerald-600/70">
                            • {formatDate(new Date(p.respondido_at))}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{p.respuesta}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Anonymous Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl relative border border-gray-100 animate-fadeIn">
            <button
              onClick={cancelAnonymous}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Cerrar"
            >
              <X size={24} />
            </button>

            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertCircle size={24} className="text-amber-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                Confirmar envío anónimo
              </h2>
            </div>

            <p className="text-gray-700 mb-6">
              Al escoger el envío anónimo no podremos identificar quién envió esta solicitud, lo cual puede retrasar o dificultar una respuesta personalizada.
            </p>

            <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
              <button
                onClick={cancelAnonymous}
                className="order-2 sm:order-1 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmAnonymous}
                className="order-1 sm:order-2 px-5 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors shadow-md"
              >
                Continuar como anónimo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
