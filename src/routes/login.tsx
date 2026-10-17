import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/AuthForm";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — JobGenesis" },
      { name: "description", content: "Log in to your JobGenesis account." },
      { property: "og:title", content: "Log in — JobGenesis" },
      { property: "og:description", content: "Log in to your JobGenesis account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AuthForm mode="login" />,
});
