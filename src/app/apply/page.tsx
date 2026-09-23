import { redirect } from "next/navigation";

/** Legacy apply form — signup + onboarding is the path now. */
export default function ApplyPage() {
  redirect("/signup");
}
