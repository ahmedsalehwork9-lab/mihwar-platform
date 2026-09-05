/**
 * File: src/components/landing/HowItWorksSection.tsx
 */

type ActivityType =
  | "spare-parts"
  | "grocery"
  | "cafe"
  | "restaurant"
  | "retail"
  | "general";

type HowItWorksSectionProps = {
  activity?: ActivityType;
};

const ACTIVITY_STEPS: Record<
  ActivityType,
  {
    addTitle: string;
    addDesc: string;
    operation: string;
  }
> = {
  "spare-parts": {
    addTitle: "إضافة المنتجات",
    addDesc:
      "أضف قطع الغيار بالاسم ورقم القطعة والكمية والسعر بسهولة.",
    operation: "إدارة المخزون",
  },
  grocery: {
    addTitle: "إضافة المنتجات",
    addDesc:
      "أضف منتجات التموينات بالاسم ورقم المنتج والكمية والسعر بسهولة.",
    operation: "إدارة المخزون",
  },
  cafe: {
    addTitle: "إضافة المنتجات",
    addDesc:
      "أضف منتجات المقهى بالاسم ورقم المنتج والكمية والسعر بسهولة.",
    operation: "إدارة المخزون",
  },
  restaurant: {
    addTitle: "إضافة المنتجات",
    addDesc:
      "أضف منتجات المطعم بالاسم ورقم المنتج والكمية والسعر بسهولة.",
    operation: "إدارة المخزون",
  },
  retail: {
    addTitle: "إضافة المنتجات",
    addDesc:
      "أضف منتجات المتجر بالاسم ورقم المنتج والكمية والسعر بسهولة.",
    operation: "إدارة المخزون",
  },
  general: {
    addTitle: "إضافة المنتجات",
    addDesc:
      "أضف منتجاتك بالاسم ورقم المنتج والكمية والسعر بسهولة.",
    operation: "إدارة المخزون",
  },
};

export default function HowItWorksSection({
  activity = "general",
}: HowItWorksSectionProps) {
  const current = ACTIVITY_STEPS[activity];

  const steps = [
    {
      num: "01",
      title: "إنشاء حساب",
      desc: "سجّل في 30 ثانية. بدون بطاقة ائتمانية. 3 أشهر مجانية مباشرة.",
      icon: "👤",
    },
    {
      num: "02",
      title: current.addTitle,
      desc: current.addDesc,
      icon: "📦",
    },
    {
      num: "03",
      title: current.operation,
      desc: "راقب المخزون وستصلك تنبيهات تلقائية عند نفاد أي صنف.",
      icon: "🗄",
    },
    {
      num: "04",
      title: "استقبال الطلبات",
      desc: "الطلبات تصل مباشرة للنظام وتتابعها حتى الإغلاق.",
      icon: "✅",
    },
  ];

  return (
    <section
      id="how"
      className="py-20 px-5 relative overflow-hidden"
      style={{ background: "#0F1923" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 100%, rgba(30,144,255,0.06) 0%, transparent 70%)",
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
            كيف يعمل
          </span>

          <h2
            className="mt-3 font-black"
            style={{
              fontSize: "clamp(1.6rem, 4vw, 2.6rem)",
              color: "#E8EDF5",
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            ابدأ في 4 خطوات فقط
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <div
              key={i}
              className="relative flex flex-col items-center text-center"
            >
              {i < steps.length - 1 && (
                <div
                  className="hidden lg:block absolute top-7 right-1/2"
                  style={{
                    width: "calc(100% - 56px)",
                    height: 1,
                    background:
                      "linear-gradient(90deg, rgba(30,144,255,0.4), rgba(30,144,255,0.1))",
                    transform: "translateX(50%)",
                  }}
                />
              )}

              <div className="relative mb-5">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-2xl relative z-10"
                  style={{
                    background: "rgba(30,144,255,0.1)",
                    border: "1px solid rgba(30,144,255,0.3)",
                    boxShadow: "0 0 0 4px rgba(30,144,255,0.06)",
                  }}
                >
                  {s.icon}
                </div>

                <div
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black"
                  style={{
                    background: "#1E90FF",
                    color: "#fff",
                    fontFamily: "'Space Mono', monospace",
                  }}
                >
                  {i + 1}
                </div>
              </div>

              <h3
                className="font-bold mb-2"
                style={{
                  color: "#C8D8F0",
                  fontFamily: "'Cairo', sans-serif",
                  fontSize: "1rem",
                }}
              >
                {s.title}
              </h3>

              <p
                style={{
                  color: "#4A5E78",
                  fontFamily: "'Cairo', sans-serif",
                  fontSize: "0.85rem",
                  lineHeight: 1.75,
                }}
              >
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
