"use client";

import { useState } from "react";
import {
  setPackageActiveAction,
  updateModulePriceAction,
  upsertPackageAction,
} from "@/app/platform/actions";
import {
  packageModuleFlags,
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

export function PackagesSection({
  packages,
  modulePrices,
  busy,
  setBusy,
  setError,
  onSaved,
}: {
  packages: PackageRow[];
  modulePrices: ModulePriceRow[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  onSaved: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <h2 className="font-display text-xl">À-la-carte modules</h2>
        <p className="text-sm text-ink/55">
          Monthly ETB prices when cafés pick modules individually.
        </p>
        <div className="mt-4 grid gap-3">
          {modulePrices.map((m) => (
            <form
              key={m.module_code}
              className="grid gap-2 rounded-2xl bg-stone/40 p-3 sm:grid-cols-[1fr_120px_80px_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void (async () => {
                  setBusy(true);
                  const res = await updateModulePriceAction({
                    moduleCode: m.module_code,
                    label: String(fd.get("label") || m.label),
                    description: String(fd.get("description") || ""),
                    monthlyPriceEtb: Number(fd.get("price") || 0),
                    active: fd.get("active") === "on",
                  });
                  setBusy(false);
                  if ("error" in res) {
                    setError(String(res.error ?? "Save failed"));
                    return;
                  }
                  await onSaved();
                })();
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
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-stone"
              >
                Save
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-ink/8 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl">Packages</h2>
            <p className="text-sm text-ink/55">
              Named bundles — usually discounted vs summing modules.
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
            busy={busy}
            onCancel={() => setEditingId(null)}
            onSave={async (input) => {
              setBusy(true);
              const res = await upsertPackageAction(input);
              setBusy(false);
              if ("error" in res) {
                setError(String(res.error ?? "Save failed"));
                return;
              }
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
                busy={busy}
                onCancel={() => setEditingId(null)}
                onSave={async (input) => {
                  setBusy(true);
                  const res = await upsertPackageAction({
                    ...input,
                    id: pkg.id,
                  });
                  setBusy(false);
                  if ("error" in res) {
                    setError(String(res.error ?? "Save failed"));
                    return;
                  }
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
                      {pkg.max_staff_seats} seats
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
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-lg border border-ink/12 px-2 py-1 text-xs"
                      onClick={() => {
                        void (async () => {
                          setBusy(true);
                          const res = await setPackageActiveAction({
                            packageId: pkg.id,
                            active: !pkg.active,
                          });
                          setBusy(false);
                          if ("error" in res) {
                            setError(String(res.error ?? "Update failed"));
                            return;
                          }
                          await onSaved();
                        })();
                      }}
                    >
                      {pkg.active ? "Deactivate" : "Activate"}
                    </button>
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
  busy,
  onCancel,
  onSave,
}: {
  initial?: PackageRow;
  busy: boolean;
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
        kitchen: false,
        inventory: false,
        finance: false,
        hr: false,
      };
  const [mods, setMods] = useState<ModuleState>(defaults);

  return (
    <form
      className="mt-3 space-y-3 rounded-2xl border border-teal/30 bg-teal/5 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void onSave({
          code: String(fd.get("code") || ""),
          name: String(fd.get("name") || ""),
          description: String(fd.get("description") || ""),
          monthlyPriceEtb: Number(fd.get("price") || 0),
          menuEnabled: mods.menu,
          orderingEnabled: mods.ordering,
          kitchenEnabled: mods.kitchen,
          inventoryEnabled: mods.inventory,
          financeEnabled: mods.finance,
          hrEnabled: mods.hr,
          maxStaffSeats: Number(fd.get("seats") || 2),
          active: fd.get("active") === "on",
          sortOrder: Number(fd.get("sort") || 0),
        });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="text-[11px] text-ink/50">Code</span>
          <input
            name="code"
            required
            className="field mt-1"
            defaultValue={initial?.code || ""}
            disabled={Boolean(initial)}
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
        <label className="block text-sm">
          <span className="text-[11px] text-ink/50">Staff seats</span>
          <input
            name="seats"
            type="number"
            min={0}
            className="field mt-1"
            defaultValue={initial?.max_staff_seats ?? 2}
          />
        </label>
      </div>
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
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-teal px-3 py-2 text-xs font-semibold text-white"
        >
          Save package
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-ink/12 px-3 py-2 text-xs"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
