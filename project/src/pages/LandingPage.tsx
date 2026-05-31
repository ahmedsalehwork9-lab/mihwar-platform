/**
 * MIHWAR | مِحور — Landing Page
 * ─────────────────────────────
 * File: src/pages/LandingPage.tsx
 * 
 * Integration:
 * In App.tsx, render this component when page === 'landing':
 * <LandingPage onLogin={() => setPage('login')} />
 */

import LandingNav from "../components/landing/LandingNav";
import HeroSection from "../components/landing/HeroSection";
import ProblemSection from "../components/landing/ProblemSection";
import FeaturesSection from "../components/landing/FeaturesSection";
import HowItWorksSection from "../components/landing/HowItWorksSection";
import ScreenshotsSection from "../components/landing/ScreenshotsSection";
import PricingSection from "../components/landing/PricingSection";
import FaqSection from "../components/landing/FaqSection";
import CtaSection from "../components/landing/CtaSection";
import LandingFooter from "../components/landing/LandingFooter";

type LandingPageProps = {
  onLogin?: () => void;
};

export default function LandingPage({ onLogin }: LandingPageProps) {
  // Navigation wrapper to ensure it only fires if the prop is provided
  const handleNavigation = () => {
    onLogin?.();
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen overflow-x-hidden"
      style={{ background: "#0A1220", color: "#E8EDF5" }}
    >
      {/* Navigation Bar */}
      <LandingNav onLogin={handleNavigation} />

      <main>
        {/* Hero Section */}
        <HeroSection onStart={handleNavigation} onLogin={handleNavigation} />

        {/* Problem Description */}
        <ProblemSection />

        {/* Core Features */}
        <FeaturesSection />

        {/* Workflow Steps */}
        <HowItWorksSection />

        {/* App Preview / Screenshots */}
        <ScreenshotsSection />

        {/* Subscription Plans */}
        <PricingSection onStart={handleNavigation} />

        {/* Frequently Asked Questions */}
        <FaqSection />

        {/* Final Call to Action */}
        <CtaSection onStart={handleNavigation} />
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}