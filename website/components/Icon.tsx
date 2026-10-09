export function Icon({ name }: { name: string }) {
  return <i aria-hidden="true" className={`bi bi-${name}`} />;
}
