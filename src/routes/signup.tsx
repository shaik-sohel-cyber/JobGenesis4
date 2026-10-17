import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/components/AuthForm";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your account — JobGenesis" },
      {
        name: "description",
        content: "Create a JobGenesis account and turn your resume into a structured profile.",
      },
      { property: "og:title", content: "Create your account — JobGenesis" },
      {
        property: "og:description",
        content: "Create a JobGenesis account and turn your resume into a structured profile.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AuthForm mode="signup" />,
});
