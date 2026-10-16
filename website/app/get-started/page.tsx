import { redirect } from "next/navigation";

// Keep old setup links useful; GitHub connection now happens in desktop Zero.
export default function GetStartedPage() {
  redirect("/downloads");
}
