import { Title } from "@solidjs/meta";
import { ActionButton } from "~/components/button";

export default function About() {
  return (
    <main>
      <Title>About</Title>
      <h1>About</h1>
      <h1 class="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
        Tailwind is Working!
      </h1>
      <p class="mt-4 text-lg text-slate-300">
        If you see a large gradient title on a dark background, your setup is
        perfect.
      </p>
      <ActionButton variant="orange" class="font-extralight">
        scan work on{" "}
      </ActionButton>
    </main>
  );
}
