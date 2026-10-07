"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
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
import { Check, ChefHat, Clock, Coffee, GripVertical } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  deriveOrderStatus,
  lineKitchenStatus,
  lineRound,
  listCloudOrders,
  listKitchenOrders,
  orderLines,
  updateKitchenLines,
  type CloudSaleLine,
  type CloudSaleOrder,
  type KitchenLineStatus,
} from "@/lib/cloud-sales";
import {
  SALE_ORDER_STATUS_LABELS,
} from "@/lib/tenant";
import { parseMenuDescription } from "@/lib/menu-details";
import {
  prepKindForItem,
  stationForKind,
  type PrepStation,
} from "@/lib/prep-station";
import { loadMenuResilient } from "@/lib/offline/resilient";
import { subscribeOrgOrderChanges } from "@/lib/realtime-orders";
import { cn, dayKey, formatMoney } from "@/lib/utils";

type MenuKitchenInfo = {
  note: string;
  prepMinutes: number | null;
  station: PrepStation;
};

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
  station: PrepStation;
  status: KitchenColumnStatus;
  lines: CloudSaleLine[];
  sentAt: string;
  addon: boolean;
};

function stationForLine(
  line: CloudSaleLine,
  menu: Map<string, MenuKitchenInfo>,
): PrepStation {
  if (line.menu_item_id) {
    const info = menu.get(line.menu_item_id);
    if (info) return info.station;
  }
  return "kitchen";
}

function columnStatus(
  group: CloudSaleLine[],
  fallback: CloudSaleOrder["status"],
): KitchenColumnStatus | null {
  const statuses = group.map((line) => lineKitchenStatus(line, fallback));
  if (statuses.every((status) => status === "served")) return null;
  if (statuses.some((status) => status === "placed")) return "placed";
  if (statuses.some((status) => status === "preparing")) return "preparing";
  return "ready";
}

function ticketsFor(
  order: CloudSaleOrder,
  menu: Map<string, MenuKitchenInfo>,
): KitchenTicket[] {
  const lines = orderLines(order);
  if (
    lines.length === 0 &&
    order.status !== "placed" &&
    order.status !== "preparing" &&
    order.status !== "ready"
  ) {
    return [];
  }
  const groups = new Map<string, CloudSaleLine[]>();
  for (const line of lines) {
    const round = lineRound(line);
    const station = stationForLine(line, menu);
    const key = `${round}::${station}`;
    groups.set(key, [...(groups.get(key) || []), line]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .flatMap(([key, group]) => {
      const [roundRaw, station] = key.split("::") as [string, PrepStation];
      const status = columnStatus(group, order.status);
      if (!status) return [];
      const round = Number(roundRaw);
      return [
        {
          key: `${order.id}::${round}::${station}`,
          order,
          round,
          station,
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
  const [lastServed, setLastServed] = useState<{
    receipt: string;
    station: string;
    total: number;
    items: number;
  } | null>(null);

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

  const reloadInFlight = useRef(false);
  useEffect(() => {
    if (!orgId) return;
    let stopped = false;
    const tick = () => {
      if (stopped || reloadInFlight.current) return;
      reloadInFlight.current = true;
      void reload().finally(() => {
        reloadInFlight.current = false;
      });
    };
    const unsub = subscribeOrgOrderChanges(orgId, tick);
    return () => {
      stopped = true;
      unsub();
    };
  }, [orgId, reload]);

  const [menuInfo, setMenuInfo] = useState<Map<string, MenuKitchenInfo>>(
    () => new Map(),
  );
  useEffect(() => {
    const apply = (
      menu: {
        id: string;
        description: string;
        tags?: string[] | null;
        category?: string | null;
      }[],
    ) => {
      const next = new Map<string, MenuKitchenInfo>();
      for (const item of menu) {
        const d = parseMenuDescription(item.description);
        next.set(item.id, {
          note: d.kitchenNote,
          prepMinutes: d.prepMinutes,
          station: stationForKind(
            prepKindForItem({ tags: item.tags, category: item.category }),
          ),
        });
      }
      setMenuInfo(next);
    };
    void loadMenuResilient(orgId, apply)
      .then(apply)
      .catch(() => undefined);
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

  const tickets = useMemo(
    () => orders.flatMap((order) => ticketsFor(order, menuInfo)),
    [orders, menuInfo],
  );

  async function moveTo(ticketKey: string, status: AdvanceStatus) {
    const ticket = tickets.find((item) => item.key === ticketKey);
    if (!ticket || ticket.status === status) return;

    const lineIds = ticket.lines
      .map((line) => line.id)
      .filter((id): id is string => Boolean(id));
    if (lineIds.length !== ticket.lines.length) {
      setError("Refresh the board, then try that ticket again.");
      return;
    }

    setBusyId(ticketKey);
    const kitchenStatus: KitchenLineStatus =
      status === "completed" ? "served" : status;
    setOrders((prev) =>
      prev.map((order): CloudSaleOrder => {
        if (order.id !== ticket.order.id) return order;
        const idSet = new Set(lineIds);
        const lines: CloudSaleLine[] = orderLines(order).map((line) =>
          line.id && idSet.has(line.id)
            ? { ...line, kitchen_status: kitchenStatus }
            : line,
        );
        return {
          ...order,
          sale_order_lines: lines,
          lines,
          status: deriveOrderStatus(lines, order.status),
        };
      }),
    );
    try {
      await updateKitchenLines(orgId, ticket.order.id, lineIds, kitchenStatus);
      if (status === "completed") {
        setLastServed({
          receipt: ticket.order.receipt_number,
          station: ticket.station === "barista" ? "barista" : "kitchen",
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

  const baristaTickets = tickets.filter((ticket) => ticket.station === "barista");
  const kitchenTickets = tickets.filter((ticket) => ticket.station === "kitchen");

  return (
    <MenuKitchenContext.Provider value={menuInfo}>
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink/60">
          Drinks show on the barista board. Food shows on the kitchen board.
          Anyone with the kitchen role updates both. A new send on an open
          table stays on the same bill.
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="shrink-0 rounded-xl border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium"
        >
          Refresh
        </button>
      </div>

      <p className="text-sm text-ink/55">
        Served today: {servedStats.items} items · {formatMoney(servedStats.total)}
      </p>

      {lastServed ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-teal/30 bg-teal/10 px-3 py-2 text-sm text-ink"
        >
          Served {lastServed.receipt} from the {lastServed.station}:{" "}
          {lastServed.items} item(s) · {formatMoney(lastServed.total)}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-coral/15 px-3 py-2 text-sm text-coral">
          {error}
        </p>
      ) : null}

      <StationBoard
        station="barista"
        title="Barista"
        blurb="Tea, coffee, and other drinks."
        tickets={baristaTickets}
        busyId={busyId}
        onMove={(key, status) => void moveTo(key, status)}
      />
      <StationBoard
        station="kitchen"
        title="Kitchen"
        blurb="Plates and other food."
        tickets={kitchenTickets}
        busyId={busyId}
        onMove={(key, status) => void moveTo(key, status)}
      />
    </div>
    </MenuKitchenContext.Provider>
  );
}

function StationBoard({
  station,
  title,
  blurb,
  tickets,
  busyId,
  onMove,
}: {
  station: PrepStation;
  title: string;
  blurb: string;
  tickets: KitchenTicket[];
  busyId: string | null;
  onMove: (ticketKey: string, status: AdvanceStatus) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );
  const activeTicket = tickets.find((ticket) => ticket.key === activeId) ?? null;
  const Icon = station === "barista" ? Coffee : ChefHat;

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const ticketKey = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;
    const prefix = `${station}:`;
    let target: AdvanceStatus | null = null;
    if (overId.startsWith(prefix) && COLUMN_IDS.has(overId.slice(prefix.length))) {
      target = overId.slice(prefix.length) as KitchenColumnStatus;
    } else {
      const overTicket = tickets.find((ticket) => ticket.key === overId);
      if (overTicket) target = overTicket.status;
    }
    if (!target) return;
    onMove(ticketKey, target);
  }

  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl">
            <Icon className="h-5 w-5 text-teal" />
            {title}
          </h2>
          <p className="text-sm text-ink/55">{blurb}</p>
        </div>
        <p className="text-xs text-ink/45">{tickets.length} open</p>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {COLUMNS.map((col) => (
            <KitchenColumn
              key={col.status}
              station={station}
              status={col.status}
              next={col.next}
              tickets={tickets.filter((ticket) => ticket.status === col.status)}
              busyId={busyId}
              activeId={activeId}
              onAdvance={(ticket) => onMove(ticket.key, col.next)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTicket ? (
            <div className="rotate-1 scale-[1.02] opacity-95 shadow-lg">
              <OrderCardBody ticket={activeTicket} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function KitchenColumn({
  station,
  status,
  next,
  tickets,
  busyId,
  activeId,
  onAdvance,
}: {
  station: PrepStation;
  status: KitchenColumnStatus;
  next: AdvanceStatus;
  tickets: KitchenTicket[];
  busyId: string | null;
  activeId: string | null;
  onAdvance: (ticket: KitchenTicket) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${station}:${status}` });

  return (
    <section
      ref={setNodeRef}
      aria-label={SALE_ORDER_STATUS_LABELS[status]}
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
          aria-label={`${nextLabel(next)} ${ticket.order.receipt_number}`}
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
