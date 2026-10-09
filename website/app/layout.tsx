import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: { default: 'Zero — a simple Java kit', template: '%s — Zero' }, description: 'A simple kit for building Java apps. Ordinary Java, VS Code and a small JavaFX library.' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
