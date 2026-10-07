"use client";

import { useState } from "react";
import type { PlatformTenantRow } from "@/app/platform/actions";
import {
  updateAdminNotesAction,
  updateOrganizationAction,
  type OrgEditableField,
} from "@/app/platform/manage-actions";
import { ActionButton, AsyncForm, SubmitButton, throwIfError } from "./feedback";

const FIELDS: Array<{ key: OrgEditableField; label: string; type?: string }> = [
  { key: "name", label: "Business name" },
  { key: "phone", label: "Business phone", type: "tel" },
  { key: "email", label: "Business email", type: "email" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "region", label: "Region" },
  { key: "country", label: "Country" },
  { key: "tin", label: "TIN" },
  { key: "vat_number", label: "VAT number" },
  { key: "website", label: "Website", type: "url" },
];

export function OrgProfileEditor({
  row,
  flashOk,
  onReload,
  onDone,
}: {
  row: PlatformTenantRow;
  busy?: boolean;
  setBusy?: (v: boolean) => void;
  setError?: (v: string | null) => void;
  flashOk: (msg: string) => Promise<void>;
  onReload: () => Promise<void>;
  onDone: () => void;
}) {
  const org = row.organization;
  const orgId = String(org.id);
  const [notes, setNotes] = useState(String(org.admin_notes || ""));

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-teal/30 bg-teal/5 p-3">
      <AsyncForm
        className="space-y-3"
        onSubmitAsync={async (fd) => {
          const fields: Partial<Record<OrgEditableField, string>> = {
            org_type: String(fd.get("org_type") || "cafe"),
          };
          for (const f of FIELDS) fields[f.key] = String(fd.get(f.key) ?? "");
          const res = await updateOrganizationAction({ organizationId: orgId, fields });
          throwIfError(res, "Save failed");
          await flashOk("Restaurant details saved");
          await onReload();
          onDone();
        }}
      >
        <p className="text-xs font-semibold text-ink/60">Edit restaurant details</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-ink/55">
            Type
            <select
              name="org_type"
              className="field mt-1"
              defaultValue={String(org.org_type || "cafe")}
            >
              <option value="cafe">Café</option>
              <option value="restaurant">Restaurant</option>
              <option value="other">Other</option>
            </select>
          </label>
          {FIELDS.map((f) => (
            <label key={f.key} className="text-xs text-ink/55">
              {f.label}
              <input
                name={f.key}
                type={f.type || "text"}
                required={f.key === "name"}
                className="field mt-1"
                defaultValue={org[f.key] ? String(org[f.key]) : ""}
              />
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <SubmitButton
            pendingLabel="Saving…"
            className="rounded-xl bg-teal px-4 py-2 text-xs font-semibold text-white"
          >
            Save details
          </SubmitButton>
          <button
            type="button"
            onClick={onDone}
            className="rounded-xl border border-ink/15 px-4 py-2 text-xs font-semibold"
          >
            Cancel
          </button>
        </div>
      </AsyncForm>

      <div className="space-y-2 border-t border-ink/8 pt-3">
        <p className="text-xs font-semibold text-ink/60">Admin notes (full edit)</p>
        <textarea
          className="field min-h-28 font-mono text-xs"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes about this restaurant"
        />
        <div className="flex gap-2">
          <ActionButton
            pendingLabel="Saving…"
            className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone"
            onAction={async () => {
              const res = await updateAdminNotesAction({ organizationId: orgId, notes });
              throwIfError(res, "Save failed");
              await flashOk("Notes saved");
              await onReload();
            }}
          >
            Save notes
          </ActionButton>
          <button
            type="button"
            disabled={!notes}
            className="rounded-xl border border-coral/30 px-3 py-2 text-xs font-semibold text-coral disabled:opacity-40"
            onClick={() => setNotes("")}
          >
            Clear text
          </button>
        </div>
      </div>
    </div>
  );
}
