import { HomeScreen } from "@/screens/home/ui/HomeScreen";
import { loadPlannerOptions } from "@/lib/planner/options-store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialPlannerOptions = await loadPlannerOptions();

  return <HomeScreen initialPlannerOptions={initialPlannerOptions} />;
}
