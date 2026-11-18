"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import ChatPanel from "@/components/ChatPanel";
import Controls from "@/components/Controls";
import NodeDetail from "@/components/NodeDetail";
import { loadContractField } from "@/lib/graphql";
import type { ArtistField, Metric } from "@/lib/types";
import { contractLabel, wwRate } from "@/lib/types";

const ContractField = dynamic(() => import("@/components/ContractField"), { ssr: false });

export default function Studio() {
  const [field, setField] = useState<ArtistField[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artistId, setArtistId] = useState<number | null>(null);
  const [metric, setMetric] = useState<Metric>("streaming");
  const [asOf, setAsOf] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [citedIds, setCitedIds] = useState<number[]>([]);
  const [hoverId, setHoverId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadContractField()
      .then((rows) => {
        if (cancelled) return;
        setField(rows);
        const dates = rows.flatMap((artist) => artist.nodes.map((node) => node.effectiveFrom));
        const latest = dates.reduce((max, date) => (date > max ? date : max), dates[0] ?? "2026-01-01");
        setAsOf((current) => current ?? latest);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bounds = useMemo(() => {
    const dates = (field ?? []).flatMap((artist) => artist.nodes.map((node) => node.effectiveFrom));
    return {
      min: dates.reduce((min, date) => (date < min ? date : min), dates[0] ?? "2020-01-01"),
      max: dates.reduce((max, date) => (date > max ? date : max), dates[0] ?? "2026-01-01"),
    };
  }, [field]);

  const selected = useMemo(() => {
    if (!field || selectedId === null) return null;
    for (const artist of field) {
      const node = artist.nodes.find((item) => item.contractId === selectedId);
      if (!node) continue;
      const edge = artist.edges.find((item) => item.toContractId === selectedId) ?? null;
      return { artist, node, edge };
    }
    return null;
  }, [field, selectedId]);

  const hover = useMemo(() => {
    if (!field || hoverId === null) return null;
    for (const artist of field) {
      const node = artist.nodes.find((item) => item.contractId === hoverId);
      if (node) return { name: artist.artist.stageName, node };
    }
    return null;
  }, [field, hoverId]);

  const contracts = field?.reduce((sum, artist) => sum + artist.nodes.length, 0) ?? 0;
  const amendments = field?.reduce((sum, artist) => sum + artist.edges.length, 0) ?? 0;

  function focus(contractId: number) {
    setSelectedId(contractId);
    setCitedIds((current) => (current.includes(contractId) ? current : [...current, contractId]));
    if (artistId !== null && field) {
      const owner = field.find((artist) => artist.nodes.some((node) => node.contractId === contractId));
      if (owner && owner.artist.id !== artistId) setArtistId(null);
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="kicker">Backline</p>
          <h1>Graph</h1>
        </div>
        <p className="top-note">Deterministic field over label.*. The chat is a pointer back to it.</p>
        <p className="mono counts">
          {field ? `${field.length} artists · ${contracts} contracts · ${amendments} amendments` : "Connecting…"}
        </p>
      </header>
      <div className="main">
        <div className="stage">
          {error ? <div className="stage-message">{error}</div> : null}
          {!error && !field ? <div className="stage-message">Loading the contract field…</div> : null}
          {field && asOf ? (
            <ContractField
              field={field}
              metric={metric}
              artistId={artistId}
              asOf={asOf}
              selectedId={selectedId}
              citedIds={citedIds}
              onSelect={setSelectedId}
              onHover={setHoverId}
            />
          ) : null}
          <div className="legend">
            <span><i className="swatch base" /> Base</span>
            <span><i className="swatch amendment" /> Amendment</span>
            <span><i className="swatch up" /> Rate up</span>
            <span><i className="swatch down" /> Rate down</span>
            <span className="axis">X time · height rate · depth artist</span>
          </div>
          {hover ? (
            <p className="hover-readout mono">
              {hover.name} · {contractLabel(hover.node)} · {hover.node.effectiveFrom} · {wwRate(hover.node, metric) ?? "no WW rate"}
            </p>
          ) : null}
          {selected ? (
            <NodeDetail
              node={selected.node}
              artistName={selected.artist.artist.stageName}
              edge={selected.edge}
              metric={metric}
              onClose={() => setSelectedId(null)}
            />
          ) : null}
        </div>
        <ChatPanel
          field={field ?? []}
          metric={metric}
          onMetric={setMetric}
          onCitations={setCitedIds}
          onFocus={focus}
        />
      </div>
      {field && asOf ? (
        <Controls
          field={field}
          artistId={artistId}
          metric={metric}
          asOf={asOf}
          minDate={bounds.min}
          maxDate={bounds.max}
          onArtist={setArtistId}
          onMetric={setMetric}
          onAsOf={setAsOf}
        />
      ) : (
        <footer className="controls" />
      )}
    </div>
  );
}
