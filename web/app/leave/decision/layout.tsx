import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Approve leave",
  robots: { index: false, follow: false },
};

export default function LeaveDecisionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
