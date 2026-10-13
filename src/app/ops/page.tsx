import { redirect } from "next/navigation";
import { requireOps, opsHome } from "@/lib/ops/auth";
export default async function OpsHome() {
  const { role } = await requireOps();
  redirect(opsHome(role));
}
