/**
 * File: src/components/landing/FeaturesSection.tsx
 */

import { useLang } from "../../context/LanguageContext";

export default function FeaturesSection() {
  const { t } = useLang();

  const features = [
    {
      icon: "📦",
      title: t("Product Management", "إدارة المنتجات"),
      desc: t(
        "Add your products easily — name, part number, price, and quantity. Everything in one place.",
        "أضف منتجاتك بسهولة — الاسم، رقم القطعة، السعر، الكمية. كل شيء في مكان واحد."
      ),
      accent: "#1E90FF",
    },
    {
      icon: "🗄",
      title: t("Inventory Management", "إدارة المخزون"),
      desc: t(
        "Track stock levels in real time. Automatic alerts when you reach minimum thresholds.",
        "تابع كميات المخزون لحظة بلحظة. تنبيهات تلقائية عند الوصول للحد الأدنى."
      ),
      accent: "#5DCAA5",
    },
    {
      icon: "📋",
      title: t("Orders", "الطلبات"),
      desc: t(
        "Receive and track orders from creation to closure. Clear, transparent statuses.",
        "استقبل الطلبات وتتبعها من الإنشاء حتى الإغلاق. حالات واضحة وشفافة."
      ),
      accent: "#C8A96E",
    },
    {
      icon: "👥",
      title: t("Users", "المستخدمون"),
      desc: t(
        "Add your staff and give each person the right access for their role in the shop.",
        "أضف موظفيك وامنح كل شخص الوصول المناسب لدوره في المحل."
      ),
      accent: "#1E90FF",
    },
    {
      icon: "🔐",
      title: t("Permissions", "الصلاحيات"),
      desc: t(
        "Full control over who sees what. Manager, user, viewer — you decide.",
        "تحكم كامل في من يرى ماذا. مدير، مستخدم، مشاهد — أنت تحدد."
      ),
      accent: "#5DCAA5",
    },
    {
      icon: "🔔",
      title: t("Alerts", "التنبيهات"),
      desc: t(
        "Never miss a thing. Low stock, new orders, out-of-stock items — all at a glance.",
        "لا يفوتك شيء. مخزون قليل، طلب جديد، منتج نفد — كل شيء أمام عينيك."
      ),
      accent: "#E24B4A",
    },
    {
      icon: "📊",
      title: t("Reports", "التقارير"),
      desc: t(
        "Clear, simple reports for products, inventory, and orders. Decisions backed by data.",
        "تقارير واضحة وبسيطة للمنتجات والمخزون والطلبات. قرارات مبنية على بيانات."
      ),
      accent: "#C8A96E",
    },
    {
      icon: "🏪",
      title: t("Shop Management", "إدارة المحلات"),
      desc: t(
        "Manage multiple branches from one system. Each shop has its own data and users.",
        "أدر أكثر من فرع من نظام واحد. كل محل له بياناته ومستخدميه."
      ),
      accent: "#1E90FF",
    },
  ];

  return (
    <section
      id="features"
      className="py-20 px-5 relative overflow-hidden"
      style={{ background: "#0A1220" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
              linear-gradient(rgba(30,144,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(30,144,255,0.03) 1px, transparent 1px)
            `,
          backgroundSize: "52px 52px",
        }}
      />

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="text-center mb-14">
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{
              color: "#1E90FF",
              fontFamily: "'Cairo', sans-serif",
              letterSpacing: "0.14em",
            }}
          >
            {t("Features", "المميزات")}
          </span>
          <h2
            className="mt-3 font-black"
            style={{
              fontSize: "clamp(1.6rem, 4vw, 2.6rem)",
              color: "#E8EDF5",
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            {t("Everything You Need in One Platform", "كل ما تحتاجه في منصة واحدة")}
          </h2>
          <p
            className="mt-3 max-w-sm mx-auto"
            style={{
              color: "#5A6E8A",
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            {t(
              "Built specifically for auto parts shops. No complexity, no bloat.",
              "مصمم خصيصاً لمحلات قطع الغيار. لا تعقيد، لا زيادة."
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="rounded-2xl p-5 flex flex-col gap-3 transition-all duration-300 cursor-default"
              style={{
                background: "#111C2E",
                border: "0.5px solid rgba(30,144,255,0.08)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = `${f.accent}44`;
                el.style.background = "#162035";
                el.style.transform = "translateY(-3px)";
                el.style.boxShadow = `0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px ${f.accent}22`;
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "rgba(30,144,255,0.08)";
                el.style.background = "#111C2E";
                el.style.transform = "translateY(0)";
                el.style.boxShadow = "none";
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ background: `${f.accent}14` }}
              >
                {f.icon}
              </div>
              <h3
                className="font-bold"
                style={{
                  color: "#C8D8F0",
                  fontFamily: "'Cairo', sans-serif",
                  fontSize: "0.95rem",
                }}
              >
                {f.title}
              </h3>
              <p
                style={{
                  color: "#4A5E78",
                  fontFamily: "'Cairo', sans-serif",
                  fontSize: "0.825rem",
                  lineHeight: 1.75,
                }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
