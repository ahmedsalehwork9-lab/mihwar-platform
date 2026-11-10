/**
 * File: src/components/landing/ProblemSection.tsx
 */

type ActivityType =
  | "spare-parts"
  | "grocery"
  | "cafe"
  | "restaurant"
  | "retail"
  | "general";

type ProblemSectionProps = {
  activity?: ActivityType;
};

const ACTIVITY_PROBLEMS: Record<
  ActivityType,
  {
    problems: {
      icon: string;
      title: string;
      desc: string;
    }[];
    subtitle: string;
    bottom: string;
  }
> = {
  "spare-parts": {
    problems: [
      {
        icon: "📦",
        title: "صعوبة متابعة المخزون",
        desc: "لا تعرف ما المتوفر لديك إلا عند طلبه — وتبحث بين الملفات والواتساب.",
      },
      {
        icon: "💸",
        title: "فقدان فرص البيع",
        desc: "منتج موجود لديك لكن لا يعرف العملاء عنه. فرص ضائعة يوميًا.",
      },
      {
        icon: "⏳",
        title: "بطء تنفيذ الطلبات",
        desc: "إدارة الطلبات يدويًا تأكل الوقت وتزيد الأخطاء.",
      },
      {
        icon: "📱",
        title: "كثرة الاتصالات والواتساب",
        desc: "الطلبات والاستفسارات تأتي من كل مكان. فوضى بدون نظام.",
      },
    ],
    subtitle:
      "هذه المشاكل تعيشها محلات قطع الغيار كل يوم — ومحور مصمم لحلها مباشرة.",
    bottom: "محور يحل هذا كله",
  },

  grocery: {
    problems: [
      {
        icon: "📦",
        title: "صعوبة متابعة المخزون",
        desc: "تعدد المنتجات والفروع يجعل معرفة الكميات المتوفرة والمطلوبة أمرًا مرهقًا.",
      },
      {
        icon: "💸",
        title: "فقدان فرص البيع",
        desc: "منتجات متوفرة في فرع ولا يعرف عنها العملاء أو الفروع الأخرى.",
      },
      {
        icon: "⏳",
        title: "بطء تنفيذ الطلبات",
        desc: "إدارة الطلبات والمخزون يدويًا تستهلك الوقت وتزيد احتمالية الأخطاء.",
      },
      {
        icon: "📱",
        title: "كثرة الاتصالات والطلبات",
        desc: "الطلبات والاستفسارات موزعة بين الاتصالات والواتساب بدون نظام موحد.",
      },
    ],
    subtitle:
      "هذه المشاكل تواجهها التموينات يوميًا — ومحور مصمم لإدارة العمليات من مكان واحد.",
    bottom: "محور يحل هذا كله",
  },

  cafe: {
    problems: [
      {
        icon: "📦",
        title: "صعوبة متابعة المنتجات والمخزون",
        desc: "تعدد المنتجات والمواد يجعل متابعة الكميات والتوفر أمرًا مرهقًا.",
      },
      {
        icon: "💸",
        title: "فقدان فرص البيع",
        desc: "منتجات متوفرة لكن لا تتم إدارتها أو عرضها بالشكل المناسب.",
      },
      {
        icon: "⏳",
        title: "بطء تنفيذ الطلبات",
        desc: "الإدارة اليدوية للطلبات والمخزون تستهلك وقت الفريق.",
      },
      {
        icon: "📱",
        title: "تشتت العمليات",
        desc: "المخزون والطلبات والفروع موزعة بين أدوات مختلفة بدون نظام موحد.",
      },
    ],
    subtitle:
      "هذه المشاكل تواجهها المقاهي يوميًا — ومحور يجمع الإدارة والتشغيل في منصة واحدة.",
    bottom: "محور يحل هذا كله",
  },

  restaurant: {
    problems: [
      {
        icon: "📦",
        title: "صعوبة متابعة المنتجات والمخزون",
        desc: "كثرة المنتجات والمواد تجعل معرفة المتوفر والمطلوب أكثر تعقيدًا.",
      },
      {
        icon: "💸",
        title: "فقدان فرص البيع",
        desc: "عدم وضوح المخزون والطلبات قد يؤدي إلى فقدان مبيعات وفرص تشغيلية.",
      },
      {
        icon: "⏳",
        title: "بطء تنفيذ الطلبات",
        desc: "الإدارة اليدوية للطلبات والمخزون تزيد الوقت والأخطاء.",
      },
      {
        icon: "📱",
        title: "تشتت العمليات",
        desc: "الطلبات والمخزون والفروع موزعة بين أدوات مختلفة بدون نظام موحد.",
      },
    ],
    subtitle:
      "هذه المشاكل تواجهها المطاعم يوميًا — ومحور يجمع العمليات في منصة واحدة.",
    bottom: "محور يحل هذا كله",
  },

  retail: {
    problems: [
      {
        icon: "📦",
        title: "صعوبة متابعة المخزون",
        desc: "تعدد المنتجات والفروع يجعل متابعة الكميات وحركة المخزون أكثر تعقيدًا.",
      },
      {
        icon: "💸",
        title: "فقدان فرص البيع",
        desc: "منتجات متوفرة في المخزون لكن لا يتم استغلالها بالشكل الأمثل.",
      },
      {
        icon: "⏳",
        title: "بطء تنفيذ الطلبات",
        desc: "الإجراءات اليدوية تستهلك الوقت وتزيد احتمالية الأخطاء.",
      },
      {
        icon: "📱",
        title: "تشتت العمليات",
        desc: "الطلبات والمخزون والفروع موزعة بين أدوات مختلفة.",
      },
    ],
    subtitle:
      "هذه المشاكل تواجهها تجارة التجزئة يوميًا — ومحور مصمم لتبسيطها.",
    bottom: "محور يحل هذا كله",
  },

  general: {
    problems: [
      {
        icon: "📦",
        title: "صعوبة متابعة المخزون",
        desc: "تعدد المنتجات والفروع يجعل معرفة المتوفر والمطلوب أمرًا مرهقًا.",
      },
      {
        icon: "💸",
        title: "فقدان فرص البيع",
        desc: "منتجات متوفرة لكن لا يتم استغلالها أو الوصول إليها بسهولة.",
      },
      {
        icon: "⏳",
        title: "بطء تنفيذ الطلبات",
        desc: "الإدارة اليدوية للطلبات تستهلك الوقت وتزيد احتمالية الأخطاء.",
      },
      {
        icon: "📱",
        title: "تشتت العمليات",
        desc: "الطلبات والمخزون والبيانات موزعة بين أدوات مختلفة بدون نظام موحد.",
      },
    ],
    subtitle:
      "هذه المشاكل تواجهها الأنشطة التجارية يوميًا — ومحور مصمم لتبسيطها من مكان واحد.",
    bottom: "محور يحل هذا كله",
  },
};

export default function ProblemSection({
  activity = "general",
}: ProblemSectionProps) {
  const current = ACTIVITY_PROBLEMS[activity];

  return (
    <section
      className="py-20 px-5 relative overflow-hidden"
      style={{ background: "#0F1923" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(30,144,255,0.05) 0%, transparent 70%)",
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
            المشكلة
          </span>

          <h2
            className="mt-3 font-black"
            style={{
              fontSize: "clamp(1.6rem, 4vw, 2.6rem)",
              color: "#E8EDF5",
              fontFamily: "'Cairo', sans-serif",
              letterSpacing: "-0.01em",
            }}
          >
            يوميًا تخسر وقتًا وفرصًا
          </h2>

          <p
            className="mt-3 max-w-md mx-auto"
            style={{
              color: "#5A6E8A",
              fontFamily: "'Cairo', sans-serif",
              fontSize: "1rem",
            }}
          >
            {current.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {current.problems.map((p, i) => (
            <div
              key={i}
              className="group rounded-2xl p-6 flex gap-5 transition-all duration-300"
              style={{
                background: "#111C2E",
                border: "0.5px solid rgba(30,144,255,0.1)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor =
                  "rgba(30,144,255,0.25)";
                (e.currentTarget as HTMLElement).style.transform =
                  "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor =
                  "rgba(30,144,255,0.1)";
                (e.currentTarget as HTMLElement).style.transform =
                  "translateY(0)";
              }}
            >
              <div
                className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                style={{ background: "rgba(30,144,255,0.08)" }}
              >
                {p.icon}
              </div>

              <div>
                <h3
                  className="font-bold mb-1.5"
                  style={{
                    color: "#C8D8F0",
                    fontFamily: "'Cairo', sans-serif",
                    fontSize: "1rem",
                  }}
                >
                  {p.title}
                </h3>

                <p
                  style={{
                    color: "#4A5E78",
                    fontFamily: "'Cairo', sans-serif",
                    fontSize: "0.875rem",
                    lineHeight: 1.7,
                  }}
                >
                  {p.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <div
            className="inline-flex flex-col items-center gap-2 px-6 py-3 rounded-full"
            style={{
              background: "rgba(30,144,255,0.06)",
              border: "0.5px solid rgba(30,144,255,0.15)",
            }}
          >
            <span
              style={{
                color: "#5A6E8A",
                fontFamily: "'Cairo', sans-serif",
                fontSize: "0.875rem",
              }}
            >
              {current.bottom}
            </span>

            <span style={{ color: "#1E90FF", fontSize: "1.2rem" }}>↓</span>
          </div>
        </div>
      </div>
    </section>
  );
}
