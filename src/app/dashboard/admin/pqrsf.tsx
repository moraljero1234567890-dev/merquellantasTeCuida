"use client";

import { useState, useEffect } from "react";
import {
  MessageSquare,
  Clock,
  Loader2,
  AlertCircle,
  Eye,
  X,
  User,
  Calendar,
  FileText,
  Users,
  Send,
  CheckCircle,
} from "lucide-react";

interface PQRSF {
  _id: string;
  cedula?: string;
  created_at: string;
  is_anonymous: boolean;
  message: string;
  nombre?: string;
  type: string;
  user_id: string;
  respuesta?: string | null;
  respondido_por?: string | null;
  respondido_at?: string | null;
}

export default function PQRSFCard() {
  const [pqrsfList, setPqrsfList] = useState<PQRSF[]>([]);
  const [allPqrsfList, setAllPqrsfList] = useState<PQRSF[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // Detail/respond modal state
  const [selected, setSelected] = useState<PQRSF | null>(null);
  const [respuestaText, setRespuestaText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAnonConfirm, setShowAnonConfirm] = useState(false);

  const getAvatarInitials = (name: string) =>
    name.split(' ').map(w => w.charAt(0)).join('').toUpperCase().slice(0, 2);

  const getAvatarColor = (index: number) => {
    const colors = [
      "bg-blue-100 text-blue-600",
      "bg-green-100 text-green-600",
      "bg-purple-100 text-purple-600",
      "bg-pink-100 text-pink-600",
      "bg-yellow-100 text-yellow-600",
      "bg-indigo-100 text-indigo-600",
      "bg-red-100 text-red-600",
      "bg-orange-100 text-orange-600",
    ];
    return colors[index % colors.length];
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'Petición': 'bg-blue-100 text-blue-800',
      'Queja': 'bg-red-100 text-red-800',
      'Reclamo': 'bg-orange-100 text-orange-800',
      'Sugerencia': 'bg-green-100 text-green-800',
      'Felicitación': 'bg-purple-100 text-purple-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);

  const fetchRecentPQRSF = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/pqrsf?limit=5');
      if (!res.ok) throw new Error('Error fetching PQRSF');
      const data: PQRSF[] = await res.json();
      setPqrsfList(data);
    } catch {
      setError('Error al cargar los datos de PQRSF');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllPQRSF = async () => {
    try {
      setModalLoading(true);
      const res = await fetch('/api/pqrsf?limit=500');
      if (!res.ok) throw new Error('Error fetching all PQRSF');
      const data: PQRSF[] = await res.json();
      setAllPqrsfList(data);
    } catch {
      // ignore
    } finally {
      setModalLoading(false);
    }
  };

  const handleViewAll = async () => {
    setShowModal(true);
    await fetchAllPQRSF();
  };

  useEffect(() => {
    fetchRecentPQRSF();
  }, []);

  const handleRefresh = () => fetchRecentPQRSF();

  const openDetail = (pqrsf: PQRSF) => {
    setSelected(pqrsf);
    setRespuestaText(pqrsf.respuesta || "");
    setSubmitError(null);
  };

  const closeDetail = () => {
    setSelected(null);
    setRespuestaText("");
    setSubmitError(null);
    setShowAnonConfirm(false);
  };

  const handleSubmitClick = () => {
    if (!selected || !respuestaText.trim()) {
      setSubmitError('La respuesta es requerida');
      return;
    }
    if (selected.is_anonymous) {
      setShowAnonConfirm(true);
      return;
    }
    submitResponse();
  };

  const submitResponse = async () => {
    if (!selected || !respuestaText.trim()) {
      setSubmitError('La respuesta es requerida');
      return;
    }
    setShowAnonConfirm(false);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/pqrsf', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected._id, respuesta: respuestaText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al guardar la respuesta');
      }
      // Refresh both lists
      await Promise.all([fetchRecentPQRSF(), showModal ? fetchAllPQRSF() : Promise.resolve()]);
      closeDetail();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const renderPQRSFRow = (pqrsf: PQRSF, index: number) => {
    const isAnon = !!pqrsf.is_anonymous;
    const hasResponse = !!pqrsf.respuesta;
    return (
      <button
        key={pqrsf._id}
        onClick={() => openDetail(pqrsf)}
        className="w-full text-left flex items-start p-4 rounded-xl hover:bg-blue-50/50 transition-colors border border-gray-100 hover:border-blue-200 hover:shadow-sm"
      >
        <div className={`w-10 h-10 rounded-full overflow-hidden ${isAnon ? 'bg-gray-200 text-gray-600' : getAvatarColor(index)} flex items-center justify-center font-medium flex-shrink-0`}>
          {isAnon || !pqrsf.nombre ? <User className="h-5 w-5" /> : getAvatarInitials(pqrsf.nombre)}
        </div>
        <div className="flex-1 ml-3 min-w-0">
          <div className="flex items-center justify-between mb-1 gap-2">
            <h3 className="font-medium text-gray-900 truncate flex items-center gap-2">
              <span className="truncate">{pqrsf.nombre || 'Sin nombre'}</span>
              {isAnon && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0">
                  Anónimo
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {hasResponse && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                  <CheckCircle className="h-3 w-3" />
                  Respondido
                </span>
              )}
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(pqrsf.type)}`}>
                {pqrsf.type}
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">{pqrsf.message}</p>
          <div className="flex items-center text-xs text-gray-500 space-x-4">
            <div className="flex items-center">
              <Calendar className="h-3 w-3 mr-1" />
              {formatDate(new Date(pqrsf.created_at))}
            </div>
            {pqrsf.cedula && (
              <div className="flex items-center">
                <FileText className="h-3 w-3 mr-1" />
                {pqrsf.cedula}
              </div>
            )}
          </div>
        </div>
      </button>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow duration-300 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-gray-900 flex items-center">
            <MessageSquare className="h-5 w-5 mr-2 text-blue-500" />
            PQRSF Recientes
          </h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Cargando PQRSF...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-gray-900 flex items-center">
            <MessageSquare className="h-5 w-5 mr-2 text-blue-500" />
            PQRSF Recientes
          </h2>
          <button onClick={handleRefresh} className="text-sm text-gray-500 hover:text-gray-700 flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            Actualizar
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
    <>
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow duration-300 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-gray-900 flex items-center">
            <MessageSquare className="h-5 w-5 mr-2 text-blue-500" />
            PQRSF Recientes ({pqrsfList.length})
          </h2>
          <div className="flex gap-2">
            <button onClick={handleViewAll} className="text-sm text-blue-600 hover:text-blue-800 flex items-center">
              <Eye className="h-4 w-4 mr-1" />
              Ver todos
            </button>
            <button onClick={handleRefresh} className="text-sm text-gray-500 hover:text-gray-700 flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              Actualizar
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {pqrsfList.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No hay PQRSF registrados.</p>
            </div>
          ) : (
            pqrsfList.map((pqrsf, index) => renderPQRSFRow(pqrsf, index))
          )}
        </div>
      </div>

      {/* Modal: All PQRSF */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 flex items-center">
                <Users className="h-6 w-6 mr-2 text-blue-500" />
                Todos los PQRSF ({allPqrsfList.length})
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {modalLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  <span className="ml-3 text-gray-500">Cargando todos los PQRSF...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {allPqrsfList.map((pqrsf, index) => renderPQRSFRow(pqrsf, index))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail / Respond modal */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-start p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full ${selected.is_anonymous ? 'bg-gray-200 text-gray-600' : getAvatarColor(0)} flex items-center justify-center font-bold`}>
                  {selected.is_anonymous || !selected.nombre ? <User className="h-6 w-6" /> : getAvatarInitials(selected.nombre)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900">{selected.nombre || 'Sin nombre'}</h3>
                    {selected.is_anonymous && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                        Enviado como anónimo
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${getTypeColor(selected.type)}`}>
                      {selected.type}
                    </span>
                    {selected.cedula && <span>CC {selected.cedula}</span>}
                    <span>•</span>
                    <span>{formatDate(new Date(selected.created_at))}</span>
                  </div>
                </div>
              </div>
              <button onClick={closeDetail} className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Original message */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mensaje del usuario</label>
                <div className="mt-2 p-4 bg-gray-50 rounded-xl border border-gray-200 text-gray-800 whitespace-pre-wrap">
                  {selected.message}
                </div>
              </div>

              {/* Existing response if any */}
              {selected.respuesta && (
                <div>
                  <label className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Respuesta enviada
                    {selected.respondido_at && (
                      <span className="text-gray-500 normal-case font-normal ml-2">
                        ({formatDate(new Date(selected.respondido_at))})
                      </span>
                    )}
                  </label>
                  <div className="mt-2 p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-gray-800 whitespace-pre-wrap">
                    {selected.respuesta}
                  </div>
                </div>
              )}

              {/* Response form */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {selected.respuesta ? 'Editar respuesta' : 'Escribir respuesta'}
                </label>
                <textarea
                  value={respuestaText}
                  onChange={(e) => setRespuestaText(e.target.value)}
                  rows={5}
                  maxLength={5000}
                  placeholder="Escribe tu respuesta aquí..."
                  className="mt-2 w-full p-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500 resize-y text-gray-900"
                />
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-gray-400">{respuestaText.length}/5000</p>
                  {submitError && <p className="text-xs text-red-600">{submitError}</p>}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={closeDetail}
                className="px-4 py-2 rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 font-medium transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitClick}
                disabled={submitting || !respuestaText.trim()}
                className="px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {selected.respuesta ? 'Actualizar respuesta' : 'Enviar respuesta'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anonymous PQRSF confirmation modal */}
      {showAnonConfirm && selected && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center border-b border-gray-200">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-8 w-8 text-amber-600" />
              </div>
              <p className="text-sm text-gray-600 mb-3">Recuerda que este PQRSF es</p>
              <p className="text-5xl font-black tracking-wider text-amber-600 mb-3">ANÓNIMO</p>
              <p className="text-sm text-gray-700">¿Estás seguro que lo quieres enviar?</p>
            </div>
            <div className="p-5 flex justify-end gap-3 bg-gray-50">
              <button
                onClick={() => setShowAnonConfirm(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 font-medium transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={submitResponse}
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-50 transition flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Sí, enviar respuesta
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
