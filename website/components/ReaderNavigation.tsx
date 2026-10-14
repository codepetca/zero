"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
export function ReaderNavigation({
  items,
  current,
  section = "Docs",
}: {
  items: { id: string; title: string; href: string }[];
  current: string;
  section?: "Tutorials" | "Docs" | "Examples";
}) {
  const router = useRouter();
  const lesson = section === "Tutorials";
  const label = lesson ? "Choose a lesson" : section === "Examples" ? "Choose an example" : "Choose a guide";
  const links = <nav aria-label={lesson ? "Lesson navigation" : section === "Examples" ? "Example navigation" : "Documentation navigation"}>
    {items.map((item) => (
      <Link key={item.id} href={item.href}
        aria-current={item.id === current ? "page" : undefined}>
        {item.title}
      </Link>
    ))}
  </nav>;
  return (
    <>
      <label className="mobile-reader-select-label">
        <span className="sr-only">{label}</span>
        <select
          className="mobile-reader-select"
          aria-label={label}
          value={current}
          onChange={(event) => {
            const item = items.find((i) => i.id === event.target.value);
            if (item) router.push(item.href);
          }}
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <div className="reader-menu lesson-menu">
        <h2>{lesson ? `Lessons ${items[0]?.id}–${items.at(-1)?.id}` : section === "Examples" ? "Examples" : "Documentation"}</h2>
        {links}
      </div>
    </>
  );
}
