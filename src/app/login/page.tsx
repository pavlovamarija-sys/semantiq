import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/app/auth/actions";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  if (await getAuthenticatedUser()) redirect("/app");
  const { error, notice } = await searchParams;
  return <main className="mx-auto max-w-sm px-6 py-20">
    <h1 className="text-2xl font-semibold">Најавете се</h1>
    {error && <p role="alert" className="mt-4 text-red-700">{error === "credentials" ? "Неточна е-пошта или лозинка." : error === "confirmation" ? "Потврдата не успеа. Обидете се повторно да се најавите." : "Внесете валидна е-пошта и лозинка."}</p>}
    {notice && <p role="status" className="mt-4 text-slate-700">{notice === "confirm-email" ? "Проверете ја е-поштата, потврдете ја сметката, а потоа најавете се." : "Успешно се одјавивте."}</p>}
    <form action={signIn} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1">Е-пошта<input className="rounded border p-2" name="email" type="email" autoComplete="email" required /></label>
      <label className="flex flex-col gap-1">Лозинка<input className="rounded border p-2" name="password" type="password" autoComplete="current-password" required /></label>
      <button className="rounded bg-slate-900 p-2 text-white" type="submit">Најави се</button>
    </form>
    <p className="mt-5">Немате сметка? <Link className="underline" href="/signup">Регистрирајте се</Link></p>
  </main>;
}
