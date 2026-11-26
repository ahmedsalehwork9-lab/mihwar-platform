/**
 * MIHWAR CLOUD ERP — صفحة الهبوط العامة (إعادة تصميم).
 * تحافظ على الواجهة السابقة: props onLogin / activity، ومسارات النشاط (/spare-parts …) تعرض نفس الصفحة.
 */
import { useCallback, useState } from "react";
import { useLang } from "../context/LanguageContext";
import { LandingTopNav, Hero, CapabilityStrip, ModulesSection, NewFeaturesSection, BranchSection, ReportsSection, DemoSection, PricingSection2, FaqSection2, FinalCta, LandingFooter2 } from "../components/landing/LandingSections";
import SubscriptionModal from "../components/landing/SubscriptionModal";
import type { PlanId } from "../components/landing/subscriptionLogic";

type ActivityType = "spare-parts" | "grocery" | "cafe" | "restaurant" | "retail" | "general";
type LandingPageProps = { onLogin?: () => void; activity?: ActivityType };

export default function LandingPage({ onLogin }: LandingPageProps) {
  const { isRTL } = useLang();
  const [modal, setModal] = useState<{ open: boolean; plan: PlanId; n: number }>({ open: false, plan: "trial", n: 0 });
  const login = useCallback(() => { onLogin?.(); }, [onLogin]);
  const join = useCallback((p?: PlanId) => setModal((m) => ({ open: true, plan: p ?? "trial", n: m.n + 1 })), []);
  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="min-h-screen overflow-x-hidden scroll-smooth bg-[#ffffff] text-[#0B1F44]" style={{ scrollBehavior: "smooth" }}>
      <LandingTopNav onLogin={login} onJoin={join} />
      <main>
        <Hero onJoin={join} />
        <CapabilityStrip />
        <ModulesSection />
        <NewFeaturesSection />
        <BranchSection />
        <ReportsSection />
        <DemoSection onJoin={join} />
        <PricingSection2 onJoin={join} />
        <FaqSection2 />
        <FinalCta onJoin={join} />
      </main>
      <LandingFooter2 onLogin={login} onJoin={join} />
      <SubscriptionModal key={modal.n} open={modal.open} plan={modal.plan} onClose={() => setModal((m) => ({ ...m, open: false }))} />
    </div>
  );
}
