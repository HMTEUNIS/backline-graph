"use client";

import { useEffect, useState } from "react";

import { sourceHref } from "@/lib/source-path";
import type { ArtistField, FieldNode, Metric } from "@/lib/types";
import { contractLabel, wwRate } from "@/lib/types";
import { METRICS } from "@/lib/types";

type Props = {
  node: FieldNode;
  artistName: string;
  edge: ArtistField["edges"][number] | null;
  metric: Metric;
  onClose: () => void;
};

function SourceView({ sourcePath, title }: { sourcePath: string | null; title: string }) {
  const href = sourcePath ? sourceHref(sourcePath) : null;
  const [state, setState] = useState<"absent" | "loading" | "ready" | "missing">(href ? "loading" : "absent");

  useEffect(() => {
    if (!href) return;
    let cancelled = false;
    setState("loading");
    fetch(href, { method: "HEAD" })
      .then((response) => {
        if (!cancelled) setState(response.ok ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [href]);

  if (!sourcePath || !href) {
    return <p className="note">No primary source is stored for this contract.</p>;
  }
  return (
    <figure className="source">
      <figcaption>
        <span>Primary source</span>
        <a className="text-button" href={href} target="_blank" rel="noreferrer">
          Open PDF
        </a>
      </figcaption>
      {state === "ready" ? <iframe title={title} src={href} /> : null}
      {state === "loading" ? <p className="note">Loading the PDF…</p> : null}
      {state === "missing" ? (
        <p className="note">
          The database has <span className="mono">{sourcePath}</span>, and this app does not have that file. Import
          Patchbay&apos;s documents folder.
        </p>
      ) : null}
      <p className="path mono">{sourcePath}</p>
    </figure>
  );
}

export default function NodeDetail({ node, artistName, edge, metric, onClose }: Props) {
  const rate = wwRate(node, metric);
  const href = node.sourcePath ? sourceHref(node.sourcePath) : null;
  return (
    <aside className={`detail${href ? " has-source" : ""}`}>
      <header className="detail-head">
        <div>
          <p className="kicker">{artistName}</p>
          <h2 className="mono">{contractLabel(node)}</h2>
        </div>
        <button type="button" className="text-button" onClick={onClose}>
          Close
        </button>
      </header>
      <dl className="facts">
        <div>
          <dt>Contract</dt>
          <dd className="mono">{node.contractId}</dd>
        </div>
        <div>
          <dt>Kind</dt>
          <dd>{node.kind === "BASE" ? "Base" : "Amendment"}</dd>
        </div>
        <div>
          <dt>Effective</dt>
          <dd className="mono">
            {node.effectiveFrom}
            {node.effectiveTo ? ` → ${node.effectiveTo}` : ""}
          </dd>
        </div>
        <div>
          <dt>{METRICS.find((item) => item.id === metric)?.label} WW</dt>
          <dd className="mono">{rate ?? "—"}</dd>
        </div>
      </dl>
      {edge ? (
        <p className="note">
          Supersedes <span className="mono">{edge.fromContractId}</span>. Replaces {edge.replacedSections.join(", ")}.
          {edge.rateDelta === null ? "" : ` Streaming WW change ${edge.rateDelta > 0 ? "+" : ""}${edge.rateDelta.toFixed(4)}.`}
        </p>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Revenue</th>
            <th>Territory</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {node.rates.map((entry) => (
            <tr key={`${entry.revenueType}-${entry.territory}`}>
              <td>{entry.revenueType}</td>
              <td className="mono">{entry.territory}</td>
              <td className="mono num">{entry.rate}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SourceView sourcePath={node.sourcePath} title={`Primary source for ${contractLabel(node)}`} />
      <p className="path mono">{node.docPath}</p>
      <details>
        <summary>label.contract_terms</summary>
        <pre className="mono">{node.rawTerms}</pre>
      </details>
    </aside>
  );
}
