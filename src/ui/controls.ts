import { el } from "./dom";

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  hint?: string;
  /** Defaults to trimming trailing zeros at a sensible precision. */
  format?: (v: number) => string;
  onInput: (value: number) => void;
}

function defaultFormat(step: number): (v: number) => string {
  const decimals = step >= 1 ? 0 : String(step).split(".")[1]?.length ?? 2;
  return (v) => v.toFixed(decimals);
}

export function slider(opts: SliderOptions): HTMLElement {
  const fmt = opts.format ?? defaultFormat(opts.step);
  const readout = el("span", { class: "readout", text: fmt(opts.value) });
  const input = el("input", {
    type: "range",
    min: String(opts.min),
    max: String(opts.max),
    step: String(opts.step),
    value: String(opts.value),
    oninput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      readout.textContent = fmt(v);
      opts.onInput(v);
    },
  });
  // Double-click a slider to snap it back to where it started.
  const initial = opts.value;
  input.addEventListener("dblclick", () => {
    input.value = String(initial);
    readout.textContent = fmt(initial);
    opts.onInput(initial);
  });

  return el("label", { class: "ctl" }, [
    el("span", { class: "ctl-head" }, [
      el("span", { class: "ctl-label", text: opts.label }),
      readout,
    ]),
    input,
    opts.hint ? el("span", { class: "ctl-hint", text: opts.hint }) : null,
  ]);
}

export interface SelectOptions<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function select<T extends string | number>(opts: SelectOptions<T>): HTMLElement {
  const node = el("select", {
    onchange: (e: Event) => {
      const raw = (e.target as HTMLSelectElement).value;
      const match = opts.options.find((o) => String(o.value) === raw);
      if (match) opts.onChange(match.value);
    },
  });
  for (const o of opts.options) {
    node.append(el("option", { value: String(o.value), text: o.label, selected: o.value === opts.value }));
  }
  return el("label", { class: "ctl ctl-row" }, [
    el("span", { class: "ctl-label", text: opts.label }),
    node,
  ]);
}

export function colorInput(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  return el("label", { class: "ctl ctl-row" }, [
    el("span", { class: "ctl-label", text: label }),
    el("input", {
      type: "color",
      value,
      oninput: (e: Event) => onChange((e.target as HTMLInputElement).value),
    }),
  ]);
}

export function section(title: string, children: HTMLElement[]): HTMLElement {
  return el("section", { class: "panel" }, [
    el("h2", { class: "panel-title", text: title }),
    ...children,
  ]);
}

export function button(label: string, onClick: () => void, cls = ""): HTMLButtonElement {
  return el("button", { class: `btn ${cls}`.trim(), type: "button", text: label, onclick: onClick });
}

export function checkbox(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  return el("label", { class: "ctl ctl-row ctl-check" }, [
    el("span", { class: "ctl-label", text: label }),
    el("input", {
      type: "checkbox",
      checked: value,
      onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
    }),
  ]);
}

export function textInput(
  label: string,
  value: string,
  onInput: (v: string) => void,
  placeholder = ""
): HTMLElement {
  return el("label", { class: "ctl" }, [
    el("span", { class: "ctl-head" }, [el("span", { class: "ctl-label", text: label })]),
    el("input", {
      class: "text-input",
      type: "text",
      value,
      placeholder,
      oninput: (e: Event) => onInput((e.target as HTMLInputElement).value),
    }),
  ]);
}

export function textArea(label: string, value: string, onInput: (v: string) => void): HTMLElement {
  return el("label", { class: "ctl" }, [
    el("span", { class: "ctl-head" }, [el("span", { class: "ctl-label", text: label })]),
    el("textarea", {
      class: "text-input",
      rows: 2,
      value,
      oninput: (e: Event) => onInput((e.target as HTMLTextAreaElement).value),
    }),
  ]);
}
