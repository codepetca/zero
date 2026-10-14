import { redirect } from "next/navigation";
export const metadata = { title: "Examples · ZeroHub" };
export default function Examples() {
  redirect("/hub?kind=example");
}
