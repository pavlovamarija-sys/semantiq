import Link from "next/link";
import { requestPasswordReset } from "@/app/auth/actions";

const errorMessages: Record<string, string> = {
  "invalid-email": "Внесете валидна адреса за е-пошта.",
  "rate-limit": "Испратени се премногу барања. Почекајте пред повторно да побарате врска.",
  unavailable: "Услугата за најава е привремено недостапна. Обидете се повторно подоцна.",
  request: "Барањето не може да се испрати. Обидете се повторно подоцна.",
};

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  return <main className="mx-auto max-w-sm px-6 py-20">
    <h1 className="text-2xl font-semibold">Обнова на лозинка</h1>
    <p className="mt-3 text-slate-600">Внесете ја е-поштата поврзана со вашата сметка.</p>
    {error && <p role="alert" className="mt-4 text-red-700">{errorMessages[error] ?? errorMessages.request}</p>}
    {notice && <p role="status" className="mt-4 text-green-700">Проверете ја е-поштата за врската за обнова.</p>}
    <form action={requestPasswordReset} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1">Е-пошта<input className="rounded border p-2" name="email" type="email" autoComplete="email" required /></label>
      <button className="rounded bg-slate-900 p-2 text-white">Испрати врска</button>
    </form>
    <Link className="mt-5 inline-block underline" href="/">Назад кон најавување</Link>
  </main>;
}
