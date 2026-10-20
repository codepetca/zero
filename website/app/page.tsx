import { Downloads } from "@/components/Downloads";
import { LearnTheme } from "./learn/LearnTheme";
import "../.generated/learn-theme.css";
import "./learn/learn.css";

export const metadata = { title: { absolute: "zero" } };
export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <LearnTheme active="">
      <main id="page-content" tabIndex={-1} className="hub home-page">
        <div className="hub-intro">
          <h1>Learn Java</h1>
          <p className="hub-lead">Starting from zero.</p>
        </div>
        <Downloads />
      </main>
    </LearnTheme>
  );
}
