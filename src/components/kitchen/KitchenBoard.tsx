"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChefHat, Clock, GripVertical } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  listKitchenOrders,
  updateOrderStatus,
  type CloudSaleOrder,
} from "@/lib/cloud-sales";
import {
  SALE_ORDER_STATUS_LABELS,
  type SaleOrderStatus,
} from "@/lib/tenant";
import { cn, formatMoney } from "@/lib/utils";

type KitchenColumnStatus = "placed" | "preparing" | "ready";
type AdvanceStatus = KitchenColumnStatus | "completed";

const COLUMNS: {
  status: KitchenColumnStatus;
  next: AdvanceStatus;
}[] = [
  { status: "placed", next: "preparing" },
  { status: "preparing", next: "ready" },
  { status: "ready", next: "completed" },
];

const COLUMN_IDS = new Set<string>(COLUMNS.map((c) => c.status));

function nextLabel(next: AdvanceStatus) {
  if (next === "preparing") return "Start prep";
  if (next === "ready") return "Mark ready";
  return "Mark served";
}

export function KitchenBoard() {
  const { tenant } = useAuth();
  const orgId = tenant!.organization.id;
  const [orders, setOrders] = useState<CloudSaleOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
  );

  const reload = useCallback(async () => {
    try {
      setOrders(await listKitchenOrders(orgId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load kitchen queue");
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 12_000);
    return () => window.clearInterval(t);
  }, [reload]);

  const activeOrder = useMemo(
    () => orders.find((o) => o.id === activeId) ?? null,
    [orders, activeId],
  );

  async function moveTo(orderId: string, status: AdvanceStatus) {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === status) return;

    setBusyId(orderId);
    // Optimistic: completed leaves the board; else move column.
    setOrders((prev) =>
      status === "completed"
        ? prev.filter((o) => o.id !== orderId)
        : prev.map((o) =>
            o.id === orderId
              ? { ...o, status: status as SaleOrderStatus }
              : o,
          ),
    );
    try {
      await updateOrderStatus(orgId, orderId, status);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const orderId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;

    let target: AdvanceStatus | null = null;
    if (COLUMN_IDS.has(overId)) {
      target = overId as KitchenColumnStatus;
    } else {
      const overOrder = orders.find((o) => o.id === overId);
      if (overOrder && COLUMN_IDS.has(overOrder.status)) {
        target = overOrder.status as KitchenColumnStatus;
      }
    }
    if (!target) return;
    void moveTo(orderId, target);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink/60">
          Drag tickets between columns, or use the button — advance when prep
          starts and when food is ready.
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="shrink-0 rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium"
        >
          Refresh
        </button>
      </div>
      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = orders.filter((o) => o.status === col.status);
            return (
              <KitchenColumn
                key={col.status}
                status={col.status}
                next={col.next}
                orders={list}
                busyId={busyId}
                activeId={activeId}
                onAdvance={(order) => void moveTo(order.id, col.next)}
              />
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeOrder ? (
            <div className="rotate-1 scale-[1.02] opacity-95 shadow-lg">
              <OrderCardBody order={activeOrder} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KitchenColumn({
  status,
  next,
  orders,
  busyId,
  activeId,
  onAdvance,
}: {
  status: KitchenColumnStatus;
  next: AdvanceStatus;
  orders: CloudSaleOrder[];
  busyId: string | null;
  activeId: string | null;
  onAdvance: (order: CloudSaleOrder) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "rounded-3xl border bg-white/80 p-3 transition sm:p-4",
        isOver
          ? "border-teal bg-teal/5 ring-2 ring-teal/30"
          : "border-ink/8",
      )}
    >
      <h2 className="flex items-center gap-2 font-display text-lg">
        <ChefHat className="h-4 w-4 text-teal" />
        {SALE_ORDER_STATUS_LABELS[status]}
        <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink/50">
          {orders.length}
        </span>
      </h2>
      <ul className="mt-3 min-h-28 space-y-3">
        {orders.map((order) => (
          <DraggableOrderCard
            key={order.id}
            order={order}
            next={next}
            busy={busyId === order.id}
            hidden={activeId === order.id}
            onAdvance={() => onAdvance(order)}
          />
        ))}
        {orders.length === 0 ? (
          <p
            className={cn(
              "rounded-2xl border border-dashed py-8 text-center text-sm",
              isOver
                ? "border-teal/40 text-teal"
                : "border-ink/10 text-ink/40",
            )}
          >
            {isOver ? "Drop here" : "Empty — drop a ticket"}
          </p>
        ) : null}
      </ul>
    </section>
  );
}

function DraggableOrderCard({
  order,
  next,
  busy,
  hidden,
  onAdvance,
}: {
  order: CloudSaleOrder;
  next: AdvanceStatus;
  busy: boolean;
  hidden: boolean;
  onAdvance: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: order.id, disabled: busy });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "touch-none",
        hidden || isDragging ? "opacity-30" : "opacity-100",
      )}
    >
      <div
        className={cn(
          "rounded-2xl border border-ink/8 bg-stone/50 p-3",
          !busy && "cursor-grab active:cursor-grabbing",
        )}
        {...listeners}
        {...attributes}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <GripVertical className="h-4 w-4 shrink-0 text-ink/35" />
              <p className="truncate font-medium">{order.receipt_number}</p>
            </div>
            {order.place_label ? (
              <p className="mt-0.5 pl-6 text-xs text-teal">
                Place: {order.place_label}
              </p>
            ) : null}
            <p className="mt-0.5 flex items-center gap-1 pl-6 text-[11px] text-ink/45">
              <Clock className="h-3 w-3" />
              {new Date(order.created_at).toLocaleTimeString()}
            </p>
          </div>
          <p className="shrink-0 text-sm text-teal">
            {formatMoney(order.total)}
          </p>
        </div>
        <ul className="mt-2 space-y-0.5 text-sm">
          {(order.sale_order_lines || order.lines || []).map((l, i) => (
            <li key={i}>
              {l.quantity}× {l.name}
            </li>
          ))}
        </ul>
        {order.kitchen_note ? (
          <p className="mt-2 text-xs text-ink/55">Note: {order.kitchen_note}</p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAdvance();
          }}
          className={cn(
            "mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-50",
            next === "completed" ? "bg-ink" : "bg-teal",
          )}
        >
          <Check className="h-3.5 w-3.5" />
          {nextLabel(next)}
        </button>
      </div>
    </li>
  );
}

function OrderCardBody({
  order,
  dragging,
}: {
  order: CloudSaleOrder;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-ink/8 bg-stone/50 p-3 shadow-lg",
        dragging && "border-teal/40 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <GripVertical className="h-4 w-4 text-ink/35" />
            <p className="truncate font-medium">{order.receipt_number}</p>
          </div>
          {order.place_label ? (
            <p className="mt-0.5 pl-6 text-xs text-teal">
              Place: {order.place_label}
            </p>
          ) : null}
          <p className="mt-0.5 flex items-center gap-1 pl-6 text-[11px] text-ink/45">
            <Clock className="h-3 w-3" />
            {new Date(order.created_at).toLocaleTimeString()}
          </p>
        </div>
        <p className="shrink-0 text-sm text-teal">
          {formatMoney(order.total)}
        </p>
      </div>
      <ul className="mt-2 space-y-0.5 text-sm">
        {(order.sale_order_lines || order.lines || []).map((l, i) => (
          <li key={i}>
            {l.quantity}× {l.name}
          </li>
        ))}
      </ul>
      {order.kitchen_note ? (
        <p className="mt-2 text-xs text-ink/55">Note: {order.kitchen_note}</p>
      ) : null}
    </div>
  );
}
