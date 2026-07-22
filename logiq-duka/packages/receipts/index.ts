/**
 * Receipt rendering — one source, three outputs (PRD §24):
 * ESC/POS bytes (58/80mm via Print Relay), HTML (hosted QR receipt page),
 * and WhatsApp text. Built in milestone M2. The renderer will take a
 * canonical ReceiptModel and emit all three, appending KRA QR + fiscal
 * number once the fiscal document is signed (PRD §29.2).
 */
export interface ReceiptModel {
  tenantName: string;
  receiptNo: string;          // tenant-global or device-provisional ref
  lines: Array<{ name: string; qty: number; unitPriceCents: number; totalCents: number }>;
  totalCents: number;
  vatCents: number;
  tender: string;
  fiscal?: { kraInvoiceNo: string; qrPayload: string };
  provisional: boolean;       // "PROVISIONAL — fiscal copy to follow"
}
