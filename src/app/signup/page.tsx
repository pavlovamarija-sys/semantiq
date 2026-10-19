import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "@/app/auth/actions";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getAuthenticatedUser()) redirect("/app");
  const { error } = await searchParams;
  return <main className="mx-auto max-w-sm px-6 py-20">
    <h1 className="text-2xl font-semibold">Креирајте сметка</h1>
    {error && <p role="alert" className="mt-4 text-red-700">{error === "signup" ? "Сметката не може да се креира. Обидете се повторно." : "Проверете ги е-поштата, лозинката и потврдата на лозинката."}</p>}
    <form action={signUp} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1">Е-пошта<input className="rounded border p-2" name="email" type="email" autoComplete="email" required /></label>
      <label className="flex flex-col gap-1">Лозинка<input className="rounded border p-2" name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <label className="flex flex-col gap-1">Потврдете ја лозинката<input className="rounded border p-2" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
      <button className="rounded bg-slate-900 p-2 text-white" type="submit">Креирај сметка</button>
    </form>
    <p className="mt-5">Веќе имате сметка? <Link className="underline" href="/login">Најавете се</Link></p>
  </main>;
}
