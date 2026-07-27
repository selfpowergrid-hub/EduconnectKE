import React, { useState, useEffect } from 'react';

// Shared print-tuning controls: a zoom stepper (scales the whole printout —
// the "fit it on one page" knob), a table font-size override, and a live
// estimate of how many A4 pages the current settings produce.

export const printCellFont = (font, autoPx) => (font === 'auto' ? autoPx : Number(font));

// Printable height of an A4 page in CSS px (96dpi, ~8–10mm margins).
const PAGE_H = { portrait: 1040, landscape: 715 };

// Live page estimate: measures the on-screen printable container and converts
// to printed pages under the chosen zoom + font. `screenZoom` is any CSS zoom
// already applied to the container on screen (so we can un-apply it), and
// `fontRatio` approximates how a font override changes content height.
export function usePageEstimate({ containerId, scale, font, autoPx = 11, landscape = false, screenZoom = 1, headerPx = 60, deps = [] }) {
  const [pages, setPages] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const el = document.getElementById(containerId);
      if (!el) { setPages(null); return; }
      const raw = el.scrollHeight / (screenZoom || 1);
      const fontRatio = font === 'auto' ? 1 : Math.max(0.5, Number(font) / autoPx);
      const printed = (raw * fontRatio + headerPx) * ((scale || 100) / 100);
      const pageH = landscape ? PAGE_H.landscape : PAGE_H.portrait;
      setPages(Math.max(1, Math.ceil(printed / pageH)));
    }, 120); // let the DOM settle after the change
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, scale, font, autoPx, landscape, screenZoom, headerPx, ...deps]);
  return pages;
}

// Grayscale filter string: apply to a print container (and preview) for a
// clean black-and-white output on mono printers. Slight contrast lift keeps
// grayed colour fills legible.
export const BW_FILTER = 'grayscale(1) contrast(1.05)';

const PrintSizer = ({ scale, setScale, font, setFont, pages, bw, setBw, autoLabel = 'Auto' }) => {
  const btn = { width: 28, height: '100%', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 800, color: '#1B6B3A' };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {setBw && (
        <button
          type="button"
          onClick={() => setBw(!bw)}
          title="Black & white — clearer on non-colour printers and saves colour ink"
          style={{
            height: 36, padding: '0 12px', borderRadius: 8,
            border: bw ? '1px solid #2a2421' : '1px solid #d1dee5',
            background: bw ? '#2a2421' : '#fff', color: bw ? '#fff' : '#4A4A6A',
            fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >◑ B&amp;W {bw ? 'ON' : ''}</button>
      )}
      <div title="Print scale — shrink to fit one page" style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1dee5', borderRadius: 8, height: 36, overflow: 'hidden', background: '#fff' }}>
        <button type="button" onClick={() => setScale(Math.max(50, (scale || 100) - 5))} style={btn}>−</button>
        <span style={{ width: 44, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#2a2421', borderLeft: '1px solid #eef2f5', borderRight: '1px solid #eef2f5', lineHeight: '36px' }}>{scale}%</span>
        <button type="button" onClick={() => setScale(Math.min(120, (scale || 100) + 5))} style={btn}>+</button>
      </div>
      {setFont && (
        <select
          title="Print font size"
          value={font}
          onChange={e => setFont(e.target.value)}
          style={{ height: 36, padding: '0 8px', borderRadius: 8, border: '1px solid #d1dee5', fontSize: 12, fontWeight: 700, background: '#fff', cursor: 'pointer', outline: 'none' }}
        >
          <option value="auto">{autoLabel}</option>
          {[6, 7, 8, 9, 10, 11, 12].map(px => <option key={px} value={px}>{px}px</option>)}
        </select>
      )}
      {pages != null && (
        <span
          title="Estimated A4 pages at the current print settings"
          style={{
            height: 36, display: 'inline-flex', alignItems: 'center', padding: '0 12px',
            borderRadius: 8, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
            background: pages === 1 ? '#E8F5EE' : '#FEF6E7',
            color: pages === 1 ? '#1B6B3A' : '#8A6A1F',
            border: pages === 1 ? '1px solid #cfe8d9' : '1px solid #F0D9B5',
          }}
        >
          📄 ≈ {pages} page{pages === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
};

export default PrintSizer;
