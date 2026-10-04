import { Nav } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="page">{children}</main>
    </>
  );
}
