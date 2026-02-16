import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/layout/nav";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-neutral-50">
      <Nav user={{ name: session.user.name, image: session.user.image }} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
