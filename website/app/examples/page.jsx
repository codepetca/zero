import { redirect } from "next/navigation";
export const metadata = { title: "Tutorials" };
export default function Examples() {
  redirect("/learn");
}
