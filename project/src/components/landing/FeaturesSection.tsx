/**
 * File: src/components/landing/FeaturesSection.tsx
 */

const features = [
    {
      icon: "📦",
      title: "إدارة المنتجات",
      desc: "أضف منتجاتك بسهولة — الاسم، رقم القطعة، السعر، الكمية. كل شيء في مكان واحد.",
      accent: "#1E90FF",
    },
    {
      icon: "🗄",
      title: "إدارة المخزون",
      desc: "تابع كميات المخزون لحظة بلحظة. تنبيهات تلقائية عند الوصول للحد الأدنى.",
      accent: "#5DCAA5",
    },
    {
      icon: "📋",
      title: "الطلبات",
      desc: "استقبل الطلبات وتتبعها من الإنشاء حتى الإغلاق. حالات واضحة وشفافة.",
      accent: "#C8A96E",
    },
    {
      icon: "👥",
      title: "المستخدمون",
      desc: "أضف موظفيك وامنح كل شخص الوصول المناسب لدوره في المحل.",
      accent: "#1E90FF",
    },
    {
      icon: "🔐",
      title: "الصلاحيات",
      desc: "تحكم كامل في من يرى ماذا. مدير، مستخدم، مشاهد — أنت تحدد.",
      accent: "#5DCAA5",
    },
    {
      icon: "🔔",
      title: "التنبيهات",
      desc: "لا يفوتك شيء. مخزون قليل، طلب جديد، منتج نفد — كل شيء أمام عينيك.",
      accent: "#E24B4A",
    },
    {
      icon: "📊",
      title: "التقارير",
      desc: "تقارير واضحة وبسيطة للمنتجات والمخزون والطلبات. قرارات مبنية على بيانات.",
      accent: "#C8A96E",
    },
    {
      icon: "🏪",
      title: "إدارة المحلات",
      desc: "أدر أكثر من فرع من نظام واحد. كل محل له بياناته ومستخدميه.",
      accent: "#1E90FF",
    },
  ];
  
  export default function FeaturesSection() {
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
              المميزات
            </span>
            <h2
              className="mt-3 font-black"
              style={{
                fontSize: "clamp(1.6rem, 4vw, 2.6rem)",
                color: "#E8EDF5",
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              كل ما تحتاجه في منصة واحدة
            </h2>
            <p
              className="mt-3 max-w-sm mx-auto"
              style={{
                color: "#5A6E8A",
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              مصمم خصيصاً لمحلات قطع الغيار. لا تعقيد، لا زيادة.
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
  