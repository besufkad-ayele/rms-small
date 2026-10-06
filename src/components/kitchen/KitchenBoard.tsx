"use client";

import {
  createContext,
  useCallback,
  useContext,
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
  lineKitchenStatus,
  lineRound,
  listCloudOrders,
  listKitchenOrders,
  orderLines,
  updateKitchenRound,
  updateOrderStatus,
  type CloudSaleLine,
  type CloudSaleOrder,
  type KitchenLineStatus,
} from "@/lib/cloud-sales";
import {
  SALE_ORDER_STATUS_LABELS,
} from "@/lib/tenant";
import { parseMenuDescription } from "@/lib/menu-details";
import { loadMenuResilient } from "@/lib/offline/resilient";
import { cn, dayKey, formatMoney } from "@/lib/utils";

type MenuKitchenInfo = { note: string; prepMinutes: number | null };

const MenuKitchenContext = createContext<Map<string, MenuKitchenInfo>>(
  new Map(),
);

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

type KitchenTicket = {
  key: string;
  order: CloudSaleOrder;
  round: number;
  status: KitchenColumnStatus;
  lines: CloudSaleLine[];
  sentAt: string;
  addon: boolean;
};

function ticketsFor(order: CloudSaleOrder): KitchenTicket[] {
  const lines = orderLines(order);
  const tracked = lines.some(
    (line) => line.kitchen_status || Number(line.round) > 1,
  );
  if (!tracked) {
    if (
      order.status !== "placed" &&
      order.status !== "preparing" &&
      order.status !== "ready"
    ) {
      return [];
    }
    return [
      {
        key: order.id,
        order,
        round: 1,
        status: order.status,
        lines,
        sentAt: order.created_at,
        addon: false,
      },
    ];
  }
  const byRound = new Map<number, CloudSaleLine[]>();
  for (const line of lines) {
    const round = lineRound(line);
    byRound.set(round, [...(byRound.get(round) || []), line]);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([round, group]) => {
      const status = lineKitchenStatus(group[0], order.status);
      if (status === "served") return [];
      return [
        {
          key: `${order.id}::${round}`,
          order,
          round,
          status,
          lines: group,
          sentAt: group.find((line) => line.sent_at)?.sent_at || order.created_at,
          addon: round > 1,
        },
      ];
    });
}

function waitMinutes(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function itemCount(lines: CloudSaleLine[]) {
  return lines.reduce((sum, line) => sum + Number(line.quantity), 0);
}

export function KitchenBoard() {
  const { tenant } = useAuth();
  const orgId = tenant!.organization.id;
  const [orders, setOrders] = useState<CloudSaleOrder[]>([]);
  const [servedToday, setServedToday] = useState<CloudSaleOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastServed, setLastServed] = useState<{
    receipt: string;
    total: number;
    items: number;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
  );

  const reload = useCallback(async () => {
    try {
      const [open, done] = await Promise.all([
        listKitchenOrders(orgId),
        listCloudOrders(orgId, {
          dayKey: dayKey(),
          statuses: ["completed"],
          limit: 200,
        }),
      ]);
      setOrders(open);
      setServedToday(done);
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

  const [menuInfo, setMenuInfo] = useState<Map<string, MenuKitchenInfo>>(
    () => new Map(),
  );
  useEffect(() => {
    const apply = (menu: { id: string; description: string }[]) => {
      const next = new Map<string, MenuKitchenInfo>();
      for (const item of menu) {
        const d = parseMenuDescription(item.description);
        if (d.kitchenNote || d.prepMinutes) {
          next.set(item.id, { note: d.kitchenNote, prepMinutes: d.prepMinutes });
        }
      }
      setMenuInfo(next);
    };
    void loadMenuResilient(orgId, apply).then(apply).catch(() => undefined);
  }, [orgId]);

  useEffect(() => {
    if (!lastServed) return;
    const t = window.setTimeout(() => setLastServed(null), 4500);
    return () => window.clearTimeout(t);
  }, [lastServed]);

  const servedStats = useMemo(() => {
    let items = 0;
    let total = 0;
    for (const o of servedToday) {
      total += Number(o.total) || 0;
      for (const l of o.sale_order_lines || o.lines || []) {
        items += Number(l.quantity) || 0;
      }
    }
    return {
      count: servedToday.length,
      items,
      total: Math.round(total * 100) / 100,
    };
  }, [servedToday]);

  const tickets = useMemo(() => orders.flatMap(ticketsFor), [orders]);

  const activeTicket = useMemo(
    () => tickets.find((ticket) => ticket.key === activeId) ?? null,
    [tickets, activeId],
  );

  const queueStats = useMemo(() => {
    const placed = tickets.filter((ticket) => ticket.status === "placed");
    const oldest = placed.reduce(
      (min, ticket) => Math.max(min, waitMinutes(ticket.sentAt)),
      0,
    );
    return {
      placed: placed.length,
      preparing: tickets.filter((ticket) => ticket.status === "preparing").length,
      ready: tickets.filter((ticket) => ticket.status === "ready").length,
      addons: tickets.filter((ticket) => ticket.addon).length,
      oldest,
    };
  }, [tickets]);

  async function moveTo(ticketKey: string, status: AdvanceStatus) {
    const ticket = tickets.find((item) => item.key === ticketKey);
    if (!ticket || ticket.status === status) return;

    setBusyId(ticketKey);
    const kitchenStatus: KitchenLineStatus =
      status === "completed" ? "served" : status;
    setOrders((prev) =>
      prev.map((order): CloudSaleOrder => {
        if (order.id !== ticket.order.id) return order;
        const lines: CloudSaleLine[] = orderLines(order).map((line) =>
          lineRound(line) === ticket.round
            ? { ...line, kitchen_status: kitchenStatus }
            : line,
        );
        const everyServed = lines.every(
          (line) => line.kitchen_status === "served",
        );
        return {
          ...order,
          sale_order_lines: lines,
          lines,
          status: ticket.key.includes("::")
            ? everyServed
              ? "completed"
              : order.status
            : status === "completed"
              ? "completed"
              : status,
        };
      }),
    );
    try {
      if (ticketKey.includes("::")) {
        await updateKitchenRound(orgId, ticket.order.id, ticket.round, kitchenStatus);
      } else {
        await updateOrderStatus(
          orgId,
          ticket.order.id,
          status === "completed" ? "completed" : status,
        );
      }
      if (status === "completed") {
        setLastServed({
          receipt: ticket.order.receipt_number,
          total: Number(ticket.order.total) || 0,
          items: itemCount(ticket.lines),
        });
      }
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
    const ticketKey = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;

    let target: AdvanceStatus | null = null;
    if (COLUMN_IDS.has(overId)) {
      target = overId as KitchenColumnStatus;
    } else {
      const overTicket = tickets.find((ticket) => ticket.key === overId);
      if (overTicket && COLUMN_IDS.has(overTicket.status)) {
        target = overTicket.status;
      }
    }
    if (!target) return;
    void moveTo(ticketKey, target);
  }

  return (
    <MenuKitchenContext.Provider value={menuInfo}>
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink/60">
          Each send is its own ticket. Adding food to a table keeps one bill,
          and the new dishes show up here as a fresh send.
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="shrink-0 rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-gold/30 bg-gold/15 px-3 py-2.5">
          <p className="text-[11px] text-ink/60">New sends</p>
          <p className="mt-0.5 font-display text-xl">{queueStats.placed}</p>
          <p className="text-[11px] text-ink/45">
            {queueStats.oldest > 0
              ? `Oldest waiting ${queueStats.oldest} min`
              : "Nothing waiting"}
          </p>
        </div>
        <div className="rounded-2xl border border-ink/8 bg-white/90 px-3 py-2.5">
          <p className="text-[11px] text-ink/50">Cooking</p>
          <p className="mt-0.5 font-display text-xl">{queueStats.preparing}</p>
          <p className="text-[11px] text-ink/45">
            {queueStats.addons} add-on{queueStats.addons === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl border border-teal/25 bg-teal/5 px-3 py-2.5">
          <p className="text-[11px] text-teal/80">Ready to serve</p>
          <p className="mt-0.5 font-display text-xl text-teal">
            {queueStats.ready}
          </p>
          <p className="text-[11px] text-ink/45">
            {servedStats.count} tickets out today
          </p>
        </div>
        <div className="rounded-2xl border border-ink/8 bg-white/90 px-3 py-2.5">
          <p className="text-[11px] text-ink/50">Served today</p>
          <p className="mt-0.5 font-display text-xl">
            {servedStats.items} items
          </p>
          <p className="text-[11px] text-ink/45">
            {formatMoney(servedStats.total)}
          </p>
        </div>
      </div>

      {lastServed ? (
        <p className="rounded-2xl border border-teal/30 bg-teal/10 px-3 py-2 text-sm text-ink">
          Served {lastServed.receipt}: {lastServed.items} item(s) ·{" "}
          {formatMoney(lastServed.total)} left the kitchen
        </p>
      ) : null}

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
            const list = tickets.filter((ticket) => ticket.status === col.status);
            return (
              <KitchenColumn
                key={col.status}
                status={col.status}
                next={col.next}
                tickets={list}
                busyId={busyId}
                activeId={activeId}
                onAdvance={(ticket) => void moveTo(ticket.key, col.next)}
              />
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTicket ? (
            <div className="rotate-1 scale-[1.02] opacity-95 shadow-lg">
              <OrderCardBody ticket={activeTicket} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
    </MenuKitchenContext.Provider>
  );
}

function KitchenColumn({
  status,
  next,
  tickets,
  busyId,
  activeId,
  onAdvance,
}: {
  status: KitchenColumnStatus;
  next: AdvanceStatus;
  tickets: KitchenTicket[];
  busyId: string | null;
  activeId: string | null;
  onAdvance: (ticket: KitchenTicket) => void;
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
          {tickets.length}
        </span>
      </h2>
      <ul className="mt-3 min-h-28 space-y-3">
        {tickets.map((ticket) => (
          <DraggableOrderCard
            key={ticket.key}
            ticket={ticket}
            next={next}
            busy={busyId === ticket.key}
            hidden={activeId === ticket.key}
            onAdvance={() => onAdvance(ticket)}
          />
        ))}
        {tickets.length === 0 ? (
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
  ticket,
  next,
  busy,
  hidden,
  onAdvance,
}: {
  ticket: KitchenTicket;
  next: AdvanceStatus;
  busy: boolean;
  hidden: boolean;
  onAdvance: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: ticket.key, disabled: busy });

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
          "rounded-2xl border bg-stone/50 p-3",
          ticket.addon ? "border-gold/50" : "border-ink/8",
          !busy && "cursor-grab active:cursor-grabbing",
        )}
        {...listeners}
        {...attributes}
      >
        <TicketFace ticket={ticket} />
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
  ticket,
  dragging,
}: {
  ticket: KitchenTicket;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-stone/50 p-3 shadow-lg",
        dragging && "border-teal/40 bg-white",
        !dragging && ticket.addon && "border-gold/50",
      )}
    >
      <TicketFace ticket={ticket} />
    </div>
  );
}

function TicketFace({ ticket }: { ticket: KitchenTicket }) {
  const waited = waitMinutes(ticket.sentAt);
  const menuInfo = useContext(MenuKitchenContext);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <GripVertical className="h-4 w-4 shrink-0 text-ink/35" />
            <p className="truncate font-display text-lg leading-tight">
              {ticket.order.place_label || ticket.order.receipt_number}
            </p>
          </div>
          <p className="mt-0.5 pl-6 text-xs text-ink/50">
            {ticket.order.receipt_number}
            {ticket.addon ? " · same bill" : ""}
          </p>
          <p
            className={cn(
              "mt-1 flex items-center gap-1 pl-6 text-[11px]",
              waited >= 15 ? "font-medium text-coral" : "text-ink/45",
            )}
          >
            <Clock className="h-3 w-3" />
            {waited === 0 ? "Just in" : `${waited} min`}
            {" · "}
            {ticket.addon ? `Add-on send ${ticket.round}` : "First send"}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-teal">
          {itemCount(ticket.lines)} items
        </p>
      </div>
      <ul className="mt-3 space-y-1">
        {ticket.lines.map((line, i) => {
          const info = line.menu_item_id
            ? menuInfo.get(line.menu_item_id)
            : undefined;
          return (
            <li key={i} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">
                  {line.quantity}× {line.name}
                </span>
                {info?.prepMinutes ? (
                  <span className="shrink-0 text-[11px] text-ink/45">
                    ~{info.prepMinutes} min
                  </span>
                ) : null}
              </div>
              {info?.note ? (
                <p className="text-[11px] text-ink/55">{info.note}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {ticket.order.kitchen_note ? (
        <p className="mt-2 rounded-xl bg-white/80 px-2.5 py-1.5 text-xs text-ink/70">
          {ticket.order.kitchen_note}
        </p>
      ) : null}
    </>
  );
}
