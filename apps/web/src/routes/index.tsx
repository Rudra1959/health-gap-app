import { Title } from "@solidjs/meta";
import Counter from "~/components/Counter";
import { ActionButton } from "~/components/button";

export default function Home() {
  return (
    <main class="">
      <Title>Hello World</Title>
      <h1 class="">Hello world!</h1>
      <Counter />
      <p>
        Visit{" "}
        <a href="https://start.solidjs.com" target="_blank">
          start.solidjs.com
        </a>{" "}
        to learn how to build SolidStart apps.
      </p>
       <ActionButton variant="orange">scan work on </ActionButton>
    </main>
  );
}
