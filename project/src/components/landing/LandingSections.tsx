// أقسام صفحة الهبوط الجديدة (MIHWAR CLOUD ERP). كل المحتوى من landingContent.ts.
import { useState } from "react";
import { Menu, X, Languages, ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { useLang } from "../../context/LanguageContext";
import { BrandLogo } from "../brand/BrandLogo";
import { CAPABILITIES, MODULES, NEW_FEATURES, BRANCH_POINTS, REPORT_POINTS, DEMO_TABS, PLAN_CARDS, FAQS, PRINT_DOCS, PRINT_STAGES, PRINT_POINTS } from "./landingContent";
import { Ico, IconTile, Section, Heading, CheckList, BrowserFrame, ZoomImg, btnPrimary, btnGhostDark } from "./ui";
import type { PlanId } from "./subscriptionLogic";
import { ErpDashboardMock, ErpBranchesMock, ErpReportsMock } from "./ErpMock";

const img = (n: string) => `/landing/${n}.webp`;
type OnPlan = (p?: PlanId) => void;

export function LandingTopNav({ onLogin, onJoin }: { onLogin: () => void; onJoin: OnPlan }) {
  const { t, lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const links = [
    { h: "#modules", l: t("Modules", "الوحدات") }, { h: "#new", l: t("What's new", "الجديد") }, { h: "#branches", l: t("Branches", "الفروع") },
    { h: "#reports", l: t("Reports", "التقارير") }, { h: "#demo", l: t("Demo", "تجربة النظام") }, { h: "#print", l: t("Printing", "الطباعة") }, { h: "#pricing", l: t("Plans", "الاشتراكات") }, { h: "#faq", l: t("FAQ", "الأسئلة") },
  ];
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[#ffffff1a] bg-[#0B1F44]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" aria-label="MIHWAR CLOUD ERP"><BrandLogo size={36} onDark /></a>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-[#d6e0f5] lg:flex" aria-label={t("Main", "التنقل الرئيسي")}>
          {links.map((x) => <a key={x.h} href={x.h} className="transition hover:text-[#00C2FF]">{x.l}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="inline-flex items-center gap-1.5 rounded-lg border border-[#ffffff33] px-3 py-2 text-sm font-bold text-[#ffffff] hover:bg-[#ffffff1a]" aria-label={t("Switch language", "تبديل اللغة")} data-testid="lang-toggle">
            <Languages size={16} />{lang === "ar" ? "EN" : "عربي"}
          </button>
          <button type="button" onClick={onLogin} className="hidden rounded-lg px-3 py-2 text-sm font-bold text-[#ffffff] hover:bg-[#ffffff1a] sm:block" data-testid="nav-login">{t("Log in", "تسجيل الدخول")}</button>
          <button type="button" onClick={() => onJoin()} className="hidden rounded-lg bg-[#007BFF] px-4 py-2 text-sm font-bold text-[#ffffff] hover:bg-[#0062CC] sm:block" data-testid="nav-cta">{t("Request subscription", "اطلب الاشتراك")}</button>
          <button type="button" className="rounded-lg p-2 text-[#ffffff] hover:bg-[#ffffff1a] lg:hidden" onClick={() => setOpen((v) => !v)} aria-label={t("Menu", "القائمة")} aria-expanded={open}>{open ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
      </div>
      {open && (
        <div className="border-t border-[#ffffff1a] bg-[#0B1F44] px-4 pb-4 lg:hidden" data-testid="mobile-menu">
          {links.map((x) => <a key={x.h} href={x.h} onClick={() => setOpen(false)} className="block border-b border-[#ffffff12] py-3 font-semibold text-[#d6e0f5]">{x.l}</a>)}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setOpen(false); onLogin(); }} className="rounded-lg border border-[#ffffff40] py-2.5 font-bold text-[#ffffff]">{t("Log in", "تسجيل الدخول")}</button>
            <button type="button" onClick={() => { setOpen(false); onJoin(); }} className="rounded-lg bg-[#007BFF] py-2.5 font-bold text-[#ffffff]">{t("Request subscription", "اطلب الاشتراك")}</button>
          </div>
        </div>
      )}
    </header>
  );
}

export function Hero({ onJoin }: { onJoin: OnPlan }) {
  const { t, isRTL } = useLang();
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  return (
    <section id="top" className="relative overflow-hidden bg-[#0B1F44] pb-16 pt-28 sm:pb-24 sm:pt-36">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(60% 50% at 80% 10%, rgba(0,123,255,.35), transparent 70%), radial-gradient(40% 40% at 10% 90%, rgba(0,194,255,.18), transparent 70%)" }} />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <span className="mb-5 inline-block rounded-full border border-[#00C2FF55] bg-[#00C2FF14] px-4 py-1.5 text-sm font-bold text-[#00C2FF]">MIHWAR CLOUD ERP</span>
          <h1 className="text-4xl font-black leading-[1.2] text-[#ffffff] [text-wrap:balance] sm:text-5xl lg:text-[3.25rem]">{t("All your business… in one Mihwar", "كل أعمالك.. في محور واحد")}</h1>
          <p className="mt-5 text-xl font-bold text-[#00C2FF] sm:text-2xl">{t("Mihwar Cloud platform to run your business intelligently", "منصة محور السحابية لإدارة أعمالك التجارية بذكاء")}</p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[#c9d6ee] sm:text-lg">{t("Control your accounts, sales, purchases, inventory and branches from one platform. Clearer visibility, faster decisions, more efficient management.", "تحكم في حساباتك ومبيعاتك ومشترياتك ومخزونك وفروعك من منصة واحدة. رؤية واضحة، قرارات أسرع، وإدارة أكثر كفاءة.")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => onJoin("trial")} className={btnPrimary} data-testid="hero-cta">{t("Start your free trial", "ابدأ تجربتك المجانية")}<Arrow size={18} /></button>
            <a href="#demo" className={btnGhostDark} data-testid="hero-demo">{t("Explore the system", "استعرض النظام")}</a>
          </div>
        </div>
        <div className="relative">
          <ErpDashboardMock />
          <p className="mt-8 text-center text-xs text-[#9fb2d6]">{t("Illustrative interface — sample data", "واجهة توضيحية — بيانات تجريبية")}</p>
        </div>
      </div>
    </section>
  );
}

export function CapabilityStrip() {
  const { t } = useLang();
  return (
    <div className="border-b border-[#E6E8ED] bg-[#ffffff]">
      <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 py-6 sm:grid-cols-3 sm:px-6 lg:grid-cols-6">
        {CAPABILITIES.map((c) => (
          <li key={c.t.en} className="flex items-center gap-2.5 px-2 py-2 text-sm font-bold text-[#0B1F44]">
            <Ico name={c.icon} size={20} className="shrink-0 text-[#007BFF]" />{t(c.t.en, c.t.ar)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ModulesSection() {
  const { t } = useLang();
  return (
    <Section id="modules">
      <Heading eyebrow={t("Core modules", "الوحدات الرئيسية")} title={t("Everything your business needs, connected", "كل ما تحتاجه منشأتك، مترابطًا")} sub={t("Seven modules that share one ledger, one inventory and one set of permissions.", "سبع وحدات تتشارك دفتر حسابات واحدًا ومخزونًا واحدًا وصلاحيات موحدة.")} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <article key={m.title.en} className="group rounded-2xl border border-[#E6E8ED] bg-[#ffffff] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#007BFF66] hover:shadow-xl hover:shadow-[#0B1F44]/10">
            <IconTile name={m.icon} />
            <h3 className="mb-3 mt-4 text-lg font-extrabold text-[#0B1F44]">{t(m.title.en, m.title.ar)}</h3>
            <ul className="space-y-2 text-sm leading-relaxed text-[#4b5b78]">
              {m.points.map((p) => <li key={p.en} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#00C2FF]" />{t(p.en, p.ar)}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </Section>
  );
}

export function NewFeaturesSection() {
  const { t } = useLang();
  return (
    <Section id="new" tone="gray">
      <Heading eyebrow={t("What's new", "التطويرات الجديدة")} title={t("Latest improvements, already in the system", "أحدث التطويرات الموجودة فعليًا في النظام")} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {NEW_FEATURES.map((f) => (
          <article key={f.title.en} className="flex flex-col overflow-hidden rounded-2xl border border-[#E6E8ED] bg-[#ffffff] transition duration-300 hover:shadow-xl hover:shadow-[#0B1F44]/10">
            {f.img && <img src={img(f.img)} alt={t(f.title.en, f.title.ar)} loading="lazy" decoding="async" className="h-40 w-full border-b border-[#E6E8ED] object-cover object-top" />}
            <div className="flex-1 p-6">
              <IconTile name={f.icon} />
              <h3 className="mb-2 mt-4 text-lg font-extrabold text-[#0B1F44]">{t(f.title.en, f.title.ar)}</h3>
              <p className="text-sm leading-relaxed text-[#4b5b78]">{t(f.text.en, f.text.ar)}</p>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

export function BranchSection() {
  const { t } = useLang();
  return (
    <Section id="branches">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Heading center={false} eyebrow={t("Branches & central control", "إدارة الفروع والتحكم المركزي")} title={t("Many branches, one control centre", "فروع متعددة.. وتحكم مركزي واحد")} sub={t("Set company-wide defaults once, then tailor each branch where it differs.", "اضبط افتراضيات الشركة مرة واحدة ثم خصّص كل فرع حيث يختلف.")} />
          <CheckList items={BRANCH_POINTS.map((p) => t(p.en, p.ar))} />
        </div>
        <ErpBranchesMock />
      </div>
    </Section>
  );
}

export function ReportsSection() {
  const { t } = useLang();
  return (
    <Section id="reports" tone="navy">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <ErpReportsMock />
        <div>
          <Heading dark center={false} eyebrow={t("Reports & analytics", "التقارير والتحليلات")} title={t("Numbers that lead to decisions", "أرقام تقودك إلى القرار")} sub={t("See where you stand today and how it compares with the previous period.", "اعرف موقفك اليوم وكيف يقارن بالفترة السابقة.")} />
          <CheckList dark items={REPORT_POINTS.map((p) => t(p.en, p.ar))} />
        </div>
      </div>
    </Section>
  );
}

export function DemoSection({ onJoin }: { onJoin: OnPlan }) {
  const { t } = useLang();
  const [id, setId] = useState(DEMO_TABS[0].id);
  const cur = DEMO_TABS.find((x) => x.id === id) ?? DEMO_TABS[0];
  return (
    <Section id="demo" tone="gray">
      <Heading eyebrow={t("Try the system", "تجربة النظام")} title={t("See the real screens", "شاهد شاشات النظام الحقيقية")} sub={t("Screens captured from the system with sample data. Request a free trial to explore it with your own data.", "شاشات ملتقطة من النظام ببيانات تجريبية. اطلب تجربة مجانية لتستكشفه ببياناتك.")} />
      <div role="tablist" aria-label={t("Screens", "الشاشات")} className="mb-6 flex flex-wrap justify-center gap-2">
        {DEMO_TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === id} onClick={() => setId(x.id)} data-testid={`demo-tab-${x.id}`} className={`rounded-full px-4 py-2 text-sm font-bold transition ${x.id === id ? "bg-[#0B1F44] text-[#ffffff]" : "bg-[#ffffff] text-[#0B1F44] ring-1 ring-[#d5dae5] hover:ring-[#007BFF]"}`}>{t(x.label.en, x.label.ar)}</button>
        ))}
      </div>
      <div className="mx-auto max-w-6xl">
        <BrowserFrame src={img(cur.img)} alt={t(cur.caption.en, cur.caption.ar)} zoomLabel={t("Click to enlarge", "اضغط للتكبير")} />
        <p className="mt-4 text-center text-sm font-semibold text-[#4b5b78]" data-testid="demo-caption">{t(cur.caption.en, cur.caption.ar)}</p>
        <div className="mt-6 text-center"><button type="button" onClick={() => onJoin("trial")} className={btnPrimary}>{t("Start your free trial", "ابدأ تجربتك المجانية")}</button></div>
      </div>
    </Section>
  );
}

export function PrintSection({ onJoin }: { onJoin: OnPlan }) {
  const { t } = useLang();
  const [kind, setKind] = useState(PRINT_DOCS[1].kind);
  const cur = PRINT_DOCS.find((d) => d.kind === kind) ?? PRINT_DOCS[0];
  return (
    <Section id="print">
      <Heading eyebrow={t("Document-cycle printing", "نماذج الطباعة للدورة المستندية")} title={t("Professional documents, ready to print", "مستندات احترافية جاهزة للطباعة")} sub={t("Nine templates covering the sales and purchases cycles — quotation to journal voucher.", "تسعة نماذج تغطي دورتي المبيعات والمشتريات — من عرض السعر إلى قيد اليومية.")} />
      <div className="grid items-start gap-8 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          {PRINT_STAGES.map((st) => (
            <div key={st.id}>
              <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#007BFF]">{t(st.t.en, st.t.ar)}</div>
              <div className="space-y-1.5">
                {PRINT_DOCS.filter((d) => d.stage === st.id).map((d, i) => (
                  <button key={d.kind} type="button" onClick={() => setKind(d.kind)} data-testid={`print-${d.kind}`} aria-pressed={d.kind === kind}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start text-sm font-bold transition ${d.kind === kind ? "border-[#0B1F44] bg-[#0B1F44] text-[#ffffff]" : "border-[#E6E8ED] bg-[#ffffff] text-[#0B1F44] hover:border-[#007BFF]"}`}>
                    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${d.kind === kind ? "bg-[#00C2FF] text-[#0B1F44]" : "bg-[#007BFF14] text-[#007BFF]"}`}>{i + 1}</span>{t(d.t.en, d.t.ar)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="rounded-xl bg-[#F4F6FA] p-4"><CheckList items={PRINT_POINTS.map((p) => t(p.en, p.ar))} /></div>
        </div>
        <div>
          <div className="overflow-hidden rounded-2xl border border-[#E6E8ED] bg-[#ffffff] shadow-[0_30px_80px_-20px_rgba(11,31,68,0.35)]">
            <ZoomImg key={cur.kind} src={`/landing/print/${cur.kind}.webp`} alt={t(cur.t.en, cur.t.ar)} label={t("Click to enlarge", "اضغط للتكبير")} />
          </div>
          <p className="mt-3 text-center text-sm font-semibold text-[#4b5b78]" data-testid="print-caption">{t(cur.t.en, cur.t.ar)} — {t("sample data, bilingual layout", "بيانات توضيحية، تخطيط ثنائي اللغة")}</p>
          <div className="mt-5 text-center"><button type="button" onClick={() => onJoin("trial")} className={btnPrimary}>{t("Start your free trial", "ابدأ تجربتك المجانية")}</button></div>
        </div>
      </div>
    </Section>
  );
}

export function PricingSection2({ onJoin }: { onJoin: OnPlan }) {
  const { t } = useLang();
  return (
    <Section id="pricing">
      <Heading eyebrow={t("Subscriptions", "الاشتراكات وطلب الانضمام")} title={t("Choose how you want to start", "اختر طريقة بدايتك")} sub={t("Send a request and our team will contact you with the details that fit your business.", "أرسل طلبك وسيتواصل معك فريقنا بالتفاصيل المناسبة لمنشأتك.")} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_CARDS.map((p) => {
          const hl = p.id === "trial";
          return (
            <article key={p.id} className={`relative flex flex-col rounded-2xl border p-6 ${hl ? "border-[#007BFF] bg-[#0B1F44] shadow-xl shadow-[#007BFF]/20" : "border-[#E6E8ED] bg-[#ffffff]"}`}>
              {p.tag && <span className={`absolute -top-3 start-6 rounded-full px-3 py-1 text-xs font-bold ${hl ? "bg-[#00C2FF] text-[#0B1F44]" : "bg-[#007BFF] text-[#ffffff]"}`}>{t(p.tag.en, p.tag.ar)}</span>}
              <h3 className={`mb-4 mt-1 text-xl font-extrabold ${hl ? "text-[#ffffff]" : "text-[#0B1F44]"}`}>{t(p.title.en, p.title.ar)}</h3>
              <div className="mb-6 flex-1"><CheckList dark={hl} items={p.points.map((x) => t(x.en, x.ar))} /></div>
              <button type="button" onClick={() => onJoin(p.id)} data-testid={`plan-${p.id}`} className={`rounded-xl py-3 font-bold transition ${hl ? "bg-[#007BFF] text-[#ffffff] hover:bg-[#0062CC]" : "border border-[#007BFF] text-[#007BFF] hover:bg-[#007BFF] hover:text-[#ffffff]"}`}>{p.id === "trial" ? t("Start your free trial", "ابدأ تجربتك المجانية") : t("Request subscription", "اطلب الاشتراك")}</button>
            </article>
          );
        })}
      </div>
    </Section>
  );
}

export function FaqSection2() {
  const { t } = useLang();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faq" tone="gray">
      <Heading eyebrow={t("FAQ", "الأسئلة الشائعة")} title={t("Questions we often hear", "أسئلة نسمعها كثيرًا")} />
      <div className="mx-auto max-w-3xl space-y-3">
        {FAQS.map((x, i) => {
          const on = open === i;
          return (
            <div key={x.q.en} className="rounded-xl border border-[#E6E8ED] bg-[#ffffff]">
              <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start font-bold text-[#0B1F44]">
                {t(x.q.en, x.q.ar)}<span className={`text-xl text-[#007BFF] transition-transform ${on ? "rotate-45" : ""}`}>+</span>
              </button>
              {on && <p className="px-5 pb-5 leading-relaxed text-[#4b5b78]">{t(x.a.en, x.a.ar)}</p>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function FinalCta({ onJoin }: { onJoin: OnPlan }) {
  const { t } = useLang();
  return (
    <section className="bg-[#0B1F44] py-16 text-center" style={{ background: "linear-gradient(135deg,#0B1F44,#0A3A7A)" }}>
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="text-3xl font-black text-[#ffffff] sm:text-4xl">{t("Ready to bring your business into one Mihwar?", "جاهز لتجمع أعمالك في محور واحد؟")}</h2>
        <p className="mt-3 text-[#c9d6ee]">{t("Free trial with no setup fee and no credit card. Trial length is agreed with our team.", "تجربة مجانية بدون رسوم تأسيس أو بطاقة ائتمانية. مدة التجربة يتفق عليها فريقنا معك.")}</p>
        <button type="button" onClick={() => onJoin("trial")} className={`${btnPrimary} mt-7`} data-testid="final-cta">{t("Start your free trial", "ابدأ تجربتك المجانية")}</button>
      </div>
    </section>
  );
}

export function LandingFooter2({ onLogin, onJoin }: { onLogin: () => void; onJoin: OnPlan }) {
  const { t } = useLang();
  const cols = [
    { h: "#modules", l: t("Modules", "الوحدات") }, { h: "#new", l: t("What's new", "الجديد") }, { h: "#branches", l: t("Branches", "الفروع") },
    { h: "#reports", l: t("Reports", "التقارير") }, { h: "#pricing", l: t("Plans", "الاشتراكات") }, { h: "#faq", l: t("FAQ", "الأسئلة الشائعة") },
  ];
  return (
    <footer className="bg-[#07142e] py-12 text-[#aebbd8]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <BrandLogo size={40} onDark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">{t("A cloud ERP for accounting, sales, purchases, inventory and branches.", "منصة ERP سحابية للمحاسبة والمبيعات والمشتريات والمخزون والفروع.")}</p>
        </div>
        <nav aria-label={t("Footer", "روابط التذييل")}>
          <h4 className="mb-3 font-bold text-[#ffffff]">{t("Explore", "استكشف")}</h4>
          <ul className="grid grid-cols-2 gap-2 text-sm">{cols.map((c) => <li key={c.h}><a href={c.h} className="hover:text-[#00C2FF]">{c.l}</a></li>)}</ul>
        </nav>
        <div>
          <h4 className="mb-3 font-bold text-[#ffffff]">{t("Get started", "ابدأ الآن")}</h4>
          <div className="flex flex-col items-start gap-2 text-sm">
            <button type="button" onClick={() => onJoin()} className="inline-flex items-center gap-2 hover:text-[#00C2FF]"><Mail size={15} />{t("Request subscription", "اطلب الاشتراك")}</button>
            <button type="button" onClick={onLogin} className="hover:text-[#00C2FF]">{t("Log in", "تسجيل الدخول")}</button>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-7xl border-t border-[#ffffff14] px-4 pt-6 text-xs sm:px-6">© {new Date().getFullYear()} MIHWAR CLOUD ERP. {t("All rights reserved.", "جميع الحقوق محفوظة.")}</div>
    </footer>
  );
}
