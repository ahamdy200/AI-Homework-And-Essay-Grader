import { QuickGradeClient } from "@/components/QuickGradeClient";
import { resolveApiKey } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export default async function QuickGradePage() {
  const envConfigured = Boolean(resolveApiKey(null));

  return <QuickGradeClient initialEnvConfigured={envConfigured} />;
}
