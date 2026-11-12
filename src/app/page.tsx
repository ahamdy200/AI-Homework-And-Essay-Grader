import React from "react";
import { WorkbenchClient } from "@/components/WorkbenchClient";
import { resolveApiKey } from "@/lib/gemini";
import { RUBRIC_PRESETS } from "@/lib/presets";
import { readWorkbenchData } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await readWorkbenchData();
  const envConfigured = Boolean(resolveApiKey(null));

  return (
    <WorkbenchClient
      initialAssignments={data.assignments}
      initialSubmissions={data.submissions}
      presets={RUBRIC_PRESETS}
      initialEnvConfigured={envConfigured}
    />
  );
}
