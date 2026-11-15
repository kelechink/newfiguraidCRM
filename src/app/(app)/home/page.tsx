import { redirect } from "next/navigation";

// Staff home. The Command Centre lands here (build step 3b); until then Tasks is home.
export default function Home() {
  redirect("/work/tasks");
}
