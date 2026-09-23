"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  deleteMenu,
  listInventory,
  listMenu,
  upsertMenu,
  type CloudInventoryItem,
  type CloudMenuItem,
} from "@/lib/cloud-catalog";
import { MENU_CATEGORIES, categoryLabel } from "@/lib/menu-categories";
import type { MenuCategory } from "@/lib/tenant";
import { cn, formatMoney } from "@/lib/utils";

export function MenuManager() {
  const { tenant } = useAuth();
  const orgId = tenant!.organization.id;
  const [menu, setMenu] = useState<CloudMenuItem[]>([]);
  const [inventory, setInventory] = useState<CloudInventoryItem[]>([]);
  const [filterCat, setFilterCat] = useState<MenuCategory | "all">("all");
  const [editing, setEditing] = useState<CloudMenuItem | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<MenuCategory>("hot-drinks");
  const [price, setPrice] = useState(0);
  const [available, setAvailable] = useState(true);
  const [description, setDescription] = useState("");
  const [recipe, setRecipe] = useState<
    { inventory_item_id: string; quantity_required: number }[]
  >([]);
  const [recipeInvId, setRecipeInvId] = useState("");
  const [recipeQty, setRecipeQty] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [m, i] = await Promise.all([listMenu(orgId), listInventory(orgId)]);
    setMenu(m);
    setInventory(i);
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    if (filterCat === "all") return menu;
    return menu.filter((m) => m.category === filterCat);
  }, [menu, filterCat]);

  function reset() {
    setEditing(null);
    setName("");
    setCategory("hot-drinks");
    setPrice(0);
    setAvailable(true);
    setDescription("");
    setRecipe([]);
  }

  function startEdit(item: CloudMenuItem) {
    setEditing(item);
    setName(item.name);
    setCategory(item.category);
    setPrice(item.price);
    setAvailable(item.available);
    setDescription(item.description || "");
    setRecipe(item.recipe || []);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await upsertMenu(orgId, {
      id: editing?.id,
      name,
      category,
      price: Number(price),
      available,
      description,
      recipe,
    });
    setMessage(editing ? "Updated" : "Added");
    reset();
    await reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip
          active={filterCat === "all"}
          label="All"
          onClick={() => setFilterCat("all")}
        />
        {MENU_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            active={filterCat === c.id}
            label={c.label}
            onClick={() => setFilterCat(c.id)}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <section className="rounded-3xl border border-ink/8 bg-white/80 p-4 sm:p-5">
          <h2 className="font-display text-xl">
            {editing ? "Edit item" : "Add menu item"}
          </h2>
          <form className="mt-4 space-y-3" onSubmit={(e) => void onSubmit(e)}>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Name *</span>
              <input
                required
                className="field"
                placeholder="e.g. Macchiato"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-ink/60">Category</span>
                <select
                  className="field"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as MenuCategory)}
                >
                  {MENU_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-ink/60">Price (ETB)</span>
                <input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  className="field"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-ink/60">Details</span>
              <textarea
                className="field min-h-24"
                placeholder="Ingredients, size, notes for staff…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={available}
                onChange={(e) => setAvailable(e.target.checked)}
              />
              Available on POS
            </label>
            <div className="rounded-2xl border border-ink/8 bg-stone/50 p-3">
              <p className="text-sm font-medium">Recipe → inventory</p>
              <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
                <select
                  className="field"
                  value={recipeInvId}
                  onChange={(e) => setRecipeInvId(e.target.value)}
                >
                  <option value="">Ingredient…</option>
                  {inventory.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  className="field w-24"
                  value={recipeQty || ""}
                  onChange={(e) => setRecipeQty(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="rounded-xl bg-ink px-3 text-stone"
                  onClick={() => {
                    if (!recipeInvId || recipeQty <= 0) return;
                    setRecipe((prev) => [
                      ...prev.filter((r) => r.inventory_item_id !== recipeInvId),
                      {
                        inventory_item_id: recipeInvId,
                        quantity_required: recipeQty,
                      },
                    ]);
                    setRecipeInvId("");
                    setRecipeQty(0);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {recipe.map((r) => {
                  const inv = inventory.find((i) => i.id === r.inventory_item_id);
                  return (
                    <li
                      key={r.inventory_item_id}
                      className="flex justify-between rounded-lg bg-white px-2 py-1"
                    >
                      <span>
                        {inv?.name} — {r.quantity_required}
                      </span>
                      <button
                        type="button"
                        className="text-coral"
                        onClick={() =>
                          setRecipe((p) =>
                            p.filter(
                              (x) => x.inventory_item_id !== r.inventory_item_id,
                            ),
                          )
                        }
                      >
                        remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-teal py-3 text-sm font-semibold text-white"
            >
              {editing ? "Save changes" : "Add to menu"}
            </button>
            {editing ? (
              <button
                type="button"
                onClick={reset}
                className="w-full text-sm text-teal underline"
              >
                Cancel edit
              </button>
            ) : null}
            {message ? (
              <p className="text-center text-sm text-teal">{message}</p>
            ) : null}
          </form>
        </section>

        <section className="rounded-3xl border border-ink/8 bg-white/80 p-4 sm:p-5">
          <h2 className="font-display text-xl">
            Menu ({filtered.length}
            {filterCat !== "all" ? ` · ${categoryLabel(filterCat)}` : ""})
          </h2>
          <ul className="mt-4 space-y-2">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start gap-2 rounded-2xl border border-ink/8 bg-stone/40 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.name}</p>
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/55">
                      {categoryLabel(item.category)}
                    </span>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-xs text-ink/60">{item.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink/55">
                    {formatMoney(item.price)} · {item.vote_count} sold ·{" "}
                    {item.available ? "available" : "hidden"}
                    {(item.recipe?.length || 0) > 0
                      ? ` · ${item.recipe!.length} ingredient(s)`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-ink/10 bg-white p-2"
                  onClick={() => startEdit(item)}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-coral/20 bg-coral/10 p-2 text-coral"
                  onClick={() => void deleteMenu(orgId, item.id).then(reload)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink/50">
                No items in this category yet.
              </p>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium transition",
        active ? "bg-teal text-white" : "bg-ink/5 text-ink/70 hover:bg-ink/10",
      )}
    >
      {label}
    </button>
  );
}
