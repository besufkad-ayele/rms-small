import type { Metadata } from "next";
import { InfoPage } from "@/components/legal/InfoPage";
import { FaqList, type FaqGroup } from "@/components/legal/FaqList";

export const metadata: Metadata = {
  title: "FAQ · Aramis Product",
  description:
    "Answers about sign-in, the trial, offline sales, privacy, cookies, and what to do when a page fails.",
};

const GROUPS: FaqGroup[] = [
  {
    title: "Getting started",
    items: [
      {
        q: "What is Aramis Product?",
        a: "It is the counter for a small café or restaurant: orders, kitchen, menu, inventory, staff, and finance. Owners request access with a package; Aramis enables the matching modules. Guests can order from a public menu link if that module is on.",
      },
      {
        q: "How do I sign in?",
        a: "Owners use the email and password Aramis sends after approving your interest application. Staff use the email and password from their invite. Open Sign in on the home page.",
        href: "/login",
        hrefLabel: "Go to sign in",
      },
      {
        q: "What is staff sign in?",
        a: "It is the same login, with wording for teammates. Use the email and password the owner created for you.",
        href: "/staff-login",
        hrefLabel: "Staff sign in",
      },
      {
        q: "How do I request access?",
        a: "Open Request access, fill in your business details, logo, and package — no password. Aramis reviews the application, starts your trial, and sends login credentials.",
        href: "/signup",
        hrefLabel: "Request access",
      },
    ],
  },
  {
    title: "Trial, billing, and access",
    items: [
      {
        q: "How long is the trial?",
        a: "Aramis sets the trial length when approving your application. The app shows how many days are left. Near the end it warns the owner to renew.",
      },
      {
        q: "What happens when access is paused?",
        a: "The owner is sent to Settings & Billing to upload a Telebirr / CBE / bank payment proof image. Staff cannot open the other areas until the owner renews and the proof is approved.",
      },
      {
        q: "Which payment methods can a sale use?",
        a: "A receipt can be marked cash, CBE, Telebirr, or other, with an optional reference. That records how the guest paid the restaurant. Aramis does not charge the guest’s card on the public menu — they pay at the restaurant.",
      },
    ],
  },
  {
    title: "Offline and errors",
    items: [
      {
        q: "Does the counter work offline?",
        a: "Yes. If the link is down or slow, sales and edits are saved on this device and upload automatically when the connection is fast enough. You can also press Sync now. A popup confirms when a pending batch has gone up.",
      },
      {
        q: "A page failed. Did I lose the sale?",
        a: "A failed page means that screen could not finish loading. Work already saved on this device stays in the on-device database until it syncs. Note the reference code on the error screen, try Reload, and if it continues, open Home or Sign in. Unsent tickets are lost only if this browser’s site data is cleared before they upload.",
        href: "/faq",
        hrefLabel: "You are on the FAQ",
      },
      {
        q: "What should I do on the error screen?",
        a: "Read the short explanation and copy the reference if one is shown. Reload once. If the app shell itself failed, the full-screen message still offers Reload, Sign in, and Create account. Then check the connection banner: Offline or Slow means you can keep working locally.",
      },
      {
        q: "How do I install it on a phone or computer?",
        a: "In the signed-in app, use Install app in the sidebar on desktop Chrome or Edge, or on Android. On iPhone or iPad, use Share, then Add to Home Screen.",
      },
    ],
  },
  {
    title: "Privacy and cookies",
    items: [
      {
        q: "Who can see my restaurant’s sales?",
        a: "People signed in to that restaurant, limited by their role. Another café on Aramis does not receive your menu or sales. Platform administrators can open a restaurant to review onboarding and payment proof.",
        href: "/privacy",
        hrefLabel: "Privacy & data policy",
      },
      {
        q: "What cookies do you use?",
        a: "Essential sign-in cookies, plus on-device storage for the theme, the cookie notice, offline sales, and the app shell. There are no advertising or analytics cookies.",
        href: "/cookies",
        hrefLabel: "Cookie policy",
      },
      {
        q: "Can I delete my data?",
        a: "Sign out to remove the session on this device. Clearing site data removes the offline database — sync first. Closing the restaurant’s cloud account is done by the Aramis platform administrator. A backup of deleted operational data, if one was kept, lasts 3 days.",
        href: "/privacy",
        hrefLabel: "How long data is kept",
      },
      {
        q: "What are the terms?",
        a: "They cover accounts, the 14-day trial, your responsibility for prices and tax, offline copies, and acceptable use of the counter.",
        href: "/terms",
        hrefLabel: "Terms of use",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <InfoPage
      current="/faq"
      eyebrow="Help"
      title="Frequently asked questions"
      lede="Short answers for owners, staff, and anyone who hit an error page. Open a question, or search."
    >
      <FaqList groups={GROUPS} />
    </InfoPage>
  );
}
