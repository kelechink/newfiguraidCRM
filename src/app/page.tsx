import { redirect } from "next/navigation";

// Command Centre lands in build step 3b/3c; until then Tasks is home.
export default function Home() {
  redirect("/work/tasks");
}
