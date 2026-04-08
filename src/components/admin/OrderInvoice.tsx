import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

interface InvoiceItem {
  id: string;
  books?: { title: string; cover_url?: string };
  format: string;
  quantity: number;
  unit_price: number;
}

interface InvoiceProps {
  order: any;
  items: InvoiceItem[];
  onClose?: () => void;
  customerEmail?: string;
}

export function OrderInvoice({ order, items, onClose, customerEmail }: InvoiceProps) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const { get } = useSiteSettings();
  const brandName = get("brand_name", "BoiAro");
  const contactEmail = get("contact_email", "info@boiaro.com");
  const invoiceNumber = `INV-${(order.order_number || order.id.slice(0, 8)).replace("BOI-", "")}`;
  const orderDate = new Date(order.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const subtotal = items.reduce((s, i) => s + i.unit_price * (i.quantity || 1), 0);
  const shippingCost = order.shipping_cost || 0;
  const packagingCost = order.packaging_cost || 0;
  const discountAmount = order.discount_amount || 0;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !invoiceRef.current) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoiceNumber}</title>
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a1a; background: #fff; }
          @page { size: A4; margin: 15mm; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          .invoice { max-width: 210mm; margin: 0 auto; padding: 32px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #1a1a1a; }
          .brand h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
          .brand p { font-size: 11px; color: #666; margin-top: 2px; }
          .invoice-meta { text-align: right; }
          .invoice-meta h2 { font-size: 20px; font-weight: 700; color: #333; }
          .invoice-meta p { font-size: 12px; color: #666; margin-top: 2px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
          .info-block h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 6px; font-weight: 600; }
          .info-block p { font-size: 13px; line-height: 1.5; }
          .info-block .name { font-weight: 600; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #666; font-weight: 600; padding: 10px 12px; border-bottom: 2px solid #e5e5e5; text-align: left; }
          thead th:last-child, thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
          tbody td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
          tbody td:last-child, tbody td:nth-child(3), tbody td:nth-child(4) { text-align: right; }
          .format-badge { display: inline-block; font-size: 10px; padding: 1px 6px; background: #f3f4f6; border-radius: 4px; color: #555; margin-left: 6px; text-transform: capitalize; }
          .totals { margin-left: auto; width: 260px; }
          .totals .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: #555; }
          .totals .row.grand { font-size: 16px; font-weight: 700; color: #1a1a1a; border-top: 2px solid #1a1a1a; padding-top: 10px; margin-top: 6px; }
          .payment-info { display: flex; gap: 24px; padding: 16px; background: #f9fafb; border-radius: 8px; margin-bottom: 28px; font-size: 12px; }
          .payment-info .label { color: #999; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          .payment-info .value { font-weight: 600; margin-top: 2px; }
          .footer { text-align: center; padding-top: 24px; border-top: 1px solid #e5e5e5; }
          .footer p { font-size: 11px; color: #999; }
          .footer .thanks { font-size: 14px; font-weight: 600; color: #333; margin-bottom: 4px; }
        </style>
      </head>
      <body>
        ${invoiceRef.current.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 400);
  };

  const handleDownload = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !invoiceRef.current) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoiceNumber}</title>
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a1a; background: #fff; }
          @page { size: A4; margin: 15mm; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          .invoice { max-width: 210mm; margin: 0 auto; padding: 32px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #1a1a1a; }
          .brand h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
          .brand p { font-size: 11px; color: #666; margin-top: 2px; }
          .invoice-meta { text-align: right; }
          .invoice-meta h2 { font-size: 20px; font-weight: 700; color: #333; }
          .invoice-meta p { font-size: 12px; color: #666; margin-top: 2px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
          .info-block h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 6px; font-weight: 600; }
          .info-block p { font-size: 13px; line-height: 1.5; }
          .info-block .name { font-weight: 600; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #666; font-weight: 600; padding: 10px 12px; border-bottom: 2px solid #e5e5e5; text-align: left; }
          thead th:last-child, thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
          tbody td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
          tbody td:last-child, tbody td:nth-child(3), tbody td:nth-child(4) { text-align: right; }
          .format-badge { display: inline-block; font-size: 10px; padding: 1px 6px; background: #f3f4f6; border-radius: 4px; color: #555; margin-left: 6px; text-transform: capitalize; }
          .totals { margin-left: auto; width: 260px; }
          .totals .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: #555; }
          .totals .row.grand { font-size: 16px; font-weight: 700; color: #1a1a1a; border-top: 2px solid #1a1a1a; padding-top: 10px; margin-top: 6px; }
          .payment-info { display: flex; gap: 24px; padding: 16px; background: #f9fafb; border-radius: 8px; margin-bottom: 28px; font-size: 12px; }
          .payment-info .label { color: #999; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          .payment-info .value { font-weight: 600; margin-top: 2px; }
          .footer { text-align: center; padding-top: 24px; border-top: 1px solid #e5e5e5; }
          .footer p { font-size: 11px; color: #999; }
          .footer .thanks { font-size: 14px; font-weight: 600; color: #333; margin-bottom: 4px; }
        </style>
        <script>
          window.onload = function() {
            document.title = 'Invoice_${invoiceNumber}';
            window.print();
          };
        </script>
      </head>
      <body>
        ${invoiceRef.current.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const paymentMethodLabel = order.payment_method === "cod" ? "Cash on Delivery" : (order.payment_method || "Online Payment");
  const paymentStatus = order.payment_method === "cod"
    ? (order.cod_payment_status === "paid" || order.cod_payment_status === "settled_to_merchant" ? "Paid" : "Pending")
    : (["paid", "completed"].includes(order.status) ? "Paid" : "Pending");

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex gap-2 justify-end print:hidden">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
          <Printer className="h-4 w-4" /> Print Invoice
        </Button>
        <Button size="sm" className="gap-1.5" onClick={handleDownload}>
          <Download className="h-4 w-4" /> Download PDF
        </Button>
      </div>

      {/* Invoice Preview */}
      <div
        ref={invoiceRef}
        className="bg-white text-black rounded-lg border p-6 text-sm"
        style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
      >
        <div className="invoice">
          {/* Header */}
          <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, paddingBottom: 20, borderBottom: "3px solid #1a1a1a" }}>
            <div className="brand">
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>{brandName}</h1>
              <p style={{ fontSize: 11, color: "#666", marginTop: 2 }}>বই আড়ো — Your Digital Library</p>
            </div>
            <div className="invoice-meta" style={{ textAlign: "right" }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#333" }}>INVOICE</h2>
              <p style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{invoiceNumber}</p>
              <p style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{orderDate}</p>
            </div>
          </div>

          {/* Customer & Order Info */}
          <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 28 }}>
            <div className="info-block">
              <h3 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 6, fontWeight: 600 }}>Bill To</h3>
              <p className="name" style={{ fontWeight: 600, fontSize: 14 }}>{order.shipping_name || "Customer"}</p>
              {customerEmail && <p style={{ fontSize: 13, lineHeight: 1.5 }}>{customerEmail}</p>}
              {order.shipping_phone && <p style={{ fontSize: 13, lineHeight: 1.5 }}>{order.shipping_phone}</p>}
              {order.shipping_address && <p style={{ fontSize: 13, lineHeight: 1.5 }}>{order.shipping_address}</p>}
              {order.shipping_district && <p style={{ fontSize: 13, lineHeight: 1.5 }}>{[order.shipping_area, order.shipping_district].filter(Boolean).join(", ")}</p>}
            </div>
            <div className="info-block" style={{ textAlign: "right" }}>
              <h3 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 6, fontWeight: 600 }}>Order Details</h3>
              <p style={{ fontSize: 13, lineHeight: 1.5 }}>Order: {order.order_number || order.id.slice(0, 8).toUpperCase()}</p>
              <p style={{ fontSize: 13, lineHeight: 1.5 }}>Date: {orderDate}</p>
              <p style={{ fontSize: 13, lineHeight: 1.5 }}>Status: {order.status}</p>
            </div>
          </div>

          {/* Items Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
            <thead>
              <tr>
                <th style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: "#666", fontWeight: 600, padding: "10px 12px", borderBottom: "2px solid #e5e5e5", textAlign: "left" }}>#</th>
                <th style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: "#666", fontWeight: 600, padding: "10px 12px", borderBottom: "2px solid #e5e5e5", textAlign: "left" }}>Item</th>
                <th style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: "#666", fontWeight: 600, padding: "10px 12px", borderBottom: "2px solid #e5e5e5", textAlign: "right" }}>Qty</th>
                <th style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: "#666", fontWeight: 600, padding: "10px 12px", borderBottom: "2px solid #e5e5e5", textAlign: "right" }}>Price</th>
                <th style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: "#666", fontWeight: 600, padding: "10px 12px", borderBottom: "2px solid #e5e5e5", textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id}>
                  <td style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #f0f0f0" }}>{idx + 1}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #f0f0f0" }}>
                    {item.books?.title || "Book"}
                    <span className="format-badge" style={{ display: "inline-block", fontSize: 10, padding: "1px 6px", background: "#f3f4f6", borderRadius: 4, color: "#555", marginLeft: 6, textTransform: "capitalize" }}>{item.format}</span>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>{item.quantity || 1}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>৳{item.unit_price}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #f0f0f0", textAlign: "right" }}>৳{item.unit_price * (item.quantity || 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="totals" style={{ marginLeft: "auto", width: 260 }}>
            <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: "#555" }}>
              <span>Subtotal</span><span>৳{subtotal}</span>
            </div>
            {shippingCost > 0 && (
              <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: "#555" }}>
                <span>Delivery Charge</span><span>৳{shippingCost}</span>
              </div>
            )}
            {packagingCost > 0 && (
              <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: "#555" }}>
                <span>Packaging</span><span>৳{packagingCost}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="row" style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: "#2e7d32" }}>
                <span>Discount</span><span>−৳{discountAmount}</span>
              </div>
            )}
            <div className="row grand" style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "#1a1a1a", borderTop: "2px solid #1a1a1a", paddingTop: 10, marginTop: 6 }}>
              <span>Total</span><span>৳{order.total_amount}</span>
            </div>
          </div>

          {/* Payment Info */}
          <div className="payment-info" style={{ display: "flex", gap: 24, padding: 16, background: "#f9fafb", borderRadius: 8, marginTop: 24, marginBottom: 28, fontSize: 12 }}>
            <div>
              <div className="label" style={{ color: "#999", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Payment Method</div>
              <div className="value" style={{ fontWeight: 600, marginTop: 2 }}>{paymentMethodLabel}</div>
            </div>
            <div>
              <div className="label" style={{ color: "#999", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Payment Status</div>
              <div className="value" style={{ fontWeight: 600, marginTop: 2 }}>{paymentStatus}</div>
            </div>
            {order.total_weight > 0 && (
              <div>
                <div className="label" style={{ color: "#999", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Package Weight</div>
                <div className="value" style={{ fontWeight: 600, marginTop: 2 }}>{order.total_weight} kg</div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="footer" style={{ textAlign: "center", paddingTop: 24, borderTop: "1px solid #e5e5e5" }}>
            <p className="thanks" style={{ fontSize: 14, fontWeight: 600, color: "#333", marginBottom: 4 }}>Thank you for your order!</p>
            <p style={{ fontSize: 11, color: "#999" }}>{brandName} — বই আড়ো | {contactEmail}</p>
            <p style={{ fontSize: 11, color: "#999", marginTop: 2 }}>This is a computer-generated invoice. No signature required.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
