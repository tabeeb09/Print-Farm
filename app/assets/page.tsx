import AssetClient from "@/components/assets/AssetClient";
import { requireSession } from "@/src/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function AssetLoansPage() {
  await requireSession();

  return <AssetClient mode="loanable" />;
}
