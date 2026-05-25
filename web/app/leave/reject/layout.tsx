import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reject leave",
  robots: { index: false, follow: false },
};

export default function LeaveRejectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
