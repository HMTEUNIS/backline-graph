"use client";

import type { ArtistField, Metric } from "@/lib/types";
import { METRICS, dayNumber, isoFromDay, wwRate } from "@/lib/types";

type Props = {
  field: ArtistField[];
  artistId: number | null;
  metric: Metric;
  asOf: string;
  minDate: string;
  maxDate: string;
  onArtist: (id: number | null) => void;
  onMetric: (metric: Metric) => void;
  onAsOf: (iso: string) => void;
};

function governingRate(artist: ArtistField, asOf: string, metric: Metric): { id: number; rate: string | null } | null {
  const node = artist.nodes
    .filter((item) => item.effectiveFrom <= asOf)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.contractId - a.contractId)[0];
  if (!node) return null;
  return { id: node.contractId, rate: wwRate(node, metric) };
}

export default function Controls(props: Props) {
  const names = props.field.slice().sort((a, b) => a.artist.stageName.localeCompare(b.artist.stageName));
  const visible = props.artistId === null ? props.field : props.field.filter((artist) => artist.artist.id === props.artistId);
  const rates = visible.flatMap((artist) => {
    const hit = governingRate(artist, props.asOf, props.metric);
    return hit?.rate == null ? [] : [Number(hit.rate)];
  });
  const selected = props.artistId === null ? null : props.field.find((artist) => artist.artist.id === props.artistId) ?? null;
  const one = selected ? governingRate(selected, props.asOf, props.metric) : null;
  const lo = rates.length ? Math.min(...rates) : null;
  const hi = rates.length ? Math.max(...rates) : null;
  return (
    <footer className="controls">
      <label>
        Artist
        <select
          value={props.artistId ?? ""}
          onChange={(event) => props.onArtist(event.target.value === "" ? null : Number(event.target.value))}
        >
          <option value="">All artists</option>
          {names.map((artist) => (
            <option key={artist.artist.id} value={artist.artist.id}>
              {artist.artist.stageName}
            </option>
          ))}
        </select>
      </label>
      <label className="grow">
        As of <span className="mono">{props.asOf}</span>
        <input
          type="range"
          min={dayNumber(props.minDate)}
          max={dayNumber(props.maxDate)}
          value={Math.min(dayNumber(props.maxDate), Math.max(dayNumber(props.minDate), dayNumber(props.asOf)))}
          onChange={(event) => props.onAsOf(isoFromDay(Number(event.target.value)))}
        />
      </label>
      <label>
        Height
        <select value={props.metric} onChange={(event) => props.onMetric(event.target.value as Metric)}>
          {METRICS.map((metric) => (
            <option key={metric.id} value={metric.id}>
              {metric.label} WW
            </option>
          ))}
        </select>
      </label>
      <p className="readout mono">
        {one
          ? `${selected?.artist.stageName ?? ""} · contract ${one.id} · ${one.rate ?? "no WW rate"}`
          : lo === null || hi === null
            ? "No WW rate on this date"
            : `${rates.length} artists · ${lo.toFixed(2)}–${hi.toFixed(2)}`}
      </p>
    </footer>
  );
}
