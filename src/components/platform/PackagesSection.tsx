"use client";

import { useState } from "react";
import {
  setPackageActiveAction,
  updateAddonAction,
  updateModulePriceAction,
  upsertPackageAction,
} from "@/app/platform/actions";
import { deletePackageAction } from "@/app/platform/manage-actions";
import {
  includedSeatsFromFlags,
  packageModuleFlags,
  type AddonRow,
  type ModulePriceRow,
  type PackageRow,
} from "@/lib/pricing";
import { formatMoney } from "@/lib/utils";
import {
  ModuleCheckboxes,
  ModuleChips,
  StatusPill,
  type ModuleState,
} from "./platform-ui";
import { ActionButton, AsyncForm, SubmitButton, throwIfError } from "./feedback";

export function PackagesSection({
  packages,
  modulePrices,
  addons = [],
  onSaved,
}: {
  packages: PackageRow[];
  modulePrices: ModulePriceRow[];
  addons?: AddonRow[];
  busy?: boolean;
  setBusy?: (v: boolean) => void;
  setError?: (v: string | null) => void;
  onSaved: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <h2 className="font-display text-xl">À-la-carte modules</h2>
        <p className="text-sm text-ink/55">
          Monthly ETB when cafés pick modules one by one. The six in-house
          modules total 4,500. Adding Website & public ordering makes 5,500.
        </p>
        <div className="mt-4 grid gap-3">
          {modulePrices.map((m) => (
            <AsyncForm
              key={m.module_code}
              className="grid gap-2 rounded-2xl bg-stone/40 p-3 sm:grid-cols-[1fr_120px_80px_auto] sm:items-end"
              onSubmitAsync={async (fd) => {
                const res = await updateModulePriceAction({
                  moduleCode: m.module_code,
                  label: String(fd.get("label") || m.label),
                  description: String(fd.get("description") || ""),
                  monthlyPriceEtb: Number(fd.get("price") || 0),
                  active: fd.get("active") === "on",
                });
                throwIfError(res, "Save failed");
                await onSaved();
              }}
            >
              <div>
                <label className="text-[11px] text-ink/50">Label</label>
                <input
                  name="label"
                  className="field mt-1"
                  defaultValue={m.label}
                />
                <input
                  name="description"
                  className="field mt-1"
                  defaultValue={m.description || ""}
                  placeholder="Description"
                />
              </div>
              <label className="block text-sm">
                <span className="text-[11px] text-ink/50">ETB / mo</span>
                <input
                  name="price"
                  type="number"
                  min={0}
                  step="1"
                  className="field mt-1"
                  defaultValue={Number(m.monthly_price_etb)}
                />
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={m.active}
                />
                Active
              </label>
              <SubmitButton
                pendingLabel="Saving…"
                className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone"
              >
                Save
              </SubmitButton>
            </AsyncForm>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <h2 className="font-display text-xl">One-time add-ons</h2>
        <p className="text-sm text-ink/55">
          Data insertion, extra training, and extra staff seats. Extra seats
          are charged once per additional seat beyond 1 included per module.
        </p>
        <div className="mt-4 grid gap-3">
          {addons.map((a) => (
            <AsyncForm
              key={a.code}
              className="grid gap-2 rounded-2xl bg-stone/40 p-3 sm:grid-cols-[1fr_120px_80px_auto] sm:items-end"
              onSubmitAsync={async (fd) => {
                const res = await updateAddonAction({
                  code: a.code,
                  name: String(fd.get("name") || a.name),
                  description: String(fd.get("description") || ""),
                  priceEtb: Number(fd.get("price") || 0),
                  active: fd.get("active") === "on",
                });
                throwIfError(res, "Save failed");
                await onSaved();
              }}
            >
              <div>
                <label className="text-[11px] text-ink/50">Name</label>
                <input
                  name="name"
                  className="field mt-1"
                  defaultValue={a.name}
                />
                <input
                  name="description"
                  className="field mt-1"
                  defaultValue={a.description || ""}
                  placeholder="Description"
                />
              </div>
              <label className="block text-sm">
                <span className="text-[11px] text-ink/50">ETB one-time</span>
                <input
                  name="price"
                  type="number"
                  min={0}
                  step="1"
                  className="field mt-1"
                  defaultValue={Number(a.price_etb)}
                />
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={a.active}
                />
                Active
              </label>
              <SubmitButton
                pendingLabel="Saving…"
                className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone"
              >
                Save
              </SubmitButton>
            </AsyncForm>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl">Packages</h2>
            <p className="text-sm text-ink/55">
              Starter 2,500 (with kitchen) · Intermediate 3,500 (no kitchen)
              · Full 4,500 (kitchen, no website) · Website bundle 3,000.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingId("new")}
            className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
          >
            New package
          </button>
        </div>

        {editingId === "new" ? (
          <PackageEditor
            onCancel={() => setEditingId(null)}
            onSave={async (input) => {
              const res = await upsertPackageAction(input);
              throwIfError(res, "Save failed");
              setEditingId(null);
              await onSaved();
            }}
          />
        ) : null}

        <div className="mt-4 grid gap-3">
          {packages.map((pkg) =>
            editingId === pkg.id ? (
              <PackageEditor
                key={pkg.id}
                initial={pkg}
                onCancel={() => setEditingId(null)}
                onSave={async (input) => {
                  const res = await upsertPackageAction({
                    ...input,
                    id: pkg.id,
                  });
                  throwIfError(res, "Save failed");
                  setEditingId(null);
                  await onSaved();
                }}
              />
            ) : (
              <article
                key={pkg.id}
                className="rounded-2xl border border-ink/8 bg-stone/30 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg">{pkg.name}</h3>
                    <p className="text-xs text-ink/45">
                      code: {pkg.code} ·{" "}
                      {formatMoney(Number(pkg.monthly_price_etb))}/mo ·{" "}
                      {includedSeatsFromFlags(packageModuleFlags(pkg))} seats
                      included
                    </p>
                    <p className="mt-1 text-sm text-ink/60">
                      {pkg.description || "—"}
                    </p>
                    <div className="mt-2">
                      <ModuleChips flags={packageModuleFlags(pkg)} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill
                      status={pkg.active ? "active" : "inactive"}
                      tone={pkg.active ? "teal" : "ink"}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-ink/12 px-2 py-1 text-xs"
                      onClick={() => setEditingId(pkg.id)}
                    >
                      Edit
                    </button>
                    <ActionButton
                      pendingLabel="Updating…"
                      className="rounded-lg border border-ink/12 px-2 py-1 text-xs"
                      onAction={async () => {
                        const res = await setPackageActiveAction({
                          packageId: pkg.id,
                          active: !pkg.active,
                        });
                        throwIfError(res, "Update failed");
                        await onSaved();
                      }}
                    >
                      {pkg.active ? "Deactivate" : "Activate"}
                    </ActionButton>
                    <ActionButton
                      pendingLabel="Deleting…"
                      className="rounded-lg border border-coral/30 px-2 py-1 text-xs text-coral"
                      onAction={async () => {
                        if (
                          !window.confirm(
                            `Delete package "${pkg.name}" permanently? Cafés can no longer pick it.`,
                          )
                        )
                          return;
                        const res = await deletePackageAction(pkg.id);
                        throwIfError(res, "Delete failed");
                        await onSaved();
                      }}
                    >
                      Delete
                    </ActionButton>
                  </div>
                </div>
              </article>
            ),
          )}
          {packages.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink/45">
              No packages yet — apply the migration seed or create one.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function PackageEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial?: PackageRow;
  busy?: boolean;
  onCancel: () => void;
  onSave: (input: {
    code: string;
    name: string;
    description?: string;
    monthlyPriceEtb: number;
    menuEnabled: boolean;
    orderingEnabled: boolean;
    kitchenEnabled: boolean;
    inventoryEnabled: boolean;
    financeEnabled: boolean;
    hrEnabled: boolean;
    onlineEnabled: boolean;
    maxStaffSeats: number;
    active: boolean;
    sortOrder?: number;
  }) => Promise<void>;
}) {
  const defaults = initial
    ? packageModuleFlags(initial)
    : {
        menu: true,
        ordering: true,
        kitchen: true,
        inventory: false,
        finance: false,
        hr: false,
        online: false,
      };
  const [mods, setMods] = useState<ModuleState>(defaults);
  const included = includedSeatsFromFlags(mods);

  return (
    <AsyncForm
      className="mt-3 space-y-3 rounded-2xl border border-teal/30 bg-teal/5 p-4"
      onSubmitAsync={async (fd) => {
        await onSave({
          code: String(fd.get("code") || initial?.code || ""),
          name: String(fd.get("name") || ""),
          description: String(fd.get("description") || ""),
          monthlyPriceEtb: Number(fd.get("price") || 0),
          menuEnabled: mods.menu,
          orderingEnabled: mods.ordering,
          kitchenEnabled: mods.kitchen,
          inventoryEnabled: mods.inventory,
          financeEnabled: mods.finance,
          hrEnabled: mods.hr,
          onlineEnabled: mods.online,
          maxStaffSeats: included,
          active: fd.get("active") === "on",
          sortOrder: Number(fd.get("sort") || 0),
        });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="text-[11px] text-ink/50">Code</span>
          <input
            name="code"
            required
            className="field mt-1"
            defaultValue={initial?.code || ""}
            readOnly={Boolean(initial)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[11px] text-ink/50">Name</span>
          <input
            name="name"
            required
            className="field mt-1"
            defaultValue={initial?.name || ""}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[11px] text-ink/50">ETB / mo</span>
          <input
            name="price"
            type="number"
            min={0}
            className="field mt-1"
            defaultValue={Number(initial?.monthly_price_etb || 0)}
          />
        </label>
      </div>
      <p className="text-xs text-ink/50">
        {included} staff seat{included === 1 ? "" : "s"} included (1 per
        selected module). Extra seats are a one-time add-on, not part of the
        monthly package.
      </p>
      <input
        name="description"
        className="field"
        placeholder="Description"
        defaultValue={initial?.description || ""}
      />
      <ModuleCheckboxes value={mods} onChange={setMods} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            name="active"
            type="checkbox"
            defaultChecked={initial?.active ?? true}
          />
          Active
        </label>
        <input
          name="sort"
          type="number"
          className="field w-24"
          defaultValue={initial?.sort_order ?? 0}
          title="Sort order"
        />
        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
        >
          Save package
        </SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-ink/12 px-3 py-2 text-xs"
        >
          Cancel
        </button>
      </div>
    </AsyncForm>
  );
}
