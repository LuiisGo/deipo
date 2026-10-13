import "./ops.css";
export const metadata = {
  title: "deipo. · Operaciones",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <div className="ops-root">{children}</div>;
}
