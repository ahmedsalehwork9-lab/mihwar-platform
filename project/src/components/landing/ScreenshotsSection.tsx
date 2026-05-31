/**
 * File: src/components/landing/ScreenshotsSection.tsx
 *
 * Uses placeholder UI mockups instead of real screenshots.
 * To use real screenshots: replace the MockScreen components
 * with <img src="/screenshots/dashboard.png" ... />
 */

import { useState } from "react";

const screens = [
  {
    id: "dashboard",
    label: "Dashboard",
    labelAr: "لوحة التحكم",
    url: "app.mihwar.sa/dashboard",
    content: <DashboardMock />,
  },
  {
    id: "inventory",
    label: "Inventory",
    labelAr: "المخزون",
    url: "app.mihwar.sa/inventory",
    content: <InventoryMock />,
  },
  {
    id: "orders",
    label: "Orders",
    labelAr: "الطلبات",
    url: "app.mihwar.sa/orders",
    content: <OrdersMock />,
  },
  {
    id: "shops",
    label: "Shops",
    labelAr: "المحلات",
    url: "app.mihwar.sa/shops",
    content: <ShopsMock />,
  },
];

function ScreenFrame({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden w-full"
      style={{
        border: "0.5px solid rgba(30,144,255,0.2)",
        boxShadow:
          "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(30,144,255,0.06)",
      }}
    >
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          background: "#0F1923",
          borderBottom: "0.5px solid rgba(30,144,255,0.1)",
        }}
      >
        <div className="flex gap-1.5">
          {["#E24B4A", "#EF9F27", "#5DCAA5"].map((c) => (
            <div
              key={c}
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: c }}
            />
          ))}
        </div>
        <div
          className="flex-1 mx-3 h-5 rounded flex items-center px-2"
          style={{ background: "#111C2E" }}
        >
          <span
            style={{
              color: "#3A4E66",
              fontFamily: "monospace",
              fontSize: "0.7rem",
            }}
          >
            {url}
          </span>
        </div>
      </div>
      <div style={{ background: "#0A1220", minHeight: 220 }}>{children}</div>
    </div>
  );
}

function DashboardMock() {
  return (
    <div className="p-4" dir="rtl">
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          ["248", "المنتجات", false],
          ["1,420", "الكمية", false],
          ["13", "الطلبات", false],
          ["7", "تنبيهات", true],
        ].map(([v, l, w]) => (
          <div
            key={l as string}
            className="rounded-lg p-2.5"
            style={{
              background: w ? "rgba(200,169,110,0.08)" : "#111C2E",
              border: `0.5px solid ${w ? "rgba(200,169,110,0.2)" : "rgba(30,144,255,0.06)"}`,
            }}
          >
            <div
              style={{
                color: "#3A4E66",
                fontSize: "0.6rem",
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              {l as string}
            </div>
            <div
              style={{
                color: w ? "#C8A96E" : "#E8EDF5",
                fontSize: "1.1rem",
                fontWeight: 700,
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              {v as string}
            </div>
          </div>
        ))}
      </div>
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "#111C2E", border: "0.5px solid rgba(30,144,255,0.06)" }}
      >
        {[
          ["فلتر هواء", "42", "#5DCAA5"],
          ["شمعة إشعال", "3", "#EF9F27"],
          ["تيل فرامل", "نافد", "#E24B4A"],
        ].map(([n, q, c]) => (
          <div
            key={n as string}
            className="flex justify-between px-3 py-2 border-b"
            style={{ borderColor: "rgba(30,144,255,0.05)" }}
          >
            <span
              style={{
                color: "#7A8BA8",
                fontSize: "0.72rem",
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              {n as string}
            </span>
            <span
              style={{
                color: c as string,
                fontSize: "0.72rem",
                fontWeight: 600,
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              {q as string}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InventoryMock() {
  return (
    <div className="p-4" dir="rtl">
      <div className="flex gap-2 mb-3">
        <div
          className="flex-1 h-7 rounded-lg flex items-center px-3"
          style={{ background: "#111C2E", border: "0.5px solid rgba(30,144,255,0.1)" }}
        >
          <span style={{ color: "#3A4E66", fontSize: "0.7rem", fontFamily: "'Cairo'" }}>
            🔍 بحث...
          </span>
        </div>
        <div
          className="h-7 px-3 rounded-lg flex items-center"
          style={{ background: "#1E90FF", fontSize: "0.7rem", color: "#fff", fontFamily: "'Cairo'" }}
        >
          + إضافة
        </div>
      </div>
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "#111C2E", border: "0.5px solid rgba(30,144,255,0.06)" }}
      >
        <div
          className="grid px-3 py-1.5"
          style={{
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            background: "#0F1923",
            borderBottom: "0.5px solid rgba(30,144,255,0.08)",
          }}
        >
          {["المنتج", "الرقم", "الكمية", "السعر"].map((h) => (
            <span
              key={h}
              style={{ color: "#3A4E66", fontSize: "0.6rem", fontFamily: "'Cairo'" }}
            >
              {h}
            </span>
          ))}
        </div>
        {[
          ["فلتر هواء تويوتا", "TY-AF", "42", "#5DCAA5"],
          ["شمعة إشعال كيا", "KI-SP", "3", "#EF9F27"],
          ["تيل فرامل نيسان", "NI-BF", "0", "#E24B4A"],
          ["حزام توقيت", "HY-TB", "18", "#5DCAA5"],
        ].map(([n, r, q, c]) => (
          <div
            key={n as string}
            className="grid px-3 py-2 border-b"
            style={{
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              borderColor: "rgba(30,144,255,0.04)",
            }}
          >
            <span style={{ color: "#7A8BA8", fontSize: "0.68rem", fontFamily: "'Cairo'" }}>
              {n as string}
            </span>
            <span style={{ color: "#3A4E66", fontSize: "0.62rem", fontFamily: "monospace" }}>
              {r as string}
            </span>
            <span style={{ color: c as string, fontSize: "0.68rem", fontWeight: 600 }}>
              {q as string}
            </span>
            <div className="h-2.5 rounded w-8" style={{ background: "#162035" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function OrdersMock() {
  const statuses = [
    ["#1044", "جديد", "#0C2240", "#85B7EB"],
    ["#1043", "جاري", "#261B08", "#FAC775"],
    ["#1042", "مكتمل", "#0D2216", "#5DCAA5"],
    ["#1041", "ملغى", "#200E0E", "#F09595"],
  ];
  return (
    <div className="p-4" dir="rtl">
      <div className="flex gap-2 mb-3">
        {["الكل", "جديد", "جاري", "مكتمل"].map((s, i) => (
          <div
            key={s}
            className="h-6 px-3 rounded-lg flex items-center text-xs"
            style={{
              background: i === 0 ? "#1E90FF" : "#111C2E",
              color: i === 0 ? "#fff" : "#3A4E66",
              fontFamily: "'Cairo'",
              fontSize: "0.65rem",
            }}
          >
            {s}
          </div>
        ))}
      </div>
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "#111C2E", border: "0.5px solid rgba(30,144,255,0.06)" }}
      >
        {statuses.map(([num, status, bg, col]) => (
          <div
            key={num as string}
            className="flex items-center justify-between px-3 py-2.5 border-b"
            style={{ borderColor: "rgba(30,144,255,0.04)" }}
          >
            <span
              style={{
                color: "#C8A96E",
                fontSize: "0.68rem",
                fontFamily: "monospace",
                fontWeight: 600,
              }}
            >
              {num as string}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{
                background: bg as string,
                color: col as string,
                fontSize: "0.6rem",
                fontFamily: "'Cairo'",
              }}
            >
              {status as string}
            </span>
            <div className="h-2 rounded w-16" style={{ background: "#162035" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ShopsMock() {
  return (
    <div className="p-4" dir="rtl">
      <div className="grid grid-cols-2 gap-2">
        {[
          ["الرياض — شعبة 1", "5 مستخدمين", true],
          ["جدة — شعبة 2", "3 مستخدمين", false],
          ["الدمام — شعبة 1", "4 مستخدمين", false],
          ["+ إضافة فرع", "", false],
        ].map(([name, users, active]) => (
          <div
            key={name as string}
            className="rounded-xl p-3 flex flex-col gap-1"
            style={{
              background: active ? "rgba(30,144,255,0.08)" : "#111C2E",
              border: `0.5px solid ${active ? "rgba(30,144,255,0.3)" : "rgba(30,144,255,0.06)"}`,
            }}
          >
            <span
              style={{
                color: active ? "#E8EDF5" : "#7A8BA8",
                fontSize: "0.72rem",
                fontFamily: "'Cairo'",
                fontWeight: 600,
              }}
            >
              {name as string}
            </span>
            {users && (
              <span style={{ color: "#3A4E66", fontSize: "0.6rem", fontFamily: "'Cairo'" }}>
                {users as string}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScreenshotsSection() {
  const [active, setActive] = useState(0);

  return (
    <section
      className="py-20 px-5 relative overflow-hidden"
      style={{ background: "#0A1220" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 50%, rgba(30,144,255,0.04) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="text-center mb-10">
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{
              color: "#1E90FF",
              fontFamily: "'Cairo', sans-serif",
              letterSpacing: "0.14em",
            }}
          >
            مثال حقيقي
          </span>
          <h2
            className="mt-3 font-black"
            style={{
              fontSize: "clamp(1.6rem, 4vw, 2.6rem)",
              color: "#E8EDF5",
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            شوف النظام بنفسك
          </h2>
          <p
            className="mt-2"
            style={{
              color: "#5A6E8A",
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            واجهة مصممة للسرعة والوضوح
          </p>
        </div>

        {/* Tab selector */}
        <div className="flex justify-center gap-2 mb-8 flex-wrap">
          {screens.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActive(i)}
              className="px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
              style={{
                background: active === i ? "#1E90FF" : "rgba(30,144,255,0.07)",
                color: active === i ? "#fff" : "#5A6E8A",
                border: `0.5px solid ${active === i ? "#1E90FF" : "rgba(30,144,255,0.15)"}`,
                fontFamily: "'Cairo', sans-serif",
                boxShadow:
                  active === i ? "0 0 16px rgba(30,144,255,0.3)" : "none",
              }}
            >
              {s.labelAr}
            </button>
          ))}
        </div>

        {/* Active screen */}
        <div
          style={{ transition: "opacity 0.3s ease" }}
        >
          <ScreenFrame url={screens[active].url}>
            {screens[active].content}
          </ScreenFrame>
        </div>
      </div>
    </section>
  );
}
