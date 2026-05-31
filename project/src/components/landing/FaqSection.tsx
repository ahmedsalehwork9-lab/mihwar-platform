/**
 * File: src/components/landing/FaqSection.tsx
 */

import { useState } from "react";

const faqs = [
  {
    q: "هل يعمل على الجوال؟",
    a: "نعم، مِحور مصمم Mobile First. يعمل على أي جوال أو تابلت أو كمبيوتر دون الحاجة لتطبيق.",
  },
  {
    q: "هل يحتاج تثبيت؟",
    a: "لا أبداً. مِحور يعمل مباشرة من المتصفح. لا تثبيت، لا تحديثات يدوية، لا تعقيد.",
  },
  {
    q: "هل يمكن إضافة مستخدمين متعددين؟",
    a: "نعم، يمكنك إضافة عدد من المستخدمين وتحديد صلاحيات كل واحد حسب دوره.",
  },
  {
    q: "هل بياناتي آمنة؟",
    a: "بياناتك محمية بأعلى معايير الأمان. لا أحد يطلع عليها غيرك.",
  },
  {
    q: "ماذا يحدث بعد انتهاء الفترة المجانية؟",
    a: "سيتواصل معك فريق مِحور قبل انتهاء الفترة لمناقشة خطة مناسبة لحجم عملك.",
  },
  {
    q: "هل يدعم أكثر من فرع؟",
    a: "نعم، يمكنك إدارة عدة فروع من لوحة تحكم واحدة مع إبقاء البيانات منفصلة.",
  },
];

export default function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section
      id="faq"
      className="py-20 px-5 relative overflow-hidden"
      style={{ background: "#0A1220" }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{
              color: "#1E90FF",
              fontFamily: "'Cairo', sans-serif",
              letterSpacing: "0.14em",
            }}
          >
            الأسئلة الشائعة
          </span>
          <h2
            className="mt-3 font-black"
            style={{
              fontSize: "clamp(1.6rem, 4vw, 2.6rem)",
              color: "#E8EDF5",
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            أسئلة وأجوبة
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden transition-all duration-200"
              style={{
                background: open === i ? "#162035" : "#111C2E",
                border: `0.5px solid ${
                  open === i
                    ? "rgba(30,144,255,0.3)"
                    : "rgba(30,144,255,0.08)"
                }`,
              }}
            >
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-right"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span
                  className="font-semibold"
                  style={{
                    color: open === i ? "#E8EDF5" : "#C8D8F0",
                    fontFamily: "'Cairo', sans-serif",
                    fontSize: "0.95rem",
                  }}
                >
                  {f.q}
                </span>
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-transform duration-200 mr-3"
                  style={{
                    background: open === i
                      ? "#1E90FF"
                      : "rgba(30,144,255,0.1)",
                    color: "#fff",
                    fontSize: "0.85rem",
                    transform: open === i ? "rotate(45deg)" : "rotate(0deg)",
                  }}
                >
                  +
                </span>
              </button>

              {open === i && (
                <div
                  className="px-5 pb-4"
                  style={{
                    color: "#5A6E8A",
                    fontFamily: "'Cairo', sans-serif",
                    fontSize: "0.9rem",
                    lineHeight: 1.75,
                  }}
                >
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
