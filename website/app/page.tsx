import { Downloads } from "@/components/Downloads";
import { productDescription, productTagline, productTitle } from "@/lib/product-copy.mjs";
import { LearnTheme } from "./learn/LearnTheme";
import "../.generated/learn-theme.css";
import "./learn/learn.css";

export const metadata = { title: { absolute: `${productTitle} | Zero` } };
export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <LearnTheme active="">
      <main id="page-content" tabIndex={-1} className="hub home-page">
        <div className="hub-intro">
          <h1>{productTitle}</h1>
          <p className="hub-lead">{productTagline}</p>
          <p className="home-description">{productDescription}</p>
        </div>
        <Downloads />
      </main>
    </LearnTheme>
  );
}
