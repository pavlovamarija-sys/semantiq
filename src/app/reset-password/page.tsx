import Link from "next/link";
import { updatePassword } from "@/app/auth/actions";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  expired: "Врската за обнова е истечена. Побарајте нова врска.",
  "invalid-link": "Врската за обнова не е валидна или веќе е искористена.",
  unavailable: "Услугата за најава е привремено недостапна.",
  session: "Сесијата за обнова не е достапна. Побарајте нова врска.",
  "password-mismatch": "Лозинките мора да се совпаѓаат и да содржат најмалку 8 знаци.",
  update: "Лозинката не може да се зачува. Обидете се повторно.",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await getAuthenticatedUser({ networkFailure: "anonymous" });
  const canReset = Boolean(user) && !["expired", "invalid-link", "unavailable"].includes(error ?? "");
  const message = error ? messages[error] ?? messages["invalid-link"] : !user ? messages.session : null;

  return <main className="mx-auto max-w-sm px-6 py-20">
    <h1 className="text-2xl font-semibold">Нова лозинка</h1>
    {message && <p role="alert" className="mt-4 text-red-700">{message}</p>}
    {canReset ? <form action={updatePassword} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1">Нова лозинка<input className="rounded border p-2" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
      <label className="flex flex-col gap-1">Потврдете ја лозинката<input className="rounded border p-2" name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></label>
      <button className="rounded bg-slate-900 p-2 text-white">Зачувај лозинка</button>
    </form> : <Link className="mt-6 inline-block underline" href="/forgot-password">Побарајте нова врска</Link>}
  </main>;
}
