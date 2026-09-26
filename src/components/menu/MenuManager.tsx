"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { useOfflineSync } from "@/components/offline/OfflineSyncProvider";
import {
  type CloudInventoryItem,
  type CloudMenuItem,
} from "@/lib/cloud-catalog";
import {
  deleteMenuResilient,
  loadCatalogResilient,
  upsertMenuResilient,
} from "@/lib/offline/resilient";
import { MENU_CATEGORIES, categoryLabel } from "@/lib/menu-categories";
import {
  MENU_TAGS,
  normalizeTags,
  sortMenuByTags,
  tagLabel,
} from "@/lib/menu-tags";
import {
  MENU_IMAGE_MAX_BYTES,
  assertMenuImageSize,
  formatBytes,
  uploadMenuImage,
} from "@/lib/menu-image";
import type { MenuCategory } from "@/lib/tenant";
import { cn, formatMoney } from "@/lib/utils";

export function MenuManager() {
  const { tenant } = useAuth();
  const { refreshPendingCount } = useOfflineSync();
  const orgId = tenant!.organization.id;
  const [menu, setMenu] = useState<CloudMenuItem[]>([]);
  const [inventory, setInventory] = useState<CloudInventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | "all">("all");
  const [editing, setEditing] = useState<CloudMenuItem | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<MenuCategory>("hot-drinks");
  const [price, setPrice] = useState(0);
  const [available, setAvailable] = useState(true);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<
    { inventory_item_id: string; quantity_required: number }[]
  >([]);
  const [recipeInvId, setRecipeInvId] = useState("");
  const [recipeQty, setRecipeQty] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CloudMenuItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    const { menu: m, inventory: i } = await loadCatalogResilient(
      orgId,
      ({ menu, inventory }) => {
        setMenu(menu);
        setInventory(inventory);
      },
    );
    setMenu(m);
    setInventory(i);
  }, [orgId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = menu;
    if (tagFilter !== "all") {
      list = list.filter((m) => (m.tags || []).includes(tagFilter));
    }
    if (q) {
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          categoryLabel(m.category).toLowerCase().includes(q) ||
          (m.description || "").toLowerCase().includes(q) ||
          (m.tags || []).some(
            (t) =>
              t.includes(q) || tagLabel(t).toLowerCase().includes(q),
          ),
      );
    }
    return sortMenuByTags(list);
  }, [menu, search, tagFilter]);

  function reset() {
    setEditing(null);
    setName("");
    setCategory("hot-drinks");
    setPrice(0);
    setAvailable(true);
    setDescription("");
    setTags([]);
    setCustomTag("");
    setImageFile(null);
    setImagePreview(null);
    setRecipe([]);
  }

  function startEdit(item: CloudMenuItem) {
    setEditing(item);
    setName(item.name);
    setCategory(item.category);
    setPrice(item.price);
    setAvailable(item.available);
    setDescription(item.description || "");
    setTags(normalizeTags(item.tags));
    setRecipe(item.recipe || []);
    setImageFile(null);
    setImagePreview(item.image_url || null);
  }

  function toggleTag(id: string) {
    setTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  function addCustomTag() {
    const next = normalizeTags([customTag]);
    if (!next.length) return;
    setTags((prev) => normalizeTags([...prev, ...next]));
    setCustomTag("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const base = {
        id: editing?.id,
        name,
        category,
        price: Number(price),
        available,
        description,
        tags: normalizeTags(tags),
        recipe,
        image_url: editing?.image_url ?? null,
      };

      // Prefer direct cloud write when uploading a photo (need the item id).
      if (imageFile) {
        const { upsertMenu } = await import("@/lib/cloud-catalog");
        const menuId = await upsertMenu(orgId, base);
        try {
          const url = await uploadMenuImage(orgId, menuId, imageFile);
          if (url) {
            await upsertMenu(orgId, { ...base, id: menuId, image_url: url });
          }
        } catch {
          setMessage(
            "Item saved — photo upload failed (edit to retry). Other fields are fine.",
          );
          reset();
          await reload();
          return;
        }
        setMessage(editing ? "Updated" : "Added");
        reset();
        await reload();
        return;
      }

      const { offlineQueued } = await upsertMenuResilient(orgId, base);
      setMessage(
        offlineQueued
          ? editing
            ? "Saved offline — will sync"
            : "Added offline — will sync"
          : editing
            ? "Updated"
            : "Added",
      );
      reset();
      if (offlineQueued) await refreshPendingCount();
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const r = await deleteMenuResilient(orgId, deleteTarget.id);
      if (r.offlineQueued) await refreshPendingCount();
      setDeleteTarget(null);
      await reload();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
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

            <div>
              <p className="mb-1.5 text-sm text-ink/60">
                Tags{" "}
                <span className="text-ink/40">
                  (starters sort to the top · traditional, spicy, …)
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MENU_TAGS.map((t) => {
                  const on = tags.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium transition",
                        on
                          ? "bg-teal text-white"
                          : "bg-ink/5 text-ink/70 hover:bg-ink/10",
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className="field flex-1"
                  placeholder="Custom tag (e.g. house-favorite)"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomTag();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addCustomTag}
                  className="rounded-xl bg-ink px-3 text-sm text-stone"
                >
                  Add
                </button>
              </div>
              {tags.some((t) => !MENU_TAGS.some((p) => p.id === t)) ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tags
                    .filter((t) => !MENU_TAGS.some((p) => p.id === t))
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTag(t)}
                        className="rounded-full bg-gold/25 px-2.5 py-1 text-xs font-medium text-ink"
                      >
                        {tagLabel(t)} ×
                      </button>
                    ))}
                </div>
              ) : null}
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

            <div className="block text-sm">
              <span className="mb-1 block text-ink/60">
                Food photo{" "}
                <span className="text-ink/40">
                  (optional · WebP · max {formatBytes(MENU_IMAGE_MAX_BYTES)})
                </span>
              </span>
              <input
                type="file"
                accept="image/*"
                className="field file:mr-3 file:rounded-lg file:border-0 file:bg-ink/5 file:px-3 file:py-1.5"
                onChange={(e) => {
                  const input = e.target;
                  const file = input.files?.[0] || null;
                  if (!file) {
                    setImageFile(null);
                    if (!editing?.image_url) setImagePreview(null);
                    return;
                  }
                  try {
                    assertMenuImageSize(file);
                    setImageFile(file);
                    setImagePreview(URL.createObjectURL(file));
                    setMessage(null);
                  } catch (err) {
                    setImageFile(null);
                    setImagePreview(editing?.image_url || null);
                    input.value = "";
                    setMessage(
                      err instanceof Error ? err.message : "Photo too large",
                    );
                  }
                }}
              />
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagePreview}
                  alt=""
                  className="mt-2 h-28 w-28 rounded-2xl object-cover"
                />
              ) : null}
            </div>

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
                      {i.name} ({i.unit})
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
                        {inv?.name} — {r.quantity_required} {inv?.unit}
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
            <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-xl">
                Menu ({filtered.length}
                {search.trim() || tagFilter !== "all" ? ` · filtered` : ""})
              </h2>
              <input
                className="field sm:max-w-xs"
                placeholder="Search menu…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <SegmentedTabs
              size="sm"
              value={tagFilter}
              onChange={setTagFilter}
              tabs={[
                { id: "all" as const, label: "All tags" },
                ...MENU_TAGS.slice(0, 8).map((t) => ({
                  id: t.id as string,
                  label: t.label,
                })),
              ]}
            />
          </div>
          <ul className="mt-4 space-y-2">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start gap-2 rounded-2xl border border-ink/8 bg-stone/40 px-3 py-3"
              >
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.name}</p>
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/55">
                      {categoryLabel(item.category)}
                    </span>
                    {(item.tags || []).map((t) => (
                      <span
                        key={t}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          t === "starters"
                            ? "bg-teal/15 text-teal"
                            : t === "traditional"
                              ? "bg-gold/25 text-ink"
                              : "bg-ink/5 text-ink/60",
                        )}
                      >
                        {tagLabel(t)}
                      </span>
                    ))}
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
                  onClick={() => setDeleteTarget(item)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink/50">
                {menu.length === 0
                  ? "No menu items yet — add your first above."
                  : "No items match your search."}
              </p>
            ) : null}
          </ul>
        </section>
      </div>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget ? `Delete “${deleteTarget.name}”?` : "Delete permanently?"
        }
        message="This will be permanently deleted. Are you sure?"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
