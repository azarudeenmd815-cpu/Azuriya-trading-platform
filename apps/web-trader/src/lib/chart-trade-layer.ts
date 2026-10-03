import {
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
} from "lightweight-charts";
export interface TradeLine {
  id: string;
  resourceId: string;
  kind: "ENTRY" | "ORDER" | "SL" | "TP";
  price: string;
  label: string;
  color: string;
  editable: boolean;
}
export interface TradeDrag {
  line: TradeLine;
  price: string;
}
/** Vendor-specific pointer/coordinate interaction is contained at the chart boundary. */
export class ChartTradeLayer {
  private entries = new Map<
    string,
    { value: TradeLine; line: IPriceLine; handle: HTMLButtonElement }
  >();
  private dragging?: TradeDrag;
  private frame = 0;
  private observer: ResizeObserver;
  constructor(
    private chart: IChartApi,
    private series: ISeriesApi<"Candlestick">,
    private container: HTMLElement,
    private digits: number,
    private tickSize: string,
    private onPreview: (drag?: TradeDrag) => void,
    private onDrop: (drag: TradeDrag) => void,
  ) {
    this.observer = new ResizeObserver(this.schedule);
    this.observer.observe(container);
    chart.timeScale().subscribeVisibleLogicalRangeChange(this.schedule);
    container.addEventListener("wheel", this.schedule, { passive: true });
    container.addEventListener("pointermove", this.move);
    container.addEventListener("pointerup", this.release);
    container.addEventListener("pointercancel", this.cancel);
  }
  setLines(values: TradeLine[]) {
    const ids = new Set(values.map((value) => value.id));
    for (const [id, entry] of this.entries)
      if (!ids.has(id)) {
        this.series.removePriceLine(entry.line);
        entry.handle.remove();
        this.entries.delete(id);
      }
    for (const value of values) {
      let entry = this.entries.get(value.id);
      if (!entry) {
        const line = this.series.createPriceLine({
          price: Number(value.price),
          color: value.color,
          lineWidth: 1,
          lineStyle:
            value.kind === "ENTRY" ? LineStyle.Solid : LineStyle.Dashed,
          axisLabelVisible: true,
          title: value.label,
        });
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "chart-trade-handle";
        handle.dataset.tradeId = value.id;
        handle.addEventListener("pointerdown", (event) =>
          this.start(event, value.id),
        );
        handle.addEventListener("keydown", (event) =>
          this.keyboard(event, value.id),
        );
        this.container.appendChild(handle);
        entry = { value, line, handle };
        this.entries.set(value.id, entry);
      }
      entry.value = value;
      const activePrice =
        this.dragging?.line.id === value.id ? this.dragging.price : value.price;
      entry.line.applyOptions({
        price: Number(activePrice),
        title: value.label,
        color: value.color,
      });
      entry.handle.textContent = `${value.label}  ⋮`;
      entry.handle.style.color = value.color;
      entry.handle.setAttribute(
        "aria-label",
        `Drag ${value.kind} ${value.resourceId.slice(0, 8)}; arrow keys adjust, Enter confirms`,
      );
      entry.handle.title = `${value.label}: ${value.price}. Drag to preview; release submits for server validation.`;
      entry.handle.disabled = !value.editable;
    }
    this.schedule();
  }
  private position = () => {
    this.frame = 0;
    for (const entry of this.entries.values()) {
      const price =
        this.dragging?.line.id === entry.value.id
          ? this.dragging.price
          : entry.value.price;
      const y = this.series.priceToCoordinate(Number(price));
      entry.handle.hidden =
        !entry.value.editable ||
        y === null ||
        y < 4 ||
        y > this.container.clientHeight - 28;
      if (y !== null) entry.handle.style.top = `${y - 10}px`;
    }
  };
  schedule = () => {
    if (!this.frame) this.frame = requestAnimationFrame(this.position);
  };
  private start(event: PointerEvent, id: string) {
    const entry = this.entries.get(id);
    if (!entry?.value.editable || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.dragging = { line: entry.value, price: entry.value.price };
    entry.handle.setPointerCapture(event.pointerId);
    this.chart.applyOptions({ handleScroll: false, handleScale: false });
    this.onPreview(this.dragging);
  }
  private preview(price: number) {
    if (!this.dragging || !Number.isFinite(price) || price <= 0) return;
    // Temporary visual snapping only. Server repeats tick-size and all trading validation.
    const value = (
      Math.round(price / Number(this.tickSize)) * Number(this.tickSize)
    ).toFixed(this.digits);
    this.dragging = { ...this.dragging, price: value };
    this.entries
      .get(this.dragging.line.id)
      ?.line.applyOptions({ price: Number(value), title: `PREVIEW ${value}` });
    this.onPreview(this.dragging);
    this.schedule();
  }
  private move = (event: PointerEvent) => {
    if (!this.dragging) {
      this.schedule();
      return;
    }
    event.preventDefault();
    const price = this.series.coordinateToPrice(
      event.clientY - this.container.getBoundingClientRect().top,
    );
    if (price !== null) this.preview(price);
  };
  private release = () => {
    const drag = this.dragging;
    if (!drag) return;
    this.restore();
    if (drag.price !== drag.line.price) this.onDrop(drag);
  };
  private cancel = () => this.restore();
  private restore() {
    const drag = this.dragging;
    this.dragging = undefined;
    if (drag)
      this.entries
        .get(drag.line.id)
        ?.line.applyOptions({
          price: Number(drag.line.price),
          title: drag.line.label,
        });
    this.chart.applyOptions({ handleScroll: true, handleScale: true });
    this.onPreview(undefined);
    this.schedule();
  }
  private keyboard(event: KeyboardEvent, id: string) {
    const entry = this.entries.get(id);
    if (!entry?.value.editable) return;
    if (event.key === "Escape") {
      this.restore();
      return;
    }
    if (event.key === "Enter" && this.dragging) {
      event.preventDefault();
      this.release();
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    this.dragging ||= { line: entry.value, price: entry.value.price };
    this.preview(
      Number(this.dragging.price) +
        (event.key === "ArrowUp" ? 1 : -1) * Number(this.tickSize),
    );
  }
  destroy() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.schedule);
    this.container.removeEventListener("wheel", this.schedule);
    this.container.removeEventListener("pointermove", this.move);
    this.container.removeEventListener("pointerup", this.release);
    this.container.removeEventListener("pointercancel", this.cancel);
    for (const entry of this.entries.values()) {
      this.series.removePriceLine(entry.line);
      entry.handle.remove();
    }
  }
}
