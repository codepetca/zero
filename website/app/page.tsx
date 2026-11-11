import { Downloads } from "@/components/Downloads";
import home from "@/content/home.json";
import { productTagline, productTitle } from "@/lib/product-copy.mjs";
import { LearnTheme } from "./learn/LearnTheme";
import "../.generated/learn-theme.css";
import "./learn/learn.css";

const [taglineLead, taglineAccent] = productTagline.split(/(\bzero)$/);

export const metadata = {
  title: { absolute: `${productTitle} | Zero` },
  description: home.description,
};
export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <LearnTheme active="">
      <main id="page-content" tabIndex={-1} className="hub home-page">
        <div className="hub-intro">
          <h1>{productTitle}</h1>
          <p className="hub-lead">
            {taglineLead}
            <span className="home-subtitle-accent">{taglineAccent}</span>
          </p>
          <p className="home-description">{home.description}</p>
        </div>
        <Downloads />
      </main>
    </LearnTheme>
  );
}
