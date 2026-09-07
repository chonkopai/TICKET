import { ru } from "@event-platform/shared-types";

import { TelegramLoginButton } from "../_components/telegram-login-button";
import { BackLink } from "../../../components/back-link";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
        <BackLink href="/" />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">{ru.auth.loginTitle}</h1>
        <p className="mt-3 mb-7 leading-7 text-zinc-600">
          {ru.auth.loginDescription}
        </p>
        <TelegramLoginButton />
      </section>
    </main>
  );
}
