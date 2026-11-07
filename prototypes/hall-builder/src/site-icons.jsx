import React from 'react';

// Paths copied from the current staging hall StudioIcon and shared AccountIcon.
// Keep this local snapshot isolated from production component dependencies.
const fallback = {
    ticket: <><path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z"/><path d="M9 5v14" strokeDasharray="2 3"/></>,
    rows: <><path d="M3 6h18M3 12h18M3 18h18"/><path d="M6 3v5m6-5v5m6-5v5M6 10v4m6-4v4m6-4v4M6 16v5m6-5v5m6-5v5"/></>,
    round: <><circle cx="12" cy="12" r="5"/><path d="M10 2h4m-4 20h4M2 10v4m20-4v4M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>,
    rect: <><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M8 2h2m4 0h2M8 22h2m4 0h2M2 8v2m0 4v2M22 8v2m0 4v2"/></>,
    standing: <><path d="M3 7 12 3l9 4v10l-9 4-9-4V7Z"/><circle cx="12" cy="10" r="2"/><path d="M8 17v-1a4 4 0 0 1 8 0v1"/></>,
    stage: <><rect x="3" y="10" width="18" height="10" rx="2"/><path d="M3 14h18M8 10V4m8 6V4M7 4h2m6 0h2"/></>,
    plus: <path d="M12 4v16M4 12h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>, check: <path d="m5 12 4 4L19 6"/>, back: <path d="m10 5-7 7 7 7M3 12h18"/>, arrow: <path d="m14 6 6 6-6 6M4 12h16"/>,
    undo: <><path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7"/></>, redo: <><path d="m16 4 5 5-5 5M21 9H11a7 7 0 0 0-7 7"/></>, minus: <path d="M5 12h14"/>, fit: <><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/></>,
    cursor: <path d="m5 3 14 10-7 1-3 6L5 3Z"/>, hand: <><path d="M7 12V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v10a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-4-6a2 2 0 0 1 3-2l1 1Z"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>, search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>, save: <><path d="M4 3h13l3 3v15H4V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>, copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>, trash: <><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v6m4-6v6"/></>, pin: <><path d="m8 3 8 0-1 7 4 4H5l4-4-1-7ZM12 14v7"/></>, eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    layers: <><path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/></>, settings: <><path d="M3 7h18M3 17h18"/><circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/></>, alert: <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v1"/></>,
    cloud: <><path d="M6 18a5 5 0 0 1 0-10 6 6 0 0 1 11-2 5 5 0 1 1 1 12H6Z"/><path d="m9 12 2 2 4-4"/></>, ruler: <><path d="m3 17 14-14 4 4L7 21l-4-4Z"/><path d="m7 13 2 2m2-6 2 2m2-6 2 2"/></>, entrance: <><path d="M5 21V3h14v18M9 12h12m-3-3 3 3-3 3"/></>, obstacle: <rect x="4" y="4" width="16" height="16" rx="3"/>, seat: <><path d="M6 12V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7M4 10v8h16v-8M6 18v3m12-3v3M4 14h16"/></>, palette: <><circle cx="12" cy="12" r="9"/><circle cx="8" cy="8" r="1"/><circle cx="14" cy="6" r="1"/><circle cx="17" cy="11" r="1"/><path d="M12 21v-5h5"/></>, download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></>, rotate: <><path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/></>, moon: <path d="M20 15A8 8 0 0 1 9 4a9 9 0 1 0 11 11Z"/>, help: <><circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3v2m-1 3v1"/></>, folder: <path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3V6Z"/>,
};
const studio = {
    ticket: <><path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z"/><path d="M9 7.5v9" strokeDasharray="2 2"/></>,
    cloud: <><path d="M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 9.5 4.5 4.5 0 0 0 7 18Z"/><path d="m9.5 13 2 2 3.5-4"/></>,
    minus: <path d="M5 12h14"/>, plus: <path d="M12 5v14M5 12h14"/>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    save: <><path d="M5 3h12l2 2v16H5V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>, person: <><circle cx="12" cy="8" r="3"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></>,
    back: <path d="m15 18-6-6 6-6M9 12h11"/>, undo: <path d="m9 7-5 5 5 5M4 12h9a6 6 0 0 1 6 6"/>, redo: <path d="m15 7 5 5-5 5M20 12h-9a6 6 0 0 0-6 6"/>, check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    cursor: <path d="m5 3 13 9-6 .8-3.2 5.1L5 3Z"/>, roundTable: <circle cx="12" cy="12" r="8"/>, rectTable: <rect x="4" y="7" width="16" height="10" rx="1"/>,
    chair: <path d="M200-120q-17 0-28.5-11.5T160-160v-40q-50 0-85-35t-35-85v-200q0-50 35-85t85-35v-80q0-50 35-85t85-35h400q50 0 85 35t35 85v80q50 0 85 35t35 85v200q0 50-35 85t-85 35v40q0 17-11.5 28.5T760-120q-17 0-28.5-11.5T720-160v-40H240v40q0 17-11.5 28.5T200-120Zm-40-160h640q17 0 28.5-11.5T840-320v-200q0-17-11.5-28.5T800-560q-17 0-28.5 11.5T760-520v160H200v-160q0-17-11.5-28.5T160-560q-17 0-28.5 11.5T120-520v200q0 17 11.5 28.5T160-280Zm120-160h400v-80q0-27 11-49t29-39v-112q0-17-11.5-28.5T680-760H280q-17 0-28.5 11.5T240-720v112q18 17 29 39t11 49v80Z"/>, row: <><path d="M5 5h14M5 9h14M5 13h14M5 17h14M5 21h14"/><path d="M3 4v18M21 4v18"/></>,
    stage: <path d="M476.5-723.5Q453-700 420-700q-13 0-24-3.5T374-715q-24 8-38.5 29T321-640h519l-40 280H604v-80h127q5-30 8.5-60t8.5-60H212q5 30 8.5 60t8.5 60h127v80H160l-40-280h120q0-49 27-89t73-59q3-31 26-51.5t54-20.5q33 0 56.5 23.5T500-780q0 33-23.5 56.5ZM391-200h178l23-240H368l23 240Zm-71 80-30-312q-4-35 20-61.5t59-26.5h222q35 0 59 26.5t20 61.5l-30 312H320Z"/>, door: <path d="M160-80v-720q0-33 23.5-56.5T240-880h480q33 0 56.5 23.5T800-800v720H160Zm80-80h480v-640H240v640Zm380-260q25 0 42.5-17.5T680-480q0-25-17.5-42.5T620-540q-25 0-42.5 17.5T560-480q0 25 17.5 42.5T620-420Z"/>, zone: <><path d="m5 6 6-3 8 5-2 10-9 3-4-8 1-7Z"/><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="19" cy="8" r="1" fill="currentColor"/><circle cx="8" cy="21" r="1" fill="currentColor"/></>, ruler: <><path d="m5 19 14-14 2 2L7 21l-2-2Z"/><path d="m10 14 2 2m1-5 2 2m1-5 2 2"/></>, templates: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M17.5 14v7M14 17.5h7"/></>,
    tune: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M10 14v6"/></>, close: <path d="m6 6 12 12M18 6 6 18"/>, edit: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z"/><path d="m13.5 6.5 3.5 3.5"/></>, copy: <><rect x="8" y="8" width="11" height="12" rx="1"/><path d="M16 8V4H5v12h3"/></>, lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>, unlock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M16 10V7a4 4 0 0 0-7.5-2"/></>, trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    alignTop: <><path d="M4 4h16M8 7v13M16 7v8"/><path d="M6 9h4M14 9h4"/></>, alignCenter: <><path d="M12 3v18M5 8h14M7 16h10"/></>, distribute: <><path d="M4 4v16M20 4v16M9 7v10M15 7v10"/></>, flip: <><path d="M12 3v18M5 7l5 5-5 5M19 7l-5 5 5 5"/></>,
};
const account = {
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
  qr: <><path d="M3 3h6v6H3ZM15 3h6v6h-6ZM3 15h6v6H3ZM15 15h3v3h3v3h-6v-3M21 12v3M12 3v3M12 12h3M3 12h3M12 18v3" /></>,
  undo: <path d="m8 3-5 5 5 5M3 8h10a7 7 0 0 1 0 14h-2" />,
  // Existing calendar-plus, editor and event-management symbols.
  "arrow-left": <path d="M20 12H4m6-6-6 6 6 6" />,
  "map-pin": <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  "messages": <><path d="M4 4h16v12H9l-5 4V4Z" /><path d="M8 8h8M8 12h5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: <path d="m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Zm9-12 3.5 3.5" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  money: <path d="M4 6h16v12H4V6Zm8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 9H5m14 6h-2" />,
  ticket: <><path d="M4 5h16a1 1 0 0 1 1 1v3c-1.7 0-3 1.3-3 3s1.3 3 3 3v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3c1.7 0 3-1.3 3-3s-1.3-3-3-3V6a1 1 0 0 1 1-1Z" /><path d="M13 5v2m0 4v2m0 4v2" /></>,
  "calendar-check": <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 9h18m-13 6 2.5 2.5L16 12" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  "user-round": <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  "contact-round": <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  "log-out": <path d="M17 16l4-4m0 0-4-4m4 4H8m5 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />,
  "receipt-text": <><path d="M4 3l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2v18l-2-2-2 2-2-2-2 2-2-2-2 2-2-2-2 2Z" /><path d="M8 9h8M8 13h6" /></>,
  "circle-help": <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 16h.01" /></>,
  "arrow-up-right": <path d="M7 17 17 7M7 7h10v10" />,
  "arrow-right": <path d="M4 12h16m-6-6 6 6-6 6" />,
  "chevron-down": <path d="m7 10 5 5 5-5" />,
  "shopping-bag": <><path d="M5 7h14l1 14H4L5 7Z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
  smartphone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  send: <path d="m21 3-6 18-4-8-8-4L21 3Zm0 0L11 13" />,
  "circle-check": <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  "shield-check": <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  "cloud-alert": <><path d="M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 0 10M12 9v4M12 17h.01" /></>,
  "refresh-cw": <><path d="M20 7a9 9 0 0 0-15-2L3 7m0-4v4h4M4 17a9 9 0 0 0 15 2l2-2m0 4v-4h-4" /></>,
};
const aliases = { rows:'row', round:'roundTable', rect:'rectTable', seat:'chair', entrance:'door', standing:'zone', settings:'tune' };
const shared = { ticket:account.ticket, arrow:account['arrow-right'], back:account['arrow-left'], plus:account.plus, eye:account.eye, download:account.download, help:account['circle-help'], check:account['circle-check'], moon:<path d="M20.8 13.1A9 9 0 0 1 10.9 3.2 9 9 0 1 0 20.8 13.1Z"/>, sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></> };
export function SiteIcon({ name, size=20, ...props }) {
  const key=aliases[name]??name;
  const material=['chair','stage','door'].includes(key);
  return <svg width={size} height={size} viewBox={material?'0 -960 960 960':'0 0 24 24'} fill={material?'currentColor':'none'} stroke={material?'none':'currentColor'} strokeWidth={material?undefined:1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{shared[name]??studio[key]??fallback[name]??fallback.obstacle}</svg>;
}
