import type { Metadata } from "next";
import { Terminal } from "@/components/terminal";

export const metadata: Metadata = {
  title: "Azuriya — Trading Terminal",
  description:
    "Access your authenticated Azuriya workspace with clearly labelled simulated trading.",
  robots: { index: false, follow: false },
};

export default async function TerminalPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { mode } = await searchParams;
  return <Terminal initialRegister={mode === "register"} />;
}
