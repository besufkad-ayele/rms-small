import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, PolicySection } from "@/components/legal/InfoPage";
import { SITE } from "@/components/legal/site";

export const metadata: Metadata = {
  title: "Terms of use · Aramis Product",
  description:
    "The rules for using Aramis Product as the counter for a café or restaurant.",
};

export default function TermsPage() {
  return (
    <InfoPage
      current="/terms"
      eyebrow="Terms"
      title="Terms of use"
      lede={`These terms cover use of ${SITE.name}: the signed-in counter, the public menu, and the platform tools an Aramis administrator uses to approve a restaurant.`}
    >
      <PolicySection id="service" title="The service">
        <p>
          Aramis is software for taking orders, running a kitchen board, keeping
          a menu and inventory, recording staff, and closing the day’s money. The
          restaurant is responsible for its prices, tax figures, receipts, and
          what it sells. Aramis records what you enter.
        </p>
      </PolicySection>

      <PolicySection id="accounts" title="Accounts">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>The owner creates the business and invites staff with their own email and password.</li>
          <li>Keep passwords private. A shared password is still treated as that person’s actions on the receipts they sign.</li>
          <li>Staff sign-in is for people the owner added. Guests use the public menu, not a staff login.</li>
          <li>You must give a real email you can access. Aramis may refuse or close an account that was opened with false business details.</li>
        </ul>
      </PolicySection>

      <PolicySection id="trial" title="Trial and subscription">
        <p>
          A new restaurant starts with a trial whose length and package Aramis
          sets when approving the interest application. When the trial or a paid
          period ends, the counter pauses until the owner uploads payment proof
          and Aramis approves it. Staff then see a paused screen and must wait
          for the owner. Renewal is handled in Settings & Billing.
        </p>
      </PolicySection>

      <PolicySection id="data" title="Your business data">
        <p>
          Menu items, stock, sales, staff names, and receipt details you enter
          belong to the restaurant’s operation. You grant Aramis the right to
          host, back up, and display that data so the product can run — including
          on a device that is temporarily offline, and to a platform administrator
          reviewing onboarding or a payment.
        </p>
        <p>
          You are responsible for having the right to store staff and guest
          details you type in (for example a guest phone on a public-menu order).
          The{" "}
          <Link href="/privacy" className="font-medium text-teal underline">
            privacy & data policy
          </Link>{" "}
          describes what is stored and how deletion works.
        </p>
      </PolicySection>

      <PolicySection id="use" title="Acceptable use">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Use the counter for a real café or restaurant operation.</li>
          <li>Do not attempt to open another restaurant’s data, probe the service, or break access controls.</li>
          <li>Do not upload payment proofs or menu photos you do not have rights to use.</li>
          <li>Do not rely on the public menu to take card numbers. Guests pay at the restaurant.</li>
        </ul>
      </PolicySection>

      <PolicySection id="offline" title="Offline use">
        <p>
          When the connection is down or slow, sales and edits stay on that
          device and upload once the link is fast enough. Until that upload
          succeeds, the device is the only copy. Clearing the browser, uninstalling
          a half-synced device, or sharing that browser profile can lose or expose
          those tickets. Sync before you clear site data.
        </p>
      </PolicySection>

      <PolicySection id="availability" title="Availability">
        <p>
          The counter is built to keep taking orders through a bad connection, but
          cloud sign-in, payment approval, and sync need the network. Aramis may
          change screens, modules, or these terms. The date on this page is the
          version in force. If a change is not acceptable, stop using the service
          and ask the platform administrator about closing the account.
        </p>
      </PolicySection>
    </InfoPage>
  );
}
