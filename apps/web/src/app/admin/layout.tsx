import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isAdminHost } from "../../lib/admin-host";
import "./staff.css";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!isAdminHost((await headers()).get("host"))) notFound();
  return children;
}
