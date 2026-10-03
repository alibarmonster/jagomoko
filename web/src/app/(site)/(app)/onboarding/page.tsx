import type { Metadata } from "next";
import { OnboardingView } from "@/components/app/onboarding-view";

export const metadata: Metadata = { title: "Create your character" };

export default function OnboardingPage() {
  return <OnboardingView />;
}
