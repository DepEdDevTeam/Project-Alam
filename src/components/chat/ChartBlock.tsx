import { memo, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, ComposedChart, FunnelChart, Funnel, Treemap,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2, BarChart3 } from "lucide-react";

type Series = { key: string; label?: string; color?: string; stackId?: string };
export type ChartSpec = {
  type:
    | "bar" | "horizontal-bar" | "stacked-bar"
    | "line" | "area" | "pie" | "donut"
    | "radar" | "scatter" | "combo" | "funnel" | "treemap" | "map";
  title?: string;
  xKey?: string;
  series?: Series[];
  data: any[];
};

const PALETTE = [
  "hsl(217 91% 60%)", "hsl(45 93% 58%)", "hsl(142 71% 45%)",
  "hsl(0 84% 60%)", "hsl(280 70% 60%)", "hsl(190 80% 50%)",
  "hsl(25 95% 55%)", "hsl(330 75% 55%)",
];

const PH_REGION_COORDS: Record<string, { longitude: number; latitude: number }> = {
  ncr: { longitude: 121.02, latitude: 14.60 },
  car: { longitude: 121.00, latitude: 17.35 },
  "region i": { longitude: 120.52, latitude: 17.55 },
  "region ii": { longitude: 121.75, latitude: 17.50 },
  "region iii": { longitude: 120.75, latitude: 15.30 },
  "region iv-a": { longitude: 121.25, latitude: 14.10 },
  calabarzon: { longitude: 121.25, latitude: 14.10 },
  "region iv-b": { longitude: 120.25, latitude: 12.30 },
  mimaropa: { longitude: 120.25, latitude: 12.30 },
  "region v": { longitude: 123.55, latitude: 13.40 },
  "region vi": { longitude: 122.55, latitude: 10.75 },
  "region vii": { longitude: 123.85, latitude: 10.20 },
  "region viii": { longitude: 125.05, latitude: 11.25 },
  "region ix": { longitude: 122.50, latitude: 7.75 },
  "region x": { longitude: 124.75, latitude: 8.25 },
  "region xi": { longitude: 125.75, latitude: 7.10 },
  "region xii": { longitude: 124.75, latitude: 6.35 },
  "region xiii": { longitude: 125.75, latitude: 8.95 },
  caraga: { longitude: 125.75, latitude: 8.95 },
  nir: { longitude: 123.00, latitude: 10.05 },
  "negros island region": { longitude: 123.00, latitude: 10.05 },
  barmm: { longitude: 124.10, latitude: 6.25 },
  armm: { longitude: 124.10, latitude: 6.25 },
};

const normalizeRegion = (value: unknown) => String(value ?? "")
  .toLowerCase()
  .replace(/\b(region|rehiyon)\s+4a\b/, "region iv-a")
  .replace(/\bregion\s+([0-9]+)\b/g, (_, number) => `region ${["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii"][Number(number)] || number}`)
  .replace(/[^a-z0-9-]+/g, " ")
  .trim();

function ChartInner({ spec, height = 280 }: { spec: ChartSpec; height?: number }) {
  const { type, xKey = "name", series = [], data = [] } = spec;
  const seriesWithColor = useMemo(
    () => series.map((s, i) => ({ ...s, color: s.color || PALETTE[i % PALETTE.length] })),
    [series],
  );
  const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 };
  const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

  if (type === "map") {
    const valueKey = seriesWithColor[0]?.key || "value";
    const mapData = data.map((item) => {
      const coords = PH_REGION_COORDS[normalizeRegion(item[xKey])];
      return coords ? { ...item, ...coords, mapValue: Number(item[valueKey]) || 0 } : null;
    }).filter(Boolean) as any[];
    if (mapData.length === 0) {
      return <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">No recognized Philippine region names to plot.</div>;
    }
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 12, right: 20, bottom: 12, left: 20 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" opacity={0.35} />
          <XAxis type="number" dataKey="longitude" domain={[116, 127]} hide />
          <YAxis type="number" dataKey="latitude" domain={[4, 22]} hide />
          <ZAxis type="number" dataKey="mapValue" range={[90, 900]} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} formatter={(value: any) => Number(value).toLocaleString()} />
          <Scatter name={seriesWithColor[0]?.label || valueKey} data={mapData} fill={seriesWithColor[0]?.color || PALETTE[0]}>
            <LabelList dataKey={xKey} position="right" fill="hsl(var(--muted-foreground))" fontSize={10} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (type === "pie" || type === "donut") {
    const dataKey = seriesWithColor[0]?.key || "value";
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={dataKey} nameKey={xKey} cx="50%" cy="50%"
               outerRadius={Math.min(height / 2.6, 110)}
               innerRadius={type === "donut" ? Math.min(height / 4.5, 60) : 0}
               label={(e: any) => `${e[xKey]}`}>
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === "radar") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data}>
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis dataKey={xKey} tick={axisStyle} />
          <PolarRadiusAxis tick={axisStyle} />
          {seriesWithColor.map((s) => (
            <Radar key={s.key} name={s.label || s.key} dataKey={s.key} stroke={s.color} fill={s.color} fillOpacity={0.4} />
          ))}
          <Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} />
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  if (type === "scatter") {
    const yKey = seriesWithColor[0]?.key || "y";
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tick={axisStyle} type="number" />
          <YAxis dataKey={yKey} tick={axisStyle} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={data} fill={seriesWithColor[0]?.color || PALETTE[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (type === "funnel") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <FunnelChart>
          <Tooltip contentStyle={tooltipStyle} />
          <Funnel dataKey={seriesWithColor[0]?.key || "value"} data={data} isAnimationActive>
            <LabelList position="right" fill="hsl(var(--foreground))" stroke="none" dataKey={xKey} />
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    );
  }

  if (type === "treemap") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <Treemap data={data} dataKey={seriesWithColor[0]?.key || "value"} nameKey={xKey}
          stroke="hsl(var(--background))" fill={PALETTE[0]} />
      </ResponsiveContainer>
    );
  }

  if (type === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey={xKey} tick={axisStyle} /><YAxis tick={axisStyle} />
          <Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} />
          {seriesWithColor.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label || s.key} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (type === "area") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey={xKey} tick={axisStyle} /><YAxis tick={axisStyle} />
          <Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} />
          {seriesWithColor.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label || s.key} stroke={s.color} fill={s.color} fillOpacity={0.35} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (type === "combo") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey={xKey} tick={axisStyle} /><YAxis tick={axisStyle} />
          <Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} />
          {seriesWithColor.map((s, i) => i === 0
            ? <Bar key={s.key} dataKey={s.key} name={s.label || s.key} fill={s.color} />
            : <Line key={s.key} type="monotone" dataKey={s.key} name={s.label || s.key} stroke={s.color} strokeWidth={2} />)}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // bar / horizontal-bar / stacked-bar
  const horizontal = type === "horizontal-bar";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 60 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        {horizontal ? <>
          <XAxis type="number" tick={axisStyle} />
          <YAxis type="category" dataKey={xKey} tick={axisStyle} width={100} />
        </> : <>
          <XAxis dataKey={xKey} tick={axisStyle} />
          <YAxis tick={axisStyle} />
        </>}
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted) / 0.3)" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {seriesWithColor.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label || s.key} fill={s.color}
               stackId={type === "stacked-bar" ? (s.stackId || "stack") : undefined} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Tolerant parser — strips markdown fences, trailing commas, comments, smart quotes
function tryParseSpec(raw: string): ChartSpec | null {
  if (!raw) return null;
  let s = raw.trim();

  // Strip ```json / ```chart fences if present
  s = s.replace(/^```(?:json|chart)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Extract first {...} block if surrounded by prose
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first > 0 || last < s.length - 1) {
    if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  }

  const attempts = [
    s,
    // Remove // line comments and /* */ block comments
    s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""),
    // Remove trailing commas before ] or }
    s.replace(/,(\s*[}\]])/g, "$1"),
    // Remove thousands separators from unquoted JSON numbers: 4,322,000 -> 4322000
    s.replace(/(\d),(?=\d{3}\b)/g, "$1"),
    // Combined cleanup + smart-quote normalization + single→double quotes on keys
    s.replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,(\s*[}\]])/g, "$1")
      .replace(/(\d),(?=\d{3}\b)/g, "$1")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'"),
  ];

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && parsed.type) return parsed as ChartSpec;
    } catch { /* try next */ }
  }
  return null;
}

function ChartBlockImpl({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);

  const spec = useMemo<ChartSpec | null>(() => tryParseSpec(raw), [raw]);

  if (!spec) {
    // Render the raw content as a code block instead of a scary error
    return (
      <div className="my-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <BarChart3 className="h-3.5 w-3.5" />
          <span>Chart preview unavailable — showing raw data</span>
        </div>
        <pre className="overflow-x-auto text-[11px] text-muted-foreground whitespace-pre-wrap break-words">{raw}</pre>
      </div>
    );
  }
  if (!Array.isArray(spec.data) || spec.data.length === 0) {
    return <div className="my-3 p-4 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground">Chart has no data.</div>;
  }

  return (
    <div className="my-4 rounded-xl border border-border bg-card/50 p-3 not-prose">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <BarChart3 className="h-3.5 w-3.5 text-secondary" />
          {spec.title || "Chart"}
          <span className="text-muted-foreground font-normal">· {spec.type}</span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
              <Maximize2 className="h-3 w-3" /> Expand
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>{spec.title || "Chart"}</DialogTitle></DialogHeader>
            <div className="mt-2"><ChartInner spec={spec} height={380} /></div>
          </DialogContent>
        </Dialog>
      </div>
      <ChartInner spec={spec} />
    </div>
  );
}

const ChartBlock = memo(ChartBlockImpl);
export default ChartBlock;
