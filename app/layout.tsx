import type { Metadata } from "next";
import { Baloo_2, Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const baloo = Baloo_2({ variable: "--font-baloo", subsets: ["latin"], weight: ["600", "800"] });

export const metadata: Metadata = {
  title: "Unsa Ni? Point your camera at a Filipino dish",
  description: "An AI that names Filipino dishes from a photo: adobo, sinigang, halo-halo and 32 more. It runs in your browser, so your photo never leaves your device.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${baloo.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
