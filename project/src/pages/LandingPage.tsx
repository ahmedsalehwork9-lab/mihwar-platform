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

type ActivityType =
  | "spare-parts"
  | "grocery"
  | "cafe"
  | "restaurant"
  | "retail"
  | "general";

type LandingPageProps = {
  onLogin?: () => void;
};

function getActivityFromPath(): ActivityType {
  const path = window.location.pathname.toLowerCase();

  if (
    path === "/spare-parts" ||
    path.startsWith("/spare-parts/")
  ) {
    return "spare-parts";
  }

  if (
    path === "/grocery" ||
    path.startsWith("/grocery/")
  ) {
    return "grocery";
  }

  if (
    path === "/cafe" ||
    path.startsWith("/cafe/")
  ) {
    return "cafe";
  }

  if (
    path === "/restaurant" ||
    path.startsWith("/restaurant/")
  ) {
    return "restaurant";
  }

  if (
    path === "/retail" ||
    path.startsWith("/retail/")
  ) {
    return "retail";
  }

  return "general";
}

export default function LandingPage({ onLogin }: LandingPageProps) {
  const handleNavigation = () => {
    onLogin?.();
  };

  const activity = getActivityFromPath();

  return (
    <div
      dir="rtl"
      className="min-h-screen overflow-x-hidden"
      style={{
        background: "#0A1220",
        color: "#E8EDF5",
      }}
    >
      <LandingNav onLogin={handleNavigation} />

      <main>
        <HeroSection
          activity={activity}
          onStart={handleNavigation}
          onLogin={handleNavigation}
        />

        <ProblemSection />
        <FeaturesSection />
        <HowItWorksSection />
        <ScreenshotsSection />
        <PricingSection onStart={handleNavigation} />
        <FaqSection />
        <CtaSection onStart={handleNavigation} />
      </main>

      <LandingFooter />
    </div>
  );
}