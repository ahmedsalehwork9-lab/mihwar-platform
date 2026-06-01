function buildPrintHTML(order: Order, items: OrderItem[]): string {
  const orderNumber = String(order.id).padStart(6, "0");

  const createdDate = new Date(order.created_at);
  const createdDateStr = createdDate.toLocaleDateString("ar-SA", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const createdTimeStr = createdDate.toLocaleTimeString("ar-SA", {
    hour: "2-digit", minute: "2-digit",
  });
  const printDateStr = new Date().toLocaleDateString("ar-SA", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const printTimeStr = new Date().toLocaleTimeString("ar-SA", {
    hour: "2-digit", minute: "2-digit",
  });

  const statusLabel = STATUS_LABEL_AR[order.status] ?? order.status;

  const statusColor =
    order.status === "completed" ? "#059669" :
    order.status === "approved"  ? "#2563eb" :
    order.status === "rejected"  ? "#dc2626" :
    "#d97706";

  const statusBg =
    order.status === "completed" ? "#d1fae5" :
    order.status === "approved"  ? "#dbeafe" :
    order.status === "rejected"  ? "#fee2e2" :
    "#fef3c7";

  const statusBorder =
    order.status === "completed" ? "#6ee7b7" :
    order.status === "approved"  ? "#93c5fd" :
    order.status === "rejected"  ? "#fca5a5" :
    "#fcd34d";

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(
    "https://mehwar.sa/orders/" + order.id
  )}&bgcolor=ffffff&color=1e3a5f&margin=4`;

  const itemCount = items.length;

  const rows = items.map((item, i) => `
    <tr>
      <td style="text-align:center;color:#64748b;">${i + 1}</td>
      <td style="text-align:right;font-weight:600;color:#1e293b;">${item.product?.part_name ?? "—"}</td>
      <td style="text-align:center;font-family:'Courier New',monospace;font-size:11px;color:#64748b;">${item.product?.part_number ?? "—"}</td>
      <td style="text-align:center;font-weight:600;color:#1e293b;">${item.quantity}</td>
      <td style="text-align:center;color:#1e293b;">${item.price.toLocaleString()} ر.س</td>
      <td style="text-align:center;font-weight:700;color:#059669;">${(item.price * item.quantity).toLocaleString()} ر.س</td>
    </tr>
  `).join("");

  const isDone = (threshold: boolean) => threshold;

  const tlDot = (active: boolean) => `
    width:18px;height:18px;border-radius:50%;border:2px solid ${active ? "#059669" : "#cbd5e1"};
    background:${active ? "#059669" : "#f1f5f9"};display:flex;align-items:center;
    justify-content:center;font-size:10px;color:white;font-weight:700;flex-shrink:0;
    ${active ? "content:'✓'" : ""}
  `;

  const isCreated   = true;
  const isSent      = order.status === "sent" || order.status === "approved" || order.status === "completed";
  const isApproved  = order.status === "approved" || order.status === "completed";
  const isCompleted = order.status === "completed";

  const tlItem = (label: string, time: string, active: boolean, showConnector: boolean) => `
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <div style="display:flex;flex-direction:column;align-items:center;min-width:20px;">
        <div style="
          width:18px;height:18px;border-radius:50%;
          border:2px solid ${active ? "#059669" : "#cbd5e1"};
          background:${active ? "#059669" : "#f8fafc"};
          display:flex;align-items:center;justify-content:center;
          font-size:9px;color:white;font-weight:800;flex-shrink:0;
        ">${active ? "✓" : ""}</div>
        ${showConnector ? `<div style="width:2px;height:20px;background:${active ? "#a7f3d0" : "#e2e8f0"};margin:2px 0;"></div>` : ""}
      </div>
      <div style="padding-bottom:${showConnector ? "0" : "0"}px;flex:1;">
        <div style="font-size:12px;font-weight:700;color:${active ? "#1e293b" : "#94a3b8"};">${label}</div>
        ${time ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${time}</div>` : ""}
      </div>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <title>طلب شراء #${orderNumber} — محور</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap');
        @page { size: A4 portrait; margin: 10mm 12mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
          background: #ffffff;
          color: #1e293b;
          font-size: 13px;
          line-height: 1.5;
          direction: rtl;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .page { width: 100%; max-width: 794px; margin: 0 auto; }

        /* HEADER */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 14px;
          border-bottom: 3px solid #1e3a5f;
          margin-bottom: 14px;
        }
        .logo-row { display: flex; align-items: center; gap: 10px; }
        .logo-box {
          width: 44px; height: 44px; background: #1e3a5f;
          border-radius: 10px; display: flex; align-items: center;
          justify-content: center; color: white; font-size: 20px;
          font-weight: 800; letter-spacing: -1px;
        }
        .logo-name { font-size: 28px; font-weight: 800; color: #1e3a5f; letter-spacing: -1px; line-height: 1; }
        .logo-sub { font-size: 11px; color: #64748b; margin-top: 3px; margin-right: 54px; }
        .doc-title-block { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
        .doc-title { font-size: 24px; font-weight: 800; color: #1e3a5f; display: flex; align-items: center; gap: 8px; }
        .doc-title-icon {
          width: 34px; height: 34px; background: #1e3a5f; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          color: white; font-size: 16px;
        }

        /* META SECTION */
        .meta-section { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; }

        /* QR CARD */
        .qr-card {
          border: 1.5px solid #e2e8f0; border-radius: 10px;
          padding: 10px 12px; display: flex; flex-direction: column;
          align-items: center; gap: 5px; min-width: 126px;
          background: #f8fafc;
        }
        .qr-card img { width: 88px; height: 88px; }
        .qr-label { font-size: 10px; color: #64748b; text-align: center; line-height: 1.4; }
        .qr-ref { font-size: 11px; font-weight: 700; color: #1e3a5f; }

        /* ORDER INFO GRID */
        .order-info-grid {
          flex: 1; border: 1.5px solid #e2e8f0; border-radius: 10px;
          overflow: hidden; background: #ffffff;
        }
        .info-row { display: flex; border-bottom: 1px solid #f1f5f9; }
        .info-row:last-child { border-bottom: none; }
        .info-label {
          width: 128px; background: #f8fafc; padding: 7px 12px;
          font-weight: 700; color: #475569; font-size: 11.5px;
          border-left: 1px solid #e2e8f0; display: flex; align-items: center; gap: 5px;
        }
        .info-value {
          flex: 1; padding: 7px 12px; font-size: 12px;
          color: #1e293b; display: flex; align-items: center;
        }
        .status-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 700;
          background: ${statusBg}; color: ${statusColor};
          border: 1.5px solid ${statusBorder};
        }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; background: ${statusColor}; }

        /* PARTY CARDS */
        .party-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
        .party-card { border: 1.5px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
        .party-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 7px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
        }
        .party-title { font-size: 13px; font-weight: 800; }
        .party-title-buyer { color: #2563eb; }
        .party-title-seller { color: #059669; }
        .party-icon {
          width: 26px; height: 26px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center; font-size: 13px;
        }
        .party-icon-buyer { background: #dbeafe; }
        .party-icon-seller { background: #d1fae5; }
        .party-body { padding: 8px 12px; }
        .party-field {
          display: flex; align-items: center; justify-content: space-between;
          padding: 4px 0; border-bottom: 1px dashed #f1f5f9; font-size: 12px;
        }
        .party-field:last-child { border-bottom: none; }
        .party-field-label { color: #94a3b8; font-weight: 600; display: flex; align-items: center; gap: 4px; }
        .party-field-value { font-weight: 700; color: #1e293b; text-align: left; }

        /* PRODUCTS TABLE */
        .section-title {
          display: flex; align-items: center; gap: 7px;
          font-size: 13px; font-weight: 800; color: #1e293b; margin-bottom: 7px;
        }
        .products-table {
          width: 100%; border-collapse: collapse;
          border: 1.5px solid #e2e8f0; border-radius: 10px;
          overflow: hidden; margin-bottom: 12px; font-size: 12px;
        }
        .products-table thead tr { background: #1e3a5f; }
        .products-table thead th {
          padding: 9px 11px; color: #ffffff; font-weight: 700;
          text-align: center; font-size: 11.5px; border: none;
        }
        .products-table thead th:nth-child(2) { text-align: right; }
        .products-table tbody tr { border-bottom: 1px solid #f1f5f9; }
        .products-table tbody tr:last-child { border-bottom: none; }
        .products-table tbody tr:nth-child(even) { background: #f8fafc; }
        .products-table tbody td { padding: 8px 11px; border: none; }
        .products-table tfoot tr { background: #f1f5f9; border-top: 2px solid #e2e8f0; }
        .products-table tfoot td {
          padding: 7px 11px; font-weight: 700; font-size: 12px;
          text-align: center; color: #1e293b;
        }

        /* BOTTOM 2-COL */
        .bottom-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }

        /* SUMMARY CARD */
        .card { border: 1.5px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
        .card-header {
          background: #f8fafc; padding: 7px 12px; border-bottom: 1px solid #e2e8f0;
          font-size: 12.5px; font-weight: 800; color: #1e293b;
          display: flex; align-items: center; gap: 6px;
        }
        .card-body { padding: 10px 13px; }
        .summary-line {
          display: flex; justify-content: space-between; align-items: center;
          padding: 6px 0; border-bottom: 1px dashed #f1f5f9; font-size: 12px;
        }
        .summary-line:last-child { border-bottom: none; }
        .summary-line-label { color: #64748b; }
        .summary-line-value { font-weight: 600; color: #1e293b; }
        .summary-total {
          display: flex; justify-content: space-between; align-items: center;
          padding: 9px 13px; background: #f0fdf4; border-top: 2px solid #d1fae5;
        }
        .summary-total-label { font-size: 13px; font-weight: 800; color: #1e293b; }
        .summary-total-value { font-size: 17px; font-weight: 800; color: #059669; }
        .summary-note { font-size: 10px; color: #94a3b8; margin-top: 7px; border-top: 1px dashed #e2e8f0; padding-top: 6px; }

        /* TIMELINE */
        .tl-body { padding: 10px 13px; display: flex; flex-direction: column; gap: 0; }

        /* NOTES */
        .notes-card {
          border: 1.5px solid #bfdbfe; border-radius: 10px; padding: 9px 13px;
          background: #eff6ff; margin-bottom: 12px;
          display: flex; align-items: flex-start; gap: 8px;
        }
        .notes-icon { color: #2563eb; font-size: 15px; flex-shrink: 0; margin-top: 1px; }
        .notes-title { font-size: 12.5px; font-weight: 800; color: #1e3a5f; margin-bottom: 3px; }
        .notes-text { font-size: 12px; color: #475569; line-height: 1.6; }

        /* FOOTER */
        .footer {
          border-top: 2px solid #e2e8f0; padding-top: 11px;
          display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px;
        }
        .footer-left { font-size: 10px; color: #64748b; line-height: 1.7; }
        .footer-center { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .footer-logo { font-size: 17px; font-weight: 800; color: #1e3a5f; letter-spacing: -0.5px; }
        .footer-sub { font-size: 10px; color: #94a3b8; }
        .footer-site { font-size: 11px; color: #2563eb; font-weight: 600; }
        .footer-generated { font-size: 9.5px; color: #94a3b8; margin-top: 2px; text-align: center; line-height: 1.5; }
        .footer-right { font-size: 10px; color: #64748b; text-align: left; line-height: 1.7; }

        @media print {
          body { background: white; }
          .page { max-width: 100%; }
        }
      </style>
    </head>
    <body>
    <div class="page">

      <!-- ══ HEADER ══ -->
      <div class="header">
        <div>
          <div class="logo-row">
            <div class="logo-box">M</div>
            <div class="logo-name">محـــور</div>
          </div>
          <div class="logo-sub">منصة قطع غيار إيسوزو B2B</div>
        </div>
        <div class="doc-title-block">
          <div class="doc-title">
            طلب شراء
            <div class="doc-title-icon">🛒</div>
          </div>
        </div>
      </div>

      <!-- ══ META + QR ══ -->
      <div class="meta-section">

        <!-- QR Card -->
        <div class="qr-card">
          <img src="${qrUrl}" alt="QR" />
          <div class="qr-label">امسح الرمز<br/>لعرض الطلب<br/>في النظام</div>
          <div class="qr-ref">#${orderNumber}</div>
        </div>

        <!-- Order Info Grid -->
        <div class="order-info-grid">
          <div class="info-row">
            <div class="info-label">🏷 رقم الطلب</div>
            <div class="info-value" style="font-weight:700;color:#2563eb;font-size:14px;">#${orderNumber}</div>
          </div>
          <div class="info-row">
            <div class="info-label">✅ الحالة</div>
            <div class="info-value">
              <span class="status-badge">
                <span class="status-dot"></span>
                ${statusLabel}
              </span>
            </div>
          </div>
          <div class="info-row">
            <div class="info-label">📅 تاريخ الطلب</div>
            <div class="info-value">${createdDateStr}</div>
          </div>
          <div class="info-row">
            <div class="info-label">🕐 وقت الإنشاء</div>
            <div class="info-value">${createdTimeStr} ص</div>
          </div>
          <div class="info-row">
            <div class="info-label">🖨 تاريخ الطباعة</div>
            <div class="info-value">${printTimeStr} ص - ${printDateStr}</div>
          </div>
        </div>
      </div>

      <!-- ══ PARTY CARDS ══ -->
      <div class="party-row">

        <!-- Buyer (from_shop) -->
        <div class="party-card">
          <div class="party-header">
            <div class="party-title party-title-buyer">الطالب</div>
            <div class="party-icon party-icon-buyer">🛍</div>
          </div>
          <div class="party-body">
            <div class="party-field">
              <span class="party-field-label">🏪 اسم المحل</span>
              <span class="party-field-value">${order.from_shop?.shop_name ?? "—"}</span>
            </div>
            <div class="party-field">
              <span class="party-field-label">📍 المدينة</span>
              <span class="party-field-value">—</span>
            </div>
          </div>
        </div>

        <!-- Supplier (to_shop) -->
        <div class="party-card">
          <div class="party-header">
            <div class="party-title party-title-seller">المورد</div>
            <div class="party-icon party-icon-seller">🏪</div>
          </div>
          <div class="party-body">
            <div class="party-field">
              <span class="party-field-label">🏪 اسم المحل</span>
              <span class="party-field-value">${order.to_shop?.shop_name ?? "—"}</span>
            </div>
            <div class="party-field">
              <span class="party-field-label">📍 المدينة</span>
              <span class="party-field-value">—</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ PRODUCTS TABLE ══ -->
      <div class="section-title">
        <span style="color:#2563eb;font-size:15px;">📦</span>
        الأصناف المطلوبة
      </div>

      <table class="products-table">
        <thead>
          <tr>
            <th style="width:34px;">م</th>
            <th style="text-align:right;">اسم القطعة</th>
            <th>رقم القطعة</th>
            <th style="width:56px;">الكمية</th>
            <th style="width:88px;">سعر الوحدة</th>
            <th style="width:88px;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:18px">لا توجد أصناف</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align:right;">
              <span style="color:#64748b;font-size:11px;">📋 إجمالي عدد الأصناف: ${itemCount}</span>
            </td>
            <td></td>
            <td style="color:#64748b;">المجموع</td>
            <td style="color:#059669;font-size:13px;">${Number(order.total_amount).toLocaleString()} ر.س</td>
          </tr>
        </tfoot>
      </table>

      <!-- ══ TIMELINE + SUMMARY ══ -->
      <div class="bottom-row">

        <!-- Timeline -->
        <div class="card">
          <div class="card-header">🕐 سجل الطلب</div>
          <div class="tl-body">

            ${tlItem("تم إنشاء الطلب", `${createdDateStr} - ${createdTimeStr} ص`, true, true)}
            ${tlItem("تم إرسال الطلب للمورد", "", isSent, true)}
            ${tlItem("تم اعتماد الطلب", "", isApproved, true)}
            ${tlItem("تم إغلاق الطلب (مكتمل)", "", isCompleted, false)}

          </div>
        </div>

        <!-- Summary -->
        <div class="card">
          <div class="card-header">📊 ملخص الطلب</div>
          <div class="card-body">
            <div class="summary-line">
              <span class="summary-line-label">الإجمالي الفرعي</span>
              <span class="summary-line-value">${Number(order.total_amount).toLocaleString()} ر.س</span>
            </div>
            <div class="summary-line">
              <span class="summary-line-label">ضريبة القيمة المضافة (15%)</span>
              <span class="summary-line-value">0.00 ر.س</span>
            </div>
            <div class="summary-note">
              الأسعار لا تشمل ضريبة القيمة المضافة ما لم يُذكر خلاف ذلك.
            </div>
          </div>
          <div class="summary-total">
            <span class="summary-total-label">الإجمالي النهائي</span>
            <span class="summary-total-value">${Number(order.total_amount).toLocaleString()} ر.س</span>
          </div>
        </div>

      </div>

      <!-- ══ NOTES ══ -->
      <div class="notes-card">
        <span class="notes-icon">ℹ️</span>
        <div>
          <div class="notes-title">ملاحظات</div>
          <div class="notes-text">${order.notes ? order.notes : "- يرجى تأكيد الطلب في أقرب وقت."}</div>
        </div>
      </div>

      <!-- ══ FOOTER ══ -->
      <div class="footer">
        <div class="footer-left">
          <div style="font-weight:700;color:#1e293b;margin-bottom:2px;">🎧 للدعم والاستفسارات</div>
          050 000 0000<br/>
          support@mehwar.sa
        </div>
        <div class="footer-center">
          <div class="footer-logo">محـــور</div>
          <div class="footer-sub">منصة قطع غيار إيسوزو B2B</div>
          <div class="footer-site">www.mehwar.sa</div>
          <div class="footer-generated">
            تم إنشاء هذا المستند بواسطة<br/>
            <strong style="color:#1e3a5f;">منصة محور لقطع غيار إيسوزو</strong>
          </div>
        </div>
        <div class="footer-right">
          <div style="font-weight:700;color:#1e293b;">رقم الطلب: #${orderNumber}</div>
          <div>صفحة 1 من 1</div>
          <div style="margin-top:3px;">تاريخ الطباعة: ${printDateStr}</div>
        </div>
      </div>

    </div>
    </body>
    </html>
  `;
}