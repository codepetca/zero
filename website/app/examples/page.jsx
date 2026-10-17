import { redirect } from "next/navigation";
export const metadata = { title: "Examples · ZeroHub" };
export default function Examples() {
  redirect("/learn");
}
