"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
export function ReaderNavigation({
  items,
  current,
  section = "Docs",
  groups,
}: {
  items: { id: string; title: string; href: string }[];
  current: string;
  section?: "Tutorials" | "Docs" | "Examples" | "Help" | "For teachers";
  groups?: { id: string; title: string; lessons: string[] }[];
}) {
  const router = useRouter();
  const lesson = section === "Tutorials";
  const label = lesson ? "Choose a lesson" : section === "Examples" ? "Choose an example" : "Choose a guide";
  const link = (item: typeof items[number]) => (
      <Link key={item.id} href={item.href}
        aria-current={item.id === current ? "page" : undefined}>
        {item.title}
      </Link>
    );
  const grouped = lesson && groups?.length ? groups.map(group => ({
    ...group, items: items.filter(item => group.lessons.includes(item.id)),
  })) : null;
  const links = <nav aria-label={lesson ? "Lesson navigation" : `${section} navigation`}>
    {grouped ? grouped.map(group => (
      <div className="lesson-navigation-group" key={group.id}>
        <h2>{group.title}</h2>
        {group.items.map(link)}
      </div>
    )) : items.map(link)}
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
          {grouped && !grouped.some(group => group.items.some(item => item.id === current)) && items.find(item => item.id === current) && (
            <option value={current} hidden>{items.find(item => item.id === current)?.title}</option>
          )}
          {grouped ? grouped.map(group => (
            <optgroup key={group.id} label={group.title}>
              {group.items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </optgroup>
          )) : items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <div className="reader-menu lesson-menu">
        {!grouped && <h2>{lesson ? `Lessons ${items[0]?.id}–${items.at(-1)?.id}` : section}</h2>}
        {links}
      </div>
    </>
  );
}
