"use client";
import { useRouter } from "next/navigation";
export function ReaderNavigation({
  items,
  current,
  lesson = false,
}: {
  items: { id: string; title: string; href: string }[];
  current: string;
  lesson?: boolean;
}) {
  const router = useRouter();
  return (
    <>
      <label className="mobile-reader-select-label">
        <span className="sr-only">
          {lesson ? "Choose a lesson" : "Choose a guide"}
        </span>
        <select
          className="mobile-reader-select"
          aria-label={lesson ? "Choose a lesson" : "Choose a guide"}
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
      <details open className="reader-menu">
        <summary>{lesson ? "Six short lessons" : "Documentation"}</summary>
        <nav
          aria-label={lesson ? "Lesson navigation" : "Documentation navigation"}
        >
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              aria-current={item.id === current ? "page" : undefined}
            >
              {item.title}
            </a>
          ))}
        </nav>
      </details>
    </>
  );
}
