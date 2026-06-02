import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

/**
 * Renders a MERQUELLANTAS "Orden de trabajo" (lubricentro work order) as a PDF
 * from a stored order document. Runs inside a Next.js route handler via
 * @react-pdf/renderer's renderToBuffer (no system binaries needed).
 */

export interface OrdenServicio {
  servicio?: string;
  referencia?: string;
  unidad?: string;
  valor_unitario?: string;
  subtotal?: string;
  exento_iva?: boolean;
}

export interface OrdenPdfData {
  orden_no?: string;
  fecha?: string;
  factura_no?: string;
  forma_pago?: string;
  asesor_servicio?: string;
  nombre?: string;
  cedula_nit?: string;
  fecha_cumpleanos?: string;
  direccion?: string;
  celular?: string;
  correo?: string;
  cliente?: string;
  placa?: string;
  marca?: string;
  tipo?: string;
  km_actual?: string;
  frec_cambio_km?: string;
  proximo_cambio_meses?: string;
  observaciones?: string;
  subtotal?: string;
  iva?: string;
  total?: string;
  servicios?: OrdenServicio[];
}

const AMBER = '#f4a900';
const DARK = '#1f2937';
const GRAY = '#6b7280';
const LINE = '#e5e7eb';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: DARK, fontFamily: 'Helvetica' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 3,
    borderBottomColor: AMBER,
    paddingBottom: 10,
    marginBottom: 14,
  },
  brand: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: AMBER },
  brandSub: { fontSize: 8, color: GRAY, marginTop: 2 },
  titleBox: { alignItems: 'flex-end' },
  title: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: DARK },
  orderNo: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: AMBER, marginTop: 2 },
  metaRow: { flexDirection: 'row', marginBottom: 14 },
  metaItem: { flex: 1 },
  label: { fontSize: 7, color: GRAY, textTransform: 'uppercase', marginBottom: 2 },
  value: { fontSize: 9, color: DARK },
  twoCol: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  card: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
  cardTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: AMBER, marginBottom: 6 },
  field: { flexDirection: 'row', marginBottom: 3 },
  fieldLabel: { width: 70, fontSize: 8, color: GRAY },
  fieldValue: { flex: 1, fontSize: 8, color: DARK },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 6 },
  tHead: { flexDirection: 'row', backgroundColor: '#fff7e6', borderBottomWidth: 1, borderBottomColor: AMBER },
  tRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE },
  th: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: DARK, padding: 4, textTransform: 'uppercase' },
  td: { fontSize: 8, color: DARK, padding: 4 },
  cServ: { width: '34%' },
  cRef: { width: '22%' },
  cUni: { width: '10%', textAlign: 'right' },
  cVal: { width: '17%', textAlign: 'right' },
  cSub: { width: '17%', textAlign: 'right' },
  totals: { marginTop: 10, alignItems: 'flex-end' },
  totalLine: { flexDirection: 'row', width: 200, justifyContent: 'space-between', marginBottom: 2 },
  totalLabel: { fontSize: 9, color: GRAY },
  totalValue: { fontSize: 9, color: DARK },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: AMBER },
  obs: { marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
  footer: { position: 'absolute', bottom: 24, left: 32, right: 32, textAlign: 'center', fontSize: 7, color: GRAY },
});

function money(v?: string): string {
  const n = parseInt(v || '', 10);
  return Number.isFinite(n) ? `$ ${new Intl.NumberFormat('es-CO').format(n)}` : v || '—';
}

function dash(v?: string): string {
  return v && String(v).trim() ? String(v) : '—';
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{dash(value)}</Text>
    </View>
  );
}

function OrdenDoc({ o }: { o: OrdenPdfData }) {
  const servicios = (o.servicios || []).filter((s) => s.servicio);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>MERQUELLANTAS</Text>
            <Text style={styles.brandSub}>S.A.S · Orden de trabajo</Text>
          </View>
          <View style={styles.titleBox}>
            <Text style={styles.title}>ORDEN DE TRABAJO</Text>
            <Text style={styles.orderNo}>No. {dash(o.orden_no)}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Fecha</Text>
            <Text style={styles.value}>{dash(o.fecha)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Factura No.</Text>
            <Text style={styles.value}>{dash(o.factura_no)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Forma de pago</Text>
            <Text style={styles.value}>{dash(o.forma_pago)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Asesor</Text>
            <Text style={styles.value}>{dash(o.asesor_servicio)}</Text>
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>CLIENTE</Text>
            <Row label="Conductor" value={o.nombre} />
            <Row label="Cédula/NIT" value={o.cedula_nit} />
            <Row label="Empresa" value={o.cliente} />
            <Row label="Celular" value={o.celular} />
            <Row label="Correo" value={o.correo} />
            <Row label="Dirección" value={o.direccion} />
            <Row label="Cumpleaños" value={o.fecha_cumpleanos} />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>VEHÍCULO</Text>
            <Row label="Placa" value={o.placa} />
            <Row label="Marca" value={o.marca} />
            <Row label="Tipo" value={o.tipo} />
            <Row label="KM actual" value={o.km_actual} />
            <Row label="Frec. (km)" value={o.frec_cambio_km} />
            <Row label="Próx. (meses)" value={o.proximo_cambio_meses} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Servicios</Text>
        <View style={styles.tHead}>
          <Text style={[styles.th, styles.cServ]}>Servicio</Text>
          <Text style={[styles.th, styles.cRef]}>Referencia</Text>
          <Text style={[styles.th, styles.cUni]}>Und</Text>
          <Text style={[styles.th, styles.cVal]}>V. Unit.</Text>
          <Text style={[styles.th, styles.cSub]}>Subtotal</Text>
        </View>
        {servicios.length === 0 ? (
          <View style={styles.tRow}>
            <Text style={[styles.td, { width: '100%', color: GRAY }]}>Sin servicios registrados.</Text>
          </View>
        ) : (
          servicios.map((s, i) => (
            <View style={styles.tRow} key={i}>
              <Text style={[styles.td, styles.cServ]}>
                {dash(s.servicio)}
                {s.exento_iva ? ' *' : ''}
              </Text>
              <Text style={[styles.td, styles.cRef]}>{dash(s.referencia)}</Text>
              <Text style={[styles.td, styles.cUni]}>{dash(s.unidad)}</Text>
              <Text style={[styles.td, styles.cVal]}>{money(s.valor_unitario)}</Text>
              <Text style={[styles.td, styles.cSub]}>{money(s.subtotal)}</Text>
            </View>
          ))
        )}

        <View style={styles.totals}>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{money(o.subtotal)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>IVA (19%)</Text>
            <Text style={styles.totalValue}>{money(o.iva)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{money(o.total)}</Text>
          </View>
        </View>

        {o.observaciones && o.observaciones.trim() ? (
          <View style={styles.obs}>
            <Text style={styles.label}>Observaciones</Text>
            <Text style={styles.value}>{o.observaciones}</Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          * Productos exentos de IVA (lubricantes). Documento generado por Merque Bienestar.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderOrdenPdf(o: OrdenPdfData): Promise<Buffer> {
  return renderToBuffer(<OrdenDoc o={o} />);
}
