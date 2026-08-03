import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11, fontFamily: 'Helvetica', color: '#1a1a1a' },
  title: { fontSize: 16, marginBottom: 2, fontWeight: 700 },
  subtitle: { fontSize: 10, color: '#555', marginBottom: 16 },
  section: { marginBottom: 14 },
  label: { color: '#777', fontSize: 9, marginBottom: 2 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    fontWeight: 700,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
  message: { marginTop: 20, fontSize: 10, lineHeight: 1.5 },
});

export interface PurchaseOrderPdfItem {
  product_model: string;
  supplier_sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface PurchaseOrderPdfInput {
  supplierName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  currency: string;
  items: PurchaseOrderPdfItem[];
  subtotal: number;
  message: string;
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Renders a simple "request for quote" PDF for a purchase order — product,
 *  SKU, quantity and reference price per line, plus the requester's contact
 *  info and message — to attach to the supplier-notification email (see
 *  app/api/purchase-orders/[orderId]/notify-supplier-email). Deliberately not
 *  the full technical PrintableReport: a supplier needs what to quote, not
 *  the customer's economic analysis. */
export async function renderPurchaseOrderPdf(input: PurchaseOrderPdfInput): Promise<string> {
  const buffer = await renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Solicitação de cotação</Text>
        <Text style={styles.subtitle}>Para {input.supplierName}</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Solicitante</Text>
          <Text>{input.customerName}</Text>
          <Text>
            {input.customerEmail}
            {input.customerPhone ? ` · ${input.customerPhone}` : ''}
          </Text>
        </View>

        <View style={styles.headerRow}>
          <Text style={{ flex: 3 }}>Produto</Text>
          <Text style={{ flex: 1, textAlign: 'right' }}>Qtd.</Text>
          <Text style={{ flex: 2, textAlign: 'right' }}>Preço unit.</Text>
          <Text style={{ flex: 2, textAlign: 'right' }}>Total</Text>
        </View>
        {input.items.map((item, index) => (
          <View style={styles.row} key={index}>
            <Text style={{ flex: 3 }}>
              {item.product_model} ({item.supplier_sku})
            </Text>
            <Text style={{ flex: 1, textAlign: 'right' }}>{item.quantity}</Text>
            <Text style={{ flex: 2, textAlign: 'right' }}>{formatMoney(item.unit_price, input.currency)}</Text>
            <Text style={{ flex: 2, textAlign: 'right' }}>{formatMoney(item.line_total, input.currency)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={{ flex: 6, textAlign: 'right', fontWeight: 700 }}>Subtotal de referência</Text>
          <Text style={{ flex: 2, textAlign: 'right', fontWeight: 700 }}>{formatMoney(input.subtotal, input.currency)}</Text>
        </View>

        <Text style={styles.message}>{input.message}</Text>
      </Page>
    </Document>
  );
  return buffer.toString('base64');
}
