"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Camera, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { FieldLabel } from "@/components/ui/FieldLabel";
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
  EMPTY_MENU_DETAILS,
  MENU_ALLERGENS,
  MENU_SPICE_LEVELS,
  composeMenuDescription,
  isDetailTag,
  parseMenuDescription,
  type MenuDetails,
} from "@/lib/menu-details";
import {
  MENU_IMAGE_MAX_BYTES,
  assertMenuImageSize,
  formatBytes,
  uploadMenuImage,
} from "@/lib/menu-image";
import {
  optionalText,
  requireNumber,
  requireText,
} from "@/lib/form-sanitize";
import {
  PREP_CHOICES,
  prepKindForItem,
  withPrepKind,
  type PrepKind,
} from "@/lib/prep-station";
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
  const [details, setDetails] = useState<MenuDetails>(EMPTY_MENU_DETAILS);
  const [prep, setPrep] = useState<PrepKind | "">("");
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
    setDetails(EMPTY_MENU_DETAILS);
    setPrep("");
    setTags([]);
    setCustomTag("");
    setImageFile(null);
    setImagePreview(null);
    setRecipe([]);
  }

  function setDetail<K extends keyof MenuDetails>(key: K, value: MenuDetails[K]) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  function setSpice(id: string) {
    setTags((prev) => [
      ...prev.filter((t) => !t.startsWith("spice-")),
      ...(id ? [id] : []),
    ]);
  }

  function pickPhoto(input: HTMLInputElement) {
    const file = input.files?.[0] || null;
    input.value = "";
    if (!file) return;
    try {
      assertMenuImageSize(file);
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not use this photo");
    }
  }

  function clearPhoto() {
    setImageFile(null);
    setImagePreview(editing?.image_url || null);
  }

  function startEdit(item: CloudMenuItem) {
    setEditing(item);
    setName(item.name);
    setCategory(item.category);
    setPrice(item.price);
    setAvailable(item.available);
    setDetails(parseMenuDescription(item.description));
    setPrep(prepKindForItem(item));
    setTags(normalizeTags(item.tags).filter((tag) => tag !== "food" && tag !== "drink"));
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
    const next = normalizeTags([customTag]).filter(
      (tag) => tag !== "food" && tag !== "drink",
    );
    if (!next.length) return;
    setTags((prev) => normalizeTags([...prev, ...next]));
    setCustomTag("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (prep !== "food" && prep !== "drink") {
      setMessage(
        "Choose Food or Drink. Drinks go to the barista. Food goes to the kitchen.",
      );
      return;
    }
    let cleanName = "";
    let cleanPrice = 0;
    try {
      cleanName = requireText("Name", name, 80);
      cleanPrice = requireNumber("Price", Number(price), { min: 0 });
      if (
        details.prepMinutes != null &&
        (!Number.isFinite(details.prepMinutes) || details.prepMinutes < 0)
      ) {
        throw new Error("Prep time must be zero or more.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Check the form and try again.");
      return;
    }
    const cleanDetails = {
      ...details,
      summary: optionalText(details.summary, 400),
      ingredients: optionalText(details.ingredients, 300),
      portion: optionalText(details.portion, 80),
      kitchenNote: optionalText(details.kitchenNote, 200),
    };
    try {
      const base = {
        id: editing?.id,
        name: cleanName,
        category,
        price: cleanPrice,
        available,
        description: composeMenuDescription(cleanDetails),
        tags: withPrepKind(normalizeTags(tags), prep),
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
        } catch (err) {
          setMessage(
            `Item saved, but the photo did not upload${
              err instanceof Error ? ` (${err.message})` : ""
            }. Edit the item to try again.`,
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
              <FieldLabel required>Name</FieldLabel>
              <input
                required
                className="field"
                placeholder="e.g. Macchiato"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div>
              <FieldLabel required>Goes to</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {PREP_CHOICES.map((choice) => {
                  const on = prep === choice.id;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => setPrep(choice.id)}
                      className={cn(
                        "rounded-2xl border px-3 py-2.5 text-left text-sm",
                        on
                          ? "border-teal bg-teal/10"
                          : "border-ink/10 bg-white hover:bg-ink/5",
                      )}
                    >
                      <span className="font-medium">{choice.label}</span>
                      <span className="mt-0.5 block text-xs text-ink/55">
                        {choice.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <FieldLabel required>Category</FieldLabel>
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
                <FieldLabel required>Price (ETB)</FieldLabel>
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
              <FieldLabel>Tags</FieldLabel>
              <p className="-mt-1 mb-1.5 text-xs text-ink/40">
                Starters sort to the top. Food and Drink are chosen above.
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
              {tags.some(
                (t) => !isDetailTag(t) && !MENU_TAGS.some((p) => p.id === t),
              ) ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tags
                    .filter(
                      (t) =>
                        !isDetailTag(t) && !MENU_TAGS.some((p) => p.id === t),
                    )
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
              <FieldLabel>Description for customers</FieldLabel>
              <textarea
                className="field min-h-20"
                placeholder="What it is, how it tastes, what comes with it"
                value={details.summary}
                onChange={(e) => setDetail("summary", e.target.value)}
              />
            </label>

            <label className="block text-sm">
              <FieldLabel>Ingredients</FieldLabel>
              <input
                className="field"
                placeholder="e.g. pasta, tomato, onion, garlic, basil"
                value={details.ingredients}
                onChange={(e) => setDetail("ingredients", e.target.value)}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <FieldLabel>Portion / size</FieldLabel>
                <input
                  className="field"
                  placeholder="e.g. 1 plate, 250 ml"
                  value={details.portion}
                  onChange={(e) => setDetail("portion", e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <FieldLabel>Prep time (min)</FieldLabel>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="field"
                  placeholder="e.g. 12"
                  value={details.prepMinutes ?? ""}
                  onChange={(e) =>
                    setDetail(
                      "prepMinutes",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </label>
            </div>

            <div>
              <FieldLabel>Allergens</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {MENU_ALLERGENS.map((a) => {
                  const on = tags.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleTag(a.id)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium transition",
                        on
                          ? "bg-coral text-white"
                          : "bg-ink/5 text-ink/70 hover:bg-ink/10",
                      )}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <FieldLabel>Spice level</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {MENU_SPICE_LEVELS.map((s) => {
                  const current =
                    tags.find((t) => t.startsWith("spice-")) ?? "";
                  const on = current === s.id;
                  return (
                    <button
                      key={s.id || "none"}
                      type="button"
                      onClick={() => setSpice(s.id)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium transition",
                        on
                          ? "bg-gold text-ink"
                          : "bg-ink/5 text-ink/70 hover:bg-ink/10",
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block text-sm">
              <FieldLabel>Kitchen note</FieldLabel>
              <p className="-mt-1 mb-1 text-xs text-ink/40">
                Staff only, shown on tickets
              </p>
              <input
                className="field"
                placeholder="e.g. Plate warm, add basil on top"
                value={details.kitchenNote}
                onChange={(e) => setDetail("kitchenNote", e.target.value)}
              />
            </label>

            <div className="block text-sm">
              <FieldLabel>Food photo</FieldLabel>
              <p className="-mt-1 mb-1 text-xs text-ink/40">
                Saved as WebP under {formatBytes(MENU_IMAGE_MAX_BYTES)}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink/20 bg-white px-3 py-2.5 text-xs font-medium text-ink/70">
                  <Camera className="h-4 w-4" />
                  Take photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => pickPhoto(e.target)}
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink/20 bg-white px-3 py-2.5 text-xs font-medium text-ink/70">
                  <ImagePlus className="h-4 w-4" />
                  Choose from library
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => pickPhoto(e.target)}
                  />
                </label>
              </div>
              {imagePreview ? (
                <div className="relative mt-2 w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt=""
                    className="h-32 w-32 rounded-2xl object-cover"
                  />
                  {imageFile ? (
                    <button
                      type="button"
                      onClick={clearPhoto}
                      aria-label="Remove new photo"
                      className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
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
              <FieldLabel className="font-medium text-ink">
                Recipe → inventory
              </FieldLabel>
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
              <p
                className={cn(
                  "text-center text-sm",
                  /^(Updated|Added|Saved offline)/.test(message) ||
                    message.startsWith("Item saved")
                    ? "text-teal"
                    : "text-coral",
                )}
              >
                {message}
              </p>
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
                    <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-medium text-teal">
                      {prepKindForItem(item) === "drink" ? "Barista" : "Kitchen"}
                    </span>
                    {(item.tags || [])
                      .filter((t) => t !== "food" && t !== "drink")
                      .map((t) => (
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
                  <MenuItemDetails description={item.description} />
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

function MenuItemDetails({ description }: { description: string }) {
  const d = parseMenuDescription(description);
  const facts = [
    d.portion,
    d.prepMinutes ? `${d.prepMinutes} min prep` : "",
  ].filter(Boolean);
  if (!d.summary && !d.ingredients && !facts.length && !d.kitchenNote) {
    return null;
  }
  return (
    <div className="mt-1 space-y-0.5 text-xs text-ink/60">
      {d.summary ? <p>{d.summary}</p> : null}
      {d.ingredients ? <p>Ingredients: {d.ingredients}</p> : null}
      {facts.length ? <p>{facts.join(" · ")}</p> : null}
      {d.kitchenNote ? <p className="text-ink/45">Kitchen: {d.kitchenNote}</p> : null}
    </div>
  );
}
