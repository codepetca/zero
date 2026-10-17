import { redirect } from "next/navigation";
export const metadata = { title: "Tutorials" };
export default function Page() {
  redirect("/learn");
}
