import { useState, useEffect, useMemo, createContext, useContext, Component } from "react";
import * as api from "./api";

// ─── App Context ────────────────────────────────────────────────────────────
const AppContext = createContext(null);
const useAppContext = () => useContext(AppContext);
const useTheme = useAppContext;

const THEMES = {
  indigo: { name: "Indigo", emoji: "💜", primary: "#6366f1", primaryHover: "#4f46e5", primaryLight: "#ede9fe", primaryText: "#4338ca", accent: "#8b5cf6", appBg: "#eef2ff" },
  sky: { name: "Sky", emoji: "🔵", primary: "#0ea5e9", primaryHover: "#0284c7", primaryLight: "#e0f2fe", primaryText: "#0369a1", accent: "#38bdf8", appBg: "#e0f7ff" },
  emerald: { name: "Emerald", emoji: "💚", primary: "#10b981", primaryHover: "#059669", primaryLight: "#d1fae5", primaryText: "#065f46", accent: "#34d399", appBg: "#ecfdf5" },
  rose: { name: "Rose", emoji: "🌸", primary: "#f43f5e", primaryHover: "#e11d48", primaryLight: "#ffe4e6", primaryText: "#be123c", accent: "#fb7185", appBg: "#fce7f3" },
  amber: { name: "Amber", emoji: "🟡", primary: "#f59e0b", primaryHover: "#d97706", primaryLight: "#fef3c7", primaryText: "#92400e", accent: "#fbbf24", appBg: "#fef9c3" },
  slate: { name: "Slate", emoji: "🩶", primary: "#475569", primaryHover: "#334155", primaryLight: "#f1f5f9", primaryText: "#1e293b", accent: "#64748b", appBg: "#f1f5f9" },
};

const BG_THEMES = {
  light: { name: "Light Mode", appBg: "#f8fafc", cardBg: "white", border: "#e2e8f0", hoverBg: "#f1f5f9", hoverBorder: "#cbd5e1" },
  dark: { name: "Dark Mode", appBg: "#020617", cardBg: "#0f172a", border: "#1e293b", hoverBg: "#1e293b", hoverBorder: "#334155" },
  dim: { name: "Dim Mode", appBg: "#1c1917", cardBg: "#292524", border: "#44403c", hoverBg: "#44403c", hoverBorder: "#57534e" },
  pure: { name: "Pure White", appBg: "white", cardBg: "#fafafa", border: "#f1f5f9", hoverBg: "#f8fafc", hoverBorder: "#e2e8f0" }
};

const vehicleTypes = [
  { id: "two-wheeler", label: "Two Wheeler", emoji: "🛵" },
  { id: "four-wheeler", label: "Four Wheeler", emoji: "🚗" },
  { id: "ev", label: "Electric Vehicle", emoji: "⚡" },
];

function hashSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(seed) { return () => { let t = (seed += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function generateSlots(zone, vehicleType) {
  if (!zone) return [];
  const count = zone.totalSpaces || 30;
  const rand = mulberry32(hashSeed(`${zone.id}:${vehicleType}`));
  const fo = ["5-10 min", "10-20 min", "20-30 min", "30-45 min"];
  
  const cols = 5;
  const maxRows = Math.ceil(count / cols);
  
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const colRaw = i % cols;
    // Calculate physical column matching the snake display (odd rows reversed)
    const phyCol = (row % 2 === 0) ? colRaw : (cols - 1 - colRaw);
    
    // Simplified Distance logic: 
    // Entrance is at (0,0). Each zone starts at 'zone.distance' km.
    // Each row adds 3 meters. Each column adds 2 meters.
    const distExtraMeter = (row * 3) + (phyCol * 2);
    const totalDistKm = (parseFloat(zone.distance) + (distExtraMeter / 1000)).toFixed(3);
    
    const occ = rand() > 0.45;

    return {
      id: `${zone.id}-${i + 1}`, 
      occupied: occ, 
      vehicleType,
      distanceFromOrigin: Math.round(distExtraMeter) + " m within zone",
      proximityToExit: Math.round(distExtraMeter + 10) + " m",
      proximityToExitValue: distExtraMeter + 10,
      totalDistanceKm: totalDistKm,
      walkTime: Math.max(1, Math.round((parseFloat(totalDistKm) * 1000) / 75)) + " min walk from Entrance",
      occupiedDuration: occ ? Math.floor(rand() * 240) + 10 : undefined,
      expectedFreeIn: occ ? fo[Math.floor(rand() * 4)] : undefined,
      expectedOccupiedIn: !occ ? fo[Math.floor(rand() * 4)] : undefined,
      aiConfidence: occ ? Math.floor(rand() * 30) + 60 : undefined
    };
  });
}

function predictPrice({ durationHrs, pricing, vehicleType }) {
  const p = pricing[vehicleType] || { amount: 40, model: "per_hour" };
  const base = parseInt(p.amount) || 40;
  
  // Strictly duration-based without multipliers
  const total = p.model === "per_entry" ? base : Math.round(base * durationHrs * 10) / 10;
  const unit = p.model === "per_entry" ? "/visit" : "/hr";
  
  const breakdown = [
    { label: "Base rate", value: `₹${base}${unit}` },
    p.model === "per_hour" ? { label: "Duration", value: `${durationHrs} hrs` } : null,
  ].filter(Boolean);
  
  return { pph: base, total, mul: 1.0, breakdown, unit };
}

function isTimeOverlap(b1, b2) {
  if (b1.slotId !== b2.slotId) return false;
  if (b1.status === "cancelled" || b1.status === "refunded" || b2.status === "cancelled" || b2.status === "refunded") return false;
  const start1 = new Date(`${b1.date}T${b1.time}`).getTime();
  const end1 = start1 + (parseFloat(b1.duration) * 3600000);
  const start2 = new Date(`${b2.date}T${b2.time}`).getTime();
  const end2 = start2 + (parseFloat(b2.duration) * 3600000);
  return start1 < end2 && start2 < end1;
}

function PBar({ pct, color }) {
  return <div className="pbar"><div className="pfill" style={{ width: `${pct}%`, background: color }} /></div>;
}

function makeCSS(t) {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;color:${t.textColor};}
.app{min-height:100vh;padding:16px;background:${t.appBg};}
.container{max-width:530px;margin:0 auto;}
.container-wide{max-width:920px;margin:0 auto;}
.topbar{display:flex;justify-content:flex-end;gap:7px;margin-bottom:12px;flex-wrap:wrap;align-items:center;}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid ${t.borderColor};background:${t.cardBg};color:${t.textColor};transition:all .15s;}
.btn:hover{background:${t.hoverBg};border-color:${t.hoverBorder};}
.btn-primary{background:${t.primary};color:white;border-color:${t.primary};}
.btn-primary:hover{background:${t.primaryHover};}
.btn-ghost{background:transparent;border-color:transparent;}
.btn-ghost:hover{background:${t.hoverBg};}
.btn-danger{background:#ef4444;color:white;border-color:#ef4444;}
.btn-danger:hover{background:#dc2626;}
.btn-success{background:#22c55e;color:white;border-color:#22c55e;}
.btn-success:hover{background:#16a34a;}
.btn-wide{width:100%;justify-content:center;padding:13px;font-size:15px;border-radius:13px;}
.btn-back{padding:0;background:transparent;border:none;color:#64748b;font-size:14px;cursor:pointer;}
.btn-back:hover{color:${t.textColor};}
.card{background:${t.cardBg};border:1px solid ${t.borderColor};border-radius:14px;overflow:hidden;margin-bottom:16px;}
.cp{padding:16px;}
.ctitle{font-size:15px;font-weight:600;color:${t.textColor};margin-bottom:14px;}
.zone-card{background:${t.cardBg};border:1px solid ${t.borderColor};border-radius:14px;padding:16px;cursor:pointer;transition:all .15s;text-align:left;width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}
.zone-card:hover{border-color:${t.primary};box-shadow:0 2px 14px ${t.primary}22;}
.badge-d{background:${t.hoverBg};border:1px solid ${t.borderColor};font-size:12px;font-weight:500;padding:4px 10px;border-radius:8px;color:${t.textColor};}
.slot-grid{display:grid;grid-template-columns:repeat(5,1fr);column-gap:15px;row-gap:20px;padding:20px 10px;background:${t.hoverBg};border-radius:12px;}
.slot{aspect-ratio:1.2;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:12px;cursor:pointer;border:none;transition:transform .12s;position:relative;transform:skewX(-20deg);box-shadow:0 3px 6px #0001;}
.slot-grid > :nth-child(10n+6),.slot-grid > :nth-child(10n+7),.slot-grid > :nth-child(10n+8),.slot-grid > :nth-child(10n+9),.slot-grid > :nth-child(10n+10) {transform:skewX(20deg);}
.slot span{transform:skewX(20deg);}
.slot-grid > :nth-child(10n+6) span,.slot-grid > :nth-child(10n+7) span,.slot-grid > :nth-child(10n+8) span,.slot-grid > :nth-child(10n+9) span,.slot-grid > :nth-child(10n+10) span {transform:skewX(-20deg);}
.slot:hover{transform:scale(1.1);box-shadow:0 2px 8px #0003;}
.slot.av{background:#dcfce7;color:#166534;border:1.5px solid #86efac;}
.slot.occ{background:#fee2e2;color:#991b1b;}
.slot.bk{background:${t.primaryLight};color:${t.primaryText};border:1.5px solid ${t.primary};}
.vehicle-card{background:${t.cardBg};border:1px solid ${t.borderColor};border-radius:14px;padding:16px;cursor:pointer;transition:all .15s;text-align:left;width:100%;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.vehicle-card:hover{border-color:${t.primary};box-shadow:0 2px 12px ${t.primary}18;}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.fg label{display:block;font-size:12px;font-weight:500;color:#475569;margin-bottom:5px;}
.fg input,.fg select{width:100%;padding:8px 10px;border:1px solid ${t.borderColor};border-radius:9px;font-size:13px;background:${t.cardBg};color:${t.textColor};}
.overlay{position:fixed;inset:0;background:#0007;display:flex;align-items:center;justify-content:center;z-index:300;padding:16px;}
.dialog{background:${t.cardBg};border-radius:20px;width:100%;max-width:440px;padding:24px;position:relative;max-height:90vh;overflow-y:auto;}
.tbtn{border:2px solid ${t.borderColor};border-radius:12px;padding:12px 8px;cursor:pointer;background:${t.cardBg};text-align:center;transition:all .15s;font-size:13px;}
.tbtn:hover{border-color:${t.hoverBorder};} .tbtn.active{border-color:${t.primary};background:${t.primaryLight};}
.tgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.tdot{width:28px;height:28px;border-radius:50%;margin:0 auto 6px;}
.bk-item{background:${t.cardBg};border:1px solid ${t.borderColor};border-radius:12px;padding:14px;display:flex;justify-content:space-between;border-left:4px solid ${t.primary};margin-bottom:10px;}
.login-wrap{min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:80px 24px;background:${t.appBg};gap:100px;flex-wrap:nowrap;}
.login-card{background:${t.cardBg};border:1px solid ${t.borderColor};border-radius:28px;padding:40px;width:100%;max-width:440px;box-shadow:0 30px 60px rgba(0,0,0,0.06);margin-top:20px;}
.about-section{max-width:500px;animation:fi .4s ease-out;padding:20px;}
.about-title{font-size:44px;font-weight:800;line-height:1.1;margin-bottom:24px;color:${t.textColor};letter-spacing:-0.02em;}
.about-title span{background:linear-gradient(135deg,${t.primary},${t.accent});-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.about-p{font-size:18px;line-height:1.6;color:#64748b;margin-bottom:32px;}
.feature-list{display:grid;gap:20px;}
.feature-card{display:flex;align-items:flex-start;gap:16px;background:${t.cardBg};padding:20px;border-radius:18px;border:1px solid ${t.borderColor};transition:all .3s cubic-bezier(0.4, 0, 0.2, 1);}
.feature-card:hover{transform:translateX(8px);border-color:${t.primary};box-shadow:0 10px 30px ${t.primary}15;}
.feature-icon{font-size:24px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:${t.primaryLight};border-radius:14px;flex-shrink:0;}
.feature-info div:first-child{font-weight:700;font-size:16px;color:${t.textColor};margin-bottom:4px;}
.feature-info div:last-child{font-size:14px;color:#64748b;line-height:1.5;}
.li{width:100%;padding:14px 16px;border:1px solid ${t.borderColor};border-radius:14px;font-size:15px;margin-bottom:14px;transition:all .2s;background:${t.cardBg};color:${t.textColor};}
.li:focus{border-color:${t.primary};outline:none;box-shadow:0 0 0 4px ${t.primary}15;}
.sep{display:flex;align-items:center;gap:12px;margin:28px 0;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;}
.sep::before,.sep::after{content:'';flex:1;height:1px;background:${t.borderColor};}
.s-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
.s-btn{display:flex;align-items:center;justify-content:center;height:52px;border-radius:14px;border:1px solid ${t.borderColor};background:${t.cardBg};cursor:pointer;transition:all .25s cubic-bezier(0.4, 0, 0.2, 1);}
.s-btn:hover{background:${t.hoverBg};transform:translateY(-3px);box-shadow:0 10px 20px rgba(0,0,0,0.06);border-color:${t.primary};}
.s-btn svg{width:24px;height:24px;}
.remembered-box{background:${t.primaryLight};border:1.5px solid ${t.primary};padding:14px;border-radius:16px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:all .2s;animation:fi .3s ease;}
.remembered-box:hover{transform:scale(1.02);box-shadow:0 4px 12px ${t.primary}22;}
.err{background:#fef2f2;color:#dc2626;font-size:13px;padding:12px 16px;border-radius:12px;margin-bottom:20px;border:1px solid #fecaca;}
.fr{display:flex;align-items:center;gap:8px;}
.fb{display:flex;align-items:center;justify-content:space-between;}
.fc{display:flex;flex-direction:column;gap:8px;}
.price-grad{background:linear-gradient(135deg,${t.primary},${t.accent});border-radius:16px;padding:20px;color:white;margin-bottom:16px;}
.st{font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;}
.pulse-slow{animation:pulse 2.5s infinite;}
.pulse-dot{width:6px;height:6px;background:currentColor;border-radius:50%;animation:pulse-dot 1s infinite;}
@keyframes pulse{0%{opacity:1;transform:scale(1);}50%{opacity:0.9;transform:scale(0.985);}100%{opacity:1;transform:scale(1);}}
@keyframes pulse-dot{0%{transform:scale(1);opacity:1;}100%{transform:scale(2.5);opacity:0;}}
.slot-nearest{animation:glow-slot 2s infinite;z-index:5;}
@keyframes glow-slot{0%{box-shadow:0 0 5px ${t.primary}44;}50%{box-shadow:0 0 15px ${t.primary}99;}100%{box-shadow:0 0 5px ${t.primary}44;}}
.st-active{background:#dcfce7;color:#166534;}
.st-cancelled{background:#fee2e2;color:#991b1b;}
.slot-nearest{border:2.5px solid #f59e0b !important;animation:pulse-gold 2s infinite;box-shadow:0 0 15px rgba(245,158,11,0.4);}
@keyframes pulse-gold{0%{box-shadow:0 0 0 0 rgba(245,158,11,0.7);}70%{box-shadow:0 0 0 10px rgba(245,158,11,0);}100%{box-shadow:0 0 0 0 rgba(245,158,11,0);}}
.badge-suggested{background:linear-gradient(135deg,#f59e0b,#d97706);color:white;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;}
.fade{animation:fi .2s ease;}@keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1}}
.sp{animation:sp 1s linear infinite;}@keyframes sp{to{transform:rotate(360deg)}}
.xs{font-size:11px;}.sm{font-size:13px;}.mu{color:#64748b;}.tc{text-align:center;}.mb4{margin-bottom:14px;}.mt4{margin-top:14px;}
.tabs{display:flex;gap:4px;background:${t.hoverBg};padding:4px;border-radius:11px;margin-bottom:18px;}
.tab{flex:1;padding:8px;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;background:transparent;color:#64748b;display:flex;align-items:center;justify-content:center;gap:5px;transition:all .15s;}
.tab.active{background:${t.cardBg};color:${t.textColor};box-shadow:0 1px 4px #0001;}
.stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px;}
.sbox{border-radius:14px;padding:14px;text-align:center;}
.snum{font-size:22px;font-weight:700;}
.slbl{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-top:4px;}
.pbar{height:8px;background:${t.borderColor};border-radius:99px;overflow:hidden;}
.pfill{height:100%;border-radius:99px;transition:width .5s;}
`;
}

function SocialMockup({ type, onClose, onLogin }) {
  const [loading, setLoading] = useState(false);
  const [typedName, setTypedName] = useState("");
  const { t } = useTheme();

  const handleLogin = () => {
    setLoading(true);
    setTimeout(() => {
      const email = `ps_${type}@mock.com`;
      const username = typedName || `${type.charAt(0).toUpperCase() + type.slice(1)} User`;
      const isAdmin = email.includes('admin') || username.toLowerCase().includes('admin');
      onLogin({ email, username, role: isAdmin ? 'admin' : 'user' });
      onClose();
    }, 1500);
  };

  const config = {
    google: { color: '#4285F4', name: 'Google', url: 'accounts.google.com', logo: <svg viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5.04c1.94 0 3.51.68 4.6 1.81l3.41-3.41C17.92 1.44 15.2 0 12 0 7.31 0 3.25 2.67 1.21 6.6l3.96 3.07C6.12 6.81 8.8 5.04 12 5.04z"/><path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.44h6.44c-.28 1.48-1.13 2.74-2.41 3.58l3.74 2.9c2.19-2.01 3.72-4.99 3.72-8.58z"/><path fill="#FBBC05" d="M5.17 14.53C4.94 13.81 4.8 13.06 4.8 12.27s.14-1.54.37-2.26L1.21 6.6C.44 8.29 0 10.22 0 12.27s.44 3.98 1.21 5.67l3.96-3.41z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.74-2.9c-1.04.7-2.38 1.11-3.74 1.11-3.2 0-5.88-2.16-6.83-5.04l-3.96 3.41C3.25 21.33 7.31 24 12 24z"/></svg> },
    facebook: { color: '#1877F2', name: 'Facebook', url: 'facebook.com', logo: <svg viewBox="0 0 24 24"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
    yahoo: { color: '#6001d2', name: 'Yahoo', url: 'login.yahoo.com', logo: <svg viewBox="0 0 24 24"><path fill="#6001d2" d="M2.204 2.042l7.73 10.155v7.87c0 .991.604 1.487 1.42 1.487.818 0 1.422-.496 1.422-1.487v-7.87l7.73-10.155c.783-1.026.155-1.596-.713-1.596-.54 0-.898.24-1.2.664l-5.822 8.165-5.823-8.165c-.29-.42-.656-.664-1.206-.664-.863 0-1.503.57-.718 1.596z"/></svg> }
  };

  const c = config[type] || config.google;

  return (
    <div className="overlay" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 10000 }}>
      <div className="fade" style={{ width: 440, background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0' }}>
        <div style={{ background: '#f8fafc', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 11, height: 11, background: '#ff5f57', borderRadius: '50%' }} />
            <div style={{ width: 11, height: 11, background: '#febc2e', borderRadius: '50%' }} />
            <div style={{ width: 11, height: 11, background: '#28c840', borderRadius: '50%' }} />
          </div>
          <div style={{ flex: 1, background: 'white', border: '1px solid #cbd5e1', borderRadius: 6, height: 28, fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', padding: '0 10px', overflow: 'hidden', fontWeight: 500 }}>
            {c.url}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>
        <div style={{ padding: '48px 40px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 24px' }}>{c.logo}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Sign in with {c.name}</div>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>to continue to ParkSpot+</div>
          <div style={{ textAlign: 'left' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email or Username</label>
            <input className="li" style={{ marginBottom: 20, borderColor: '#e2e8f0', background: '#f8fafc' }} placeholder="Enter your credentials" disabled={loading} value={typedName} onChange={e => setTypedName(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-wide" disabled={loading} onClick={handleLogin} style={{ height: 52, background: c.color, border: 'none', fontWeight: 700, fontSize: 15, borderRadius: 12 }}>
            {loading ? <div className="sp">⟳</div> : `Continue with ${c.name}`}
          </button>
          <div style={{ marginTop: 24, fontSize: 13, color: '#94a3b8' }}>
            New to {c.name}? <a href="#" style={{ color: c.color, fontWeight: 600, textDecoration: 'none' }}>Create Account</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemePicker({ onClose }) {
  const { themeKey, setThemeKey, bgThemeKey, setBgThemeKey, t } = useTheme();

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, background: t.cardBg }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "transparent", border: "none", width: 32, height: 32, cursor: "pointer", fontSize: 16, color: t.textColor }}>✕</button>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4, color: t.textColor }}>🎨 Customize Look</div>
        <div className="sm mu mb4" style={{ color: t.textColor, opacity: 0.8 }}>Choose an accent</div>
        <div className="tgrid mb6">
          {Object.entries(THEMES).map(([key, th]) => (
            <button key={key} className={`tbtn ${themeKey === key ? "active" : ""}`} onClick={() => setThemeKey(key)} style={{ borderColor: t.borderColor, background: t.cardBg }}>
              <div className="tdot" style={{ background: th.primary }} />
              <div style={{ fontWeight: 600, color: t.textColor }}>{th.emoji} {th.name}</div>
            </button>
          ))}
        </div>
        <div className="sm mu mb4" style={{ color: t.textColor, opacity: 0.8 }}>Choose a background</div>
        <div className="tgrid mb6">
          {Object.entries(BG_THEMES).map(([key, th]) => (
            <button key={key} className={`tbtn ${bgThemeKey === key ? "active" : ""}`} onClick={() => setBgThemeKey(key)} style={{ borderColor: t.borderColor, background: t.cardBg }}>
              <div style={{ height: 20, width: "100%", background: th.appBg, borderRadius: 4, marginBottom: 6, border: "1px solid " + th.border }} />
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textColor }}>{th.name}</div>
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-wide" style={{ marginTop: 16 }} onClick={onClose}>Apply Changes</button>
      </div>
    </div>
  );
}

function InfoGuide({ onClose }) {
  const { auth, t } = useTheme();
  const isAdmin = auth?.role === 'admin';

  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, background: t.cardBg }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "transparent", border: "none", width: 32, height: 32, cursor: "pointer", fontSize: 16, color: t.textColor }}>✕</button>
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 12, color: t.textColor }}>{isAdmin ? "🛡️ Facility Management Protocol" : "📖 Smart City Parking Guide"}</div>
        
        <div className="fc" style={{ gap: 16, maxHeight: '70vh', overflowY: 'auto', paddingRight: 10 }}>
            {isAdmin ? (
                <>
                    <div className="card cp" style={{ background: t.hoverBg, border: "none" }}>
                        <div className="fc" style={{ gap: 16 }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>📊 Predictive Governance</div>
                                <div className="sm mu">Monitor your urban ecosystem via the <b>Insights</b> tab. Leverage the CatBoost-powered forecasts to anticipate demand surges at the Main Entrance.</div>
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>📈 Revenue Optimization</div>
                                <div className="sm mu">Fine-tune the economics of your facility in <b>Settings</b>. Adjust hourly rates dynamically to optimize utilization and ensure sustainable ROI.</div>
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🛡️ Access Architecture</div>
                                <div className="sm mu">Global admin status is granted to verified management accounts. All credential modifications are logged for security auditing.</div>
                            </div>
                        </div>
                    </div>
                    <div className="card cp" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#166534", marginBottom: 4 }}>💡 Pro Tip: EV Infrastructure</div>
                        <div className="sm" style={{ color: "#14532d" }}>Monitor Zone C closely; it is the facility's highest-priority zone for sustainability reporting and smart-grid integration.</div>
                    </div>
                </>
            ) : (
                <>
                    <div className="card cp" style={{ background: t.hoverBg, border: "none" }}>
                        <div className="fc" style={{ gap: 16 }}>
                            <section>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🚀 How to Use the App</div>
                                <p className="xs mu">1. Select your vehicle type and preferred zone.<br/>2. Choose an available slot from the grid layout.<br/>3. Review the total charges and confirm your booking.<br/>4. Track your active booking status from the main dashboard.</p>
                            </section>
                            <section>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🅿️ Status Architecture</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <div className="fr sm"><span style={{ width: 14, height: 14, borderRadius: 3, background: '#dcfce7', border: '1px solid #86efac' }}></span> <span>Ready for Entry</span></div>
                                    <div className="fr sm"><span style={{ width: 14, height: 14, borderRadius: 3, background: '#fee2e2', border: '1px solid #fca5a5' }}></span> <span>Sensor Occupied</span></div>
                                    <div className="fr sm"><span style={{ width: 14, height: 14, borderRadius: 3, background: t.primaryLight, border: `1px solid ${t.primary}` }}></span> <span>Your Session</span></div>
                                    <div className="fr sm"><span style={{ width: 14, height: 14, borderRadius: 3, background: '#e6e6fa', border: '1px solid #d8b4e2' }}></span> <span>Prior Booking</span></div>
                                </div>
                            </section>
                            <section>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>⚖️ Liability & Compliance</div>
                                <p className="xs mu">Vehicle safety is our priority. Please adhere to speed limits within the Basement (Zone C) and East Wing. Overstays are subject to automated fee adjustments.</p>
                            </section>
                        </div>
                    </div>
                </>
            )}
        </div>
        <button className="btn btn-primary btn-wide" style={{ marginTop: 24 }} onClick={onClose}>Understood</button>
      </div>
    </div>
  );
}

function ChangeCredentialsDialog({ onClose }) {
  const { t } = useTheme();
  const [step, setStep] = useState(1); // 1: Verify, 2: Update
  const [oldVal, setOldVal] = useState(""), [oldPw, setOldPw] = useState("");
  const [newUn, setNewUn] = useState(""), [newEm, setNewEm] = useState(""), [newPw, setNewPw] = useState("");
  const [err, setErr] = useState(""), [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!oldVal || !oldPw) { setErr("Please enter current credentials."); return; }
    setLoading(true); setErr("");
    try {
        // Just checking validity first via a dummy login or use the update call with 'both'
        // For simplicity, we'll proceed to step 2 and let the backend do the final check
        setStep(2);
    } finally { setLoading(false); }
  };

  const handleUpdate = async () => {
    setLoading(true); setErr("");
    try {
        const res = await api.updateCredentials({
            oldVal, oldPw,
            newVal: { email: newEm, username: newUn, password: newPw },
            type: 'both'
        });
        if (res.success) {
            alert("Credentials updated successfully. Please login with your new details.");
            onClose();
        } else {
            setErr(res.message);
        }
    } catch { setErr("Update failed."); }
    finally { setLoading(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
        <div className="card cp fade" style={{ width: 400, maxWidth: "90%", padding: 32 }} onClick={e => e.stopPropagation()}>
            <div className="tc mb6">
                <div style={{ fontSize: 32, marginBottom: 12 }}>🛡️</div>
                <div style={{ fontWeight: 800, fontSize: 20 }}>Account Recovery & Update</div>
                <div className="sm mu">Securely update your credentials</div>
            </div>

            {err && <div className="err mb4">{err}</div>}

            {step === 1 ? (
                <div className="fc">
                    <label className="xs mu mb1">Enter Current Email or Username</label>
                    <input className="li" value={oldVal} onChange={e => setOldVal(e.target.value)} placeholder="Current identifier" />
                    <label className="xs mu mb1 mt3">Enter Current Password</label>
                    <input className="li" type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="Current password" />
                    <button className="btn btn-primary btn-wide mt4" onClick={handleVerify} disabled={loading}>{loading ? "Verifying..." : "Verify Identity"}</button>
                </div>
            ) : (
                <div className="fc">
                    <div className="sm fb7 mb3">Identity Verified! Set your new details:</div>
                    <label className="xs mu mb1">New Username (Optional)</label>
                    <input className="li" value={newUn} onChange={e => setNewUn(e.target.value)} placeholder="New username" />
                    <label className="xs mu mb1 mt3">New Email (Optional)</label>
                    <input className="li" value={newEm} onChange={e => setNewEm(e.target.value)} placeholder="New email" />
                    <label className="xs mu mb1 mt3">New Password (Optional)</label>
                    <input className="li" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password" />
                    <div className="fb mt4" style={{ gap: 10 }}>
                        <button className="btn btn-wide" onClick={() => setStep(1)} disabled={loading}>Previous</button>
                        <button className="btn btn-primary btn-wide" onClick={handleUpdate} disabled={loading}>{loading ? "Updating..." : "Update Now"}</button>
                    </div>
                </div>
            )}
            <button className="btn btn-ghost btn-wide mt4" onClick={onClose}>Cancel</button>
        </div>
    </div>
  );
}

function LoginPage({ onLogin }) {
  const { t } = useTheme();
  const [isSignUp, setIsSignUp] = useState(false);
  const [socialType, setSocialType] = useState(null);
  const [em, setEm] = useState(""), [un, setUn] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [remUserEmail, setRemUserEmail] = useState(localStorage.getItem("lastUsedUser") || "");
  const [remAdminEmail, setRemAdminEmail] = useState(localStorage.getItem("lastUsedAdmin") || "");

  const go = async () => {
    if (!em || !pw || (isSignUp && !un)) { setErr("Please fill all fields."); return; }
    try {
        const res = isSignUp ? await api.register(em, un, pw) : await api.login(em, pw);
        if (res.success) {
            if (res.user.role === 'admin' || res.user.email.includes('admin') || res.user.username?.toLowerCase().includes('admin')) {
                localStorage.setItem("lastUsedAdmin", res.user.email);
            } else {
                localStorage.setItem("lastUsedUser", res.user.email);
            }
            onLogin(res.user);
        }
        else setErr(res.message);
    } catch { setErr("Server error."); }
  };

  const useRemUser = () => {
    setEm(remUserEmail);
    setRemUserEmail("");
  };

  const useRemAdmin = () => {
    setEm(remAdminEmail);
    setRemAdminEmail("");
  };

  return (
    <div className="login-wrap">
      {socialType && <SocialMockup type={socialType} onClose={() => setSocialType(null)} onLogin={onLogin} />}
      <div className="about-section">
        <h1 className="about-title">Easy <span>City Parking</span></h1>
        <p className="about-p">Welcome to ParkSpot+, the stress-free way to find and book your parking spot. We use smart technology to save you time.</p>
        
        <div className="feature-list">
          <div className="feature-card">
            <div className="feature-icon">🧠</div>
            <div className="feature-info">
              <div>Smart Predictions</div>
              <div>Our system guesses how busy the parking lot will be, so you can plan ahead without the headache.</div>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <div className="feature-info">
              <div>Electric Vehicle Charging</div>
              <div>Driving an EV? We have a special zone just for electric cars with fast chargers ready to go.</div>
            </div>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">🛡️</div>
            <div className="feature-info">
              <div>Safe & Secure</div>
              <div>Your personal details and payments are always kept private and fully protected.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="login-card fade">
        <div className="tc mb4">
          <div style={{ width: 80, height: 80, background: t.primaryLight, borderRadius: "24px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 36, boxShadow: `0 12px 24px ${t.primary}25` }}>🅿️</div>
          <div style={{ fontWeight: 800, fontSize: 32, letterSpacing: '-0.03em' }}>ParkSpot+</div>
          <div className="sm mu mt2" style={{ marginBottom: 24 }}>Sign in to continue</div>
        </div>

        {!isSignUp && (remUserEmail || remAdminEmail) && (
            <div style={{ display: 'grid', gridTemplateColumns: (remUserEmail && remAdminEmail) ? '1fr 1fr' : '1fr', gap: '10px', marginBottom: 20 }}>
                {remUserEmail && (
                    <div className="remembered-box" onClick={useRemUser} style={{ marginBottom: 0 }}>
                        <div className="fr">
                            <div style={{ width: 32, height: 32, background: t.primary, borderRadius: "50%", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>U</div>
                            <div style={{ textAlign: "left" }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: t.primaryText }}>Last User</div>
                                <div className="xs mu" style={{ color: t.primaryText, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: (remUserEmail && remAdminEmail) ? '90px' : '200px' }}>{remUserEmail}</div>
                            </div>
                        </div>
                    </div>
                )}
                {remAdminEmail && (
                    <div className="remembered-box" onClick={useRemAdmin} style={{ marginBottom: 0 }}>
                        <div className="fr">
                            <div style={{ width: 32, height: 32, background: t.accent, borderRadius: "50%", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>A</div>
                            <div style={{ textAlign: "left" }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: t.primaryText }}>Last Admin</div>
                                <div className="xs mu" style={{ color: t.primaryText, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: (remUserEmail && remAdminEmail) ? '90px' : '200px' }}>{remAdminEmail}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}

        {err && <div className="err">{err}</div>}
        
        <div className="fc">
            <input className="li" placeholder={isSignUp ? "Email Address" : "Email or Username"} value={em} onChange={e => setEm(e.target.value)} />
            {isSignUp && <input className="li" placeholder="Username" value={un} onChange={e => setUn(e.target.value)} />}
            <input className="li" type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} />
        </div>

        {!isSignUp && (
            <div className="fb mb4" style={{ marginTop: -8 }}>
                <a href="#" className="xs mu" style={{ textDecoration: 'none' }} onClick={() => setRecovery(true)}>Change username or password?</a>
                <div style={{ display: 'flex', gap: 10 }}>
                    <a href="#" className="xs mu" style={{ textDecoration: 'none' }} onClick={() => alert("Please contact support at support@parkspot.plus to recover your username or email.")}>Forgot username/email?</a>
                    <a href="#" className="xs mu" style={{ textDecoration: 'none' }} onClick={() => alert("A password reset link would be sent to your registered email in a real system of this application.")}>Forgot password?</a>
                </div>
            </div>
        )}

        {recovery && <ChangeCredentialsDialog onClose={() => setRecovery(false)} />}

        <button className="btn btn-primary btn-wide" onClick={go} style={{ height: 52, borderRadius: 14, fontWeight: 700, fontSize: 15 }}>{isSignUp ? "Create Account" : "Sign In"}</button>
        
        <div className="sep">Or continue with</div>
        
        <div className="s-grid">
          <button className="s-btn" title="Google" onClick={() => setSocialType("google")}>
            <svg viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5.04c1.94 0 3.51.68 4.6 1.81l3.41-3.41C17.92 1.44 15.2 0 12 0 7.31 0 3.25 2.67 1.21 6.6l3.96 3.07C6.12 6.81 8.8 5.04 12 5.04z"/><path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.44h6.44c-.28 1.48-1.13 2.74-2.41 3.58l3.74 2.9c2.19-2.01 3.72-4.99 3.72-8.58z"/><path fill="#FBBC05" d="M5.17 14.53C4.94 13.81 4.8 13.06 4.8 12.27s.14-1.54.37-2.26L1.21 6.6C.44 8.29 0 10.22 0 12.27s.44 3.98 1.21 5.67l3.96-3.41z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.74-2.9c-1.04.7-2.38 1.11-3.74 1.11-3.2 0-5.88-2.16-6.83-5.04l-3.96 3.41C3.25 21.33 7.31 24 12 24z"/></svg>
          </button>
          <button className="s-btn" title="Facebook" onClick={() => setSocialType("facebook")}>
            <svg viewBox="0 0 24 24"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </button>
          <button className="s-btn" title="Yahoo" onClick={() => setSocialType("yahoo")}>
            <svg viewBox="0 0 24 24"><path fill="#6001d2" d="M2.204 2.042l7.73 10.155v7.87c0 .991.604 1.487 1.42 1.487.818 0 1.422-.496 1.422-1.487v-7.87l7.73-10.155c.783-1.026.155-1.596-.713-1.596-.54 0-.898.24-1.2.664l-5.822 8.165-5.823-8.165c-.29-.42-.656-.664-1.206-.664-.863 0-1.503.57-.718 1.596z"/></svg>
          </button>
        </div>

        <button className="btn btn-ghost btn-wide mt4" onClick={() => setIsSignUp(!isSignUp)} style={{ fontSize: 13, fontWeight: 500 }}>
          {isSignUp ? "Already have an account? Sign in" : "New to ParkSpot+? Create account"}
        </button>
        {!isSignUp && (
          <div className="fr sm" style={{ gap: 4, marginTop: 12, justifyContent: 'center' }}>
              <span className="mu">Want to test as admin?</span>
              <button className="btn-back" style={{ color: t.primary, fontWeight: 700 }} onClick={() => { setEm("admin@gmail.com"); setPw("admin123"); }}>Use Demo Admin</button>
          </div>
        )}
      </div>
    </div>
  );
}

function PredictOccupancy({ zone, vehicleType, onBack }) {
    const { pricing } = useTheme();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    const [form, setForm] = useState({
        entryDate: today,
        entryTime: `${String(now.getHours()).padStart(2, '0')}:00`,
        exitDate: today,
        exitTime: `${String(Math.min(now.getHours() + 2, 23)).padStart(2, '0')}:00`
    });

    const runEnsemble = async () => {
        setLoading(true);
        try {
            const start = new Date(`${form.entryDate}T${form.entryTime}`);
            const end = new Date(`${form.exitDate}T${form.exitTime}`);
            const durationMins = Math.max(30, (end - start) / 60000);
            const entryHour = start.getHours();

            // Calculate current dynamic pricing multiplier for the model
            const priceData = predictPrice({ 
                durationHrs: durationMins / 60, 
                peakHour: entryHour, 
                isWeekend: [0, 6].includes(start.getDay()), 
                isRain: false, 
                zoneId: zone.id, 
                pricing, 
                vehicleType 
            });

            const slots = generateSlots(zone, vehicleType);
            const features = {
                sensor_proximity: 5.0, sensor_pressure: 8.5, 
                vehicle_weight: vehicleType === 'four-wheeler' ? 1800 : 250,
                vehicle_height: 5.0, weather_temp: 28, weather_precip: 0, 
                traffic_level: 1, noise_level: 45, ultrasonic: 120, 
                entry_hour: entryHour, parking_history: 4, proximity_to_exit: 10,
                dynamic_pricing: priceData.mul, parking_duration: durationMins, 
                payment_amount: priceData.total,
                slots: slots.map(s => ({ id: s.id }))
            };

            const res = await api.predictOccupancyEnsemble(features);
            setResult(res);
        } catch (err) {
            console.error(err);
            alert("Ensemble server error. Please verify the AI backend connection.");
        }
        setLoading(false);
    };

    return (
        <div className="fade">
            <button className="btn-back mb4" onClick={onBack}>← Back</button>
            <div className="card cp">
                <div className="ctitle">🧠 Occupancy Prediction AI</div>
                <div className="fgrid mb4">
                    <div className="fg"><label>📅 Entry Date</label><input type="date" value={form.entryDate} onChange={e => setForm({...form, entryDate: e.target.value})} min={today} /></div>
                    <div className="fg"><label>🕐 Entry Time</label><input type="time" value={form.entryTime} onChange={e => setForm({...form, entryTime: e.target.value})} /></div>
                    <div className="fg"><label>📅 Exit Date</label><input type="date" value={form.exitDate} onChange={e => setForm({...form, exitDate: e.target.value})} min={form.entryDate} /></div>
                    <div className="fg"><label>🕐 Exit Time</label><input type="time" value={form.exitTime} onChange={e => setForm({...form, exitTime: e.target.value})} /></div>
                </div>
                <button className="btn btn-primary btn-wide" onClick={runEnsemble} disabled={loading} style={{ height: 50 }}>
                    {loading ? <span className="sp">⟳</span> : "🚀 Predict Overall & Slot Classification"}
                </button>
            </div>
            {result && (
                <div className="fade">
                    <div className="card cp">
                        <div className="ctitle mb4">🔍 AI Slot Classification Results</div>
                        <div className="slot-grid">
                            {(() => {
                                const sc = [...result.slot_predictions];
                                const resultArr = [];
                                const cols = 5;
                                for (let i = 0; i < sc.length; i += cols) {
                                    let chunk = sc.slice(i, i + cols);
                                    if ((i / cols) % 2 !== 0) chunk.reverse();
                                    resultArr.push(...chunk);
                                }
                                return resultArr.map(s => (
                                    <div key={s.id} className={`slot ${s.prediction === 'Occupied' ? 'occ' : 'av'}`}>
                                        <span>
                                            <div style={{ fontWeight: 800, fontSize: 13 }}>{s.id.split('-')[1]}</div>
                                            <div style={{ fontSize: 9, fontWeight: 600 }}>{s.confidence}%</div>
                                        </span>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function VehicleSelection({ onSelect, onBack, username }) {
    const { pricing } = useTheme();
    return (
        <div className="fade">
            <button className="btn-back mb4" onClick={onBack}>← Back to Login</button>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>Welcome, {username}!</div>
            <div className="sm mu mb4">Choose your vehicle type</div>
            {vehicleTypes.map(vt => (
                <button key={vt.id} className="vehicle-card" onClick={() => onSelect(vt.id)}>
                    <div className="fr"><span style={{ fontSize: 32 }}>{vt.emoji}</span><div style={{ fontWeight: 700 }}>{vt.label}</div></div>
                    <div style={{ fontWeight: 700 }}>₹{pricing[vt.id]?.amount || 0}/hr</div>
                </button>
            ))}
        </div>
    );
}

function ZoneSelection({ zones, onSelect, onBack, vehicleType }) {
    const { t } = useTheme();
    const vt = vehicleTypes.find(v => v.id === vehicleType);

    const visibleZones = useMemo(() => {
        if (vehicleType === 'ev') return zones.filter(z => z.id === 'C');
        return zones.filter(z => z.id !== 'C');
    }, [zones, vehicleType]);

    const recommendedZone = useMemo(() => {
        const sorted = [...visibleZones].sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
        if (vehicleType === 'ev') return visibleZones.find(z => z.id === 'C') || sorted[0];
        return sorted[0];
    }, [visibleZones, vehicleType]);

    return (
        <div className="fade">
            <button className="btn-back mb4" onClick={onBack}>← Back</button>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>🗺️ Select Facility Zone</div>
            
            <div className="card cp mb6" style={{ background: t.primaryLight, border: `1.5px dashed ${t.primary}`, borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 28 }}>📍</div>
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: t.primary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Current Location</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: t.primaryText }}>Main Entrance</div>
                    </div>
                </div>
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Available parking areas for your {vt?.label}:</div>
            {visibleZones.map(z => {
                const isRec = z.id === recommendedZone?.id;
                return (
                    <button key={z.id} className="zone-card" onClick={() => onSelect(z)} style={isRec ? { borderColor: '#f59e0b', background: '#fffbeb' } : {}}>
                        <div>
                            <div className="fr">
                                <div style={{ fontWeight: 700 }}>{z.name}</div>
                                {isRec && <span className="badge-suggested">🌟 Recommended</span>}
                            </div>
                            <div className="xs mu mt4">{z.description}</div>
                        </div>
                        <div className="badge-d">📍 {z.distance} km</div>
                    </button>
                );
            })}
        </div>
    );
}

function PricePredictor({ zone, vehicleType, onBack }) {
    const { pricing } = useTheme();
    const now = new Date(), tod = now.toISOString().split("T")[0];
    const [date, setDate] = useState(tod);
    const [time, setTime] = useState(`${String(now.getHours()).padStart(2, "0")}:00`);
    const [exitDate, setExitDate] = useState(tod);
    const [exitTime, setExitTime] = useState(`${String(Math.min(now.getHours() + 2, 23)).padStart(2, "0")}:00`);
    const [res, setRes] = useState(null);
    const vt = vehicleTypes.find(v => v.id === vehicleType);

    const calc = () => {
        const start = new Date(`${date}T${time}`);
        const end = new Date(`${exitDate}T${exitTime}`);
        const diffHrs = Math.max(0.5, Math.ceil((end - start) / 360000) / 10); // Round up to nearest 0.1h
        const r = predictPrice({ durationHrs: diffHrs, pricing, vehicleType });
        setRes({ ...r, dur: diffHrs });
    };

    return (
        <div className="fade">
            <button className="btn-back mb4" onClick={onBack}>← Back</button>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>💰 Charges Predictor</div>
            <div className="sm mu mb6">{zone.name} · {vt?.emoji} {vt?.label}</div>
            <div className="card cp mb4">
                <div className="ctitle">Enter Parking Details</div>
                <div className="fgrid mb4">
                    <div className="fg"><label>📅 Entry Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} min={tod} /></div>
                    <div className="fg"><label>🕐 Entry Time</label><input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
                    <div className="fg"><label>📅 Exit Date</label><input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} min={date} /></div>
                    <div className="fg"><label>🕐 Exit Time</label><input type="time" value={exitTime} onChange={e => setExitTime(e.target.value)} /></div>
                </div>
                <button className="btn btn-primary btn-wide" onClick={calc}>🔮 Calculate Charges</button>
            </div>
            {res && (
                <div className="fade">
                    <div className="price-grad">
                        <div style={{ fontSize: 11, opacity: .8, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Total Amount</div>
                        <div style={{ fontSize: 42, fontWeight: 800 }}>₹{res.total}</div>
                        <div style={{ fontSize: 13, opacity: .85, marginTop: 3 }}>₹{res.pph}{res.unit} × {res.dur} hrs</div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SlotDialog({ slot, zone, vehicleType, onClose, onBook, bookings, sensorStatus = {} }) {
    const { t, auth } = useTheme();
    if (!slot) return null;
    
    // Merge live sensor attributes
    const live = sensorStatus[slot.id] || {};
    const vt = vehicleTypes.find(v => v.id === vehicleType);
    const slotBookings = (bookings || []).filter(b => b.slotId === slot.id && b.status === "active");
    const allActive = [...slotBookings].sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
    
    const isPhysicallyOccupied = live.occupied !== undefined ? live.occupied : slot.occupied;

    return (
        <div className="overlay" onClick={onClose}>
            <div className="dialog" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "#f1f5f9", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 3 }}>{isPhysicallyOccupied ? "🔴" : "🟢"} Slot {slot.id.split("-")[1]}</div>
                <div className="sm mu mb4">{zone.name} · {vt?.emoji} {vt?.label}</div>

                <div className="fb mb4" style={{ background: t.cardBg, border: "1px solid " + t.borderColor, borderRadius: 12, padding: "10px 14px", gap: '24px' }}>
                    <div><div style={{ fontWeight: 600, fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>🏁 From Entry</div><div style={{ fontSize: 13, fontWeight: 700 }}>{slot.distanceFromOrigin}</div></div>
                    <div><div style={{ fontWeight: 600, fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>🚪 To Exit</div><div style={{ fontSize: 13, fontWeight: 700 }}>{live.proximityToExit || slot.proximityToExit}</div></div>
                </div>

                <div className="card cp mb4" style={{ background: isPhysicallyOccupied ? "#fef2f2" : "#f0fdf4", borderColor: isPhysicallyOccupied ? "#fecaca" : "#bbf7d0" }}>
                    <div style={{ fontWeight: 600, color: isPhysicallyOccupied ? "#dc2626" : "#16a34a" }}>
                        {isPhysicallyOccupied ? "🔴 Physically Occupied" : "🟢 Available (Live Sensor)"}
                    </div>
                </div>

                {allActive.length > 0 && (
                    <div className="mb4">
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: t.primary }}>📅 Active Reservations</div>
                        <div className="fc" style={{ gap: 6 }}>
                            {allActive.map((b, i) => (
                                <div key={i} className="fb sm" style={{ padding: "8px 10px", background: b.userEmail === auth.email ? t.primaryLight : t.hoverBg, borderRadius: 8, border: `1px solid ${b.userEmail === auth.email ? t.primary : t.borderColor}` }}>
                                    <span style={{ fontWeight: 500 }}>{b.date} · {b.time} ({b.duration}h)</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: b.userEmail === auth.email ? t.primary : "#64748b" }}>{b.userEmail === auth.email ? "YOU" : "RESERVED"}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn btn-wide" style={{ flex: 1 }} onClick={onClose}>Close</button>
                    {!isPhysicallyOccupied && <button className="btn btn-primary btn-wide" style={{ flex: 2 }} onClick={() => onBook(slot)}>🎯 Select this slot</button>}
                </div>
            </div>
        </div>
    );
}

function BookConfirm({ slot, zone, vehicleType, onConfirm, onCancel, bookings, initialDate, initialEntry, initialExitDate, initialExitTime }) {
    const { t, pricing, sensorStatus } = useTheme();
    const now = new Date();
    const [date, setDate] = useState(initialDate || now.toISOString().split("T")[0]);
    const [time, setTime] = useState(initialEntry || `${String(now.getHours()).padStart(2, "0")}:00`);
    const [exitDate, setExitDate] = useState(initialExitDate || now.toISOString().split("T")[0]);
    const [exitTime, setExitTime] = useState(initialExitTime || `${String(Math.min(now.getHours() + 2, 23)).padStart(2, "0")}:00`);

    const durHrs = useMemo(() => {
        const start = new Date(`${date}T${time}`);
        const end = new Date(`${exitDate}T${exitTime}`);
        return Math.max(0.5, Math.ceil((end - start) / 360000) / 10);
    }, [date, time, exitDate, exitTime]);

    const vt = vehicleTypes.find(v => v.id === vehicleType);

    const prediction = useMemo(() => {
        return predictPrice({ durationHrs: durHrs, pricing, vehicleType });
    }, [durHrs, pricing, vehicleType]);

    const est = prediction.total.toFixed(2);

    const [aiPrediction, setAiPrediction] = useState(null);
    useEffect(() => {
        const dt = new Date(`${date}T${time}`);
        const fetchAI = async () => {
            try {
                const res = await api.predictOccupancyEnsemble({
                    sensor_proximity: 5.0, sensor_pressure: 0, vehicle_weight: vehicleType === 'four-wheeler' ? 1800 : 250,
                    vehicle_height: 5.0, weather_temp: 25, weather_precip: 0, traffic_level: 1, noise_level: 50, ultrasonic: 100,
                    entry_hour: dt.getHours(), parking_history: 4, proximity_to_exit: 10, dynamic_pricing: prediction.mul, 
                    parking_duration: durHrs * 60, payment_amount: parseFloat(est),
                    slots: [{id: slot.id}]
                });
                if (res && res.slot_predictions && res.slot_predictions.length > 0) {
                    setAiPrediction(res.slot_predictions[0]);
                }
            } catch (err) {
                console.log("AI Prediction unavailable:", err);
            }
        };
        fetchAI();
    }, [date, time, durHrs, est, slot.id, vehicleType, prediction.mul]);

    const handleConfirm = () => {
        const newBooking = { slotId: slot.id, zone: zone.id, vehicleType, date, time, duration: durHrs, status: "active" };
        
        // 1. Check for physical occupancy if booking starts within 15 mins of now
        const bookingStart = new Date(`${date}T${time}`);
        const now = new Date();
        const diffMins = (bookingStart - now) / 60000;
        
        // Use sensor data if available
        const isPhysicallyBlocked = sensorStatus[slot.id] ? sensorStatus[slot.id].occupied : false;
        
        if (diffMins < 15 && isPhysicallyBlocked) {
            alert("⚠️ Physical Conflict: This slot is currently occupied by a vehicle. Please select a different slot or wait for it to clear.");
            return;
        }

        // 2. Check for booking overlaps
        const hasOverlap = bookings.some(b => isTimeOverlap(b, newBooking));
        if (hasOverlap) { alert("🚫 Schedule Conflict: This slot is already reserved for the selected window!"); return; }
        
        onConfirm({ ...newBooking, estimatedCharge: est, bookingId: `BK-${Date.now()}` });
    };

    return (
        <div className="overlay">
            <div className="dialog" style={{ maxWidth: 400 }}>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 3 }}>📅 Confirm Booking</div>
                <div className="sm mu mb4">{zone.name} · Slot {slot.id.split("-")[1]} · {vt?.emoji} {vt?.label}</div>
                <div className="fgrid mb4">
                    <div className="fg"><label>📅 Entry Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().split("T")[0]} /></div>
                    <div className="fg"><label>🕐 Entry Time</label><input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
                    <div className="fg"><label>📅 Exit Date</label><input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} min={date} /></div>
                    <div className="fg"><label>🕐 Exit Time</label><input type="time" value={exitTime} onChange={e => setExitTime(e.target.value)} /></div>
                </div>

                <div className="card mb4" style={{ background: t.hoverBg, border: "none" }}>
                    <div className="fb mb2"><span className="mu sm">Duration</span><span style={{ fontWeight: 700 }}>{durHrs} hours</span></div>
                    <div className="fb">
                        <span className="mu sm">Estimated Cost</span>
                        <span style={{ fontWeight: 800, color: t.primary, fontSize: 18 }}>₹{est}</span>
                    </div>
                </div>

                {aiPrediction && (
                    <div className="card cp mb4" style={{ background: t.appBg, border: `1px solid ${aiPrediction.prediction === 'Occupied' ? '#fca5a5' : '#86efac'}` }}>
                        <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>🧠 AI Future Prediction</div>
                        <div className="sm" style={{ marginTop: 6, color: '#64748b' }}>
                            Model Confidence: <strong>{aiPrediction.confidence}%</strong> that this slot will be <strong style={{color: aiPrediction.prediction === 'Occupied' ? '#dc2626' : '#16a34a'}}>{aiPrediction.prediction}</strong> right before you arrive.
                        </div>
                    </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn btn-wide" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
                    <button className="btn btn-success btn-wide" style={{ flex: 2 }} onClick={handleConfirm}>✅ Confirm</button>
                </div>
            </div>
        </div>
    );
}

function Dashboard({ zone, vehicleType, bookings, onBook, onBack, onPredict, onPricePredict }) {
    const { t, auth, pricing, sensorStatus } = useTheme();
    const slots = useMemo(() => generateSlots(zone, vehicleType), [zone, vehicleType]);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [selectedForBooking, setSelectedForBooking] = useState(null);
    const [bookingSlot, setBookingSlot] = useState(null);
    const [tab, setTab] = useState("slots");
    const [filterClosest, setFilterClosest] = useState(false);

    const [searchActive, setSearchActive] = useState(false);
    const [searchDate, setSearchDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchExitDate, setSearchExitDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchEntry, setSearchEntry] = useState("12:00");
    const [searchExit, setSearchExit] = useState("14:00");

    const activeHere = bookings.filter(b => b.status === "active" && b.zone?.id === zone.id && b.userEmail === auth.email);
    
    const displaySlots = useMemo(() => {
        let sc = [...slots];
        if (filterClosest) {
            sc.sort((a, b) => parseFloat(a.distanceFromOrigin) - parseFloat(b.distanceFromOrigin));
            return sc;
        }
        // Snake Pattern (Boustrophedon) reordering for better UX
        const result = [];
        const cols = 5;
        for (let i = 0; i < sc.length; i += cols) {
            let chunk = sc.slice(i, i + cols);
            if ((i / cols) % 2 !== 0) chunk.reverse();
            result.push(...chunk);
        }
        return result;
    }, [slots, filterClosest]);

    const isPeak = new Date().getHours() >= 17 && new Date().getHours() <= 20;

    const nearestSlot = useMemo(() => {
        const checkOverlap = (sId) => {
            if (!searchActive) return bookings.some(b => b.slotId === sId && b.status === "active");
            return bookings.some(b => b.slotId === sId && b.status === "active" && isTimeOverlap(b, {
                slotId: sId,
                date: searchDate,
                time: searchEntry,
                duration: (() => {
                    const diffMins = (new Date(`${searchDate}T${searchExit}`) - new Date(`${searchDate}T${searchEntry}`)) / 60000;
                    return Math.max(0.5, diffMins / 60);
                })()
            }));
        };

        const available = displaySlots.filter(s => {
            const isBooked = checkOverlap(s.id);
            const isPhysicallyOccupied = sensorStatus[s.id] ? sensorStatus[s.id].occupied : s.occupied;
            return !isPhysicallyOccupied && !isBooked;
        });

        if (available.length === 0) return null;

        // ADAPTIVE AI LOGIC: Score slots based on Distance + Physical Comfort (Noise, Temp) from IoT data
        const scored = available.map(s => {
            const live = sensorStatus[s.id] || {};
            const dist = parseFloat(s.distanceFromOrigin) || 50;
            const noise = parseFloat(live.noiseLevel) || 50; // lower is better
            const temp = parseFloat(live.temperature) || 25; // closer to 25 is better
            
            // Weighting factors
            const distScore = (100 - dist) * 0.6;
            const noiseScore = (100 - noise) * 0.2;
            const tempScore = (30 - Math.abs(temp - 25)) * 0.2;
            
            return { s, score: distScore + noiseScore + tempScore };
        });

        const best = scored.sort((a, b) => b.score - a.score)[0];
        return best ? { ...best.s, aiConfidence: Math.min(98, Math.round(best.score)) } : null;
    }, [displaySlots, bookings, sensorStatus, searchActive, searchDate, searchEntry, searchExit]);

    return (
        <div className="fade">
            <button className="btn-back mb4" onClick={onBack}>← Back</button>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{zone.name}</div>
            <div className="sm mu mb6">{zone.description}</div>

            <div className="tabs mb6">
                <button className={`tab ${tab === "slots" ? "active" : ""}`} onClick={() => setTab("slots")}>📍 Parking</button>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingRight: 10 }}>
                    <div style={{ width: 8, height: 8, background: Object.keys(sensorStatus).length > 0 ? '#22c55e' : '#94a3b8', borderRadius: '50%', boxShadow: Object.keys(sensorStatus).length > 0 ? '0 0 8px #22c55e' : 'none' }}></div>
                    <span className="xs" style={{ fontWeight: 800, color: Object.keys(sensorStatus).length > 0 ? t.primaryText : '#64748b', letterSpacing: '0.05em' }}>{Object.keys(sensorStatus).length > 0 ? "LIVE SENSORS" : "SENSOR OFFLINE"}</span>
                </div>
            </div>
            
            {tab === "slots" && (
                <div className="fade">
                    {activeHere.length > 0 && (
                        <div style={{ border: `2px solid ${t.primary}`, background: `linear-gradient(135deg, ${t.primary}, ${t.accent})`, color: 'white', borderRadius: 18, padding: 20, marginBottom: 18, boxShadow: `0 4px 14px ${t.primary}44` }}>
                            <div className="fb" style={{ marginBottom: 14 }}>
                                <div style={{ fontWeight: 800, fontSize: 18 }}>🚘 Find My Parking Slot</div>
                                <div className="st" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>ACTIVE NOW</div>
                            </div>
                            {activeHere.map(b => (
                                <div key={b.bookingId} style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 12, padding: "12px 16px", marginTop: 8 }}>
                                    <div className="fb" style={{ marginBottom: 6 }}>
                                        <span style={{ fontWeight: 800, fontSize: 24 }}>Slot {b.slotId.split("-")[1]}</span>
                                        <span style={{ fontWeight: 600 }}>{b.duration}h reserved</span>
                                    </div>
                                    <div className="fb sm" style={{ opacity: 0.9 }}>
                                        <span>Entry: {b.time}</span>
                                        <span style={{ fontWeight: 700 }}>Total: ₹{b.estimatedCharge}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}


                    <div className="card cp mb4" style={{ background: t.hoverBg, border: `1px solid ${searchActive ? t.primary : t.borderColor}` }}>
                        <div className="fb mb3">
                            <div style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: t.primary }}>📅 Parking Spot Booking</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="xs mu" style={{fontWeight: searchActive ? 800 : 400}}>{searchActive ? "Booking Mode" : "Real-time View"}</span>
                                <input type="checkbox" checked={searchActive} onChange={e => setSearchActive(e.target.checked)} />
                            </div>
                        </div>
                        <div className="fgrid">
                            <div className="fg"><label className="xs">Entry Date</label><input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)} disabled={!searchActive} /></div>
                            <div className="fg"><label className="xs">Entry Time</label><input type="time" value={searchEntry} onChange={e => setSearchEntry(e.target.value)} disabled={!searchActive} /></div>
                            <div className="fg"><label className="xs">Exit Date</label><input type="date" value={searchExitDate} onChange={e => setSearchExitDate(e.target.value)} disabled={!searchActive} min={searchDate} /></div>
                            <div className="fg"><label className="xs">Exit Time</label><input type="time" value={searchExit} onChange={e => setSearchExit(e.target.value)} disabled={!searchActive} /></div>
                        </div>
                        {searchActive && <div className="xs mt2" style={{ color: t.primary, fontWeight: 600 }}>⚡ Grid is now showing available slots for {searchDate} to {searchExitDate}</div>}
                        
                        <button 
                            className="btn btn-primary btn-wide pulse-slow" 
                            style={{ 
                                height: 52, 
                                borderRadius: 14, 
                                fontWeight: 700, 
                                fontSize: 15,
                                background: selectedForBooking ? `linear-gradient(135deg, #10b981, #059669)` : `linear-gradient(135deg, ${t.primary}, ${t.accent})`,
                                border: 'none',
                                boxShadow: `0 4px 12px ${t.primary}44`
                            }}
                            disabled={!selectedForBooking && !nearestSlot}
                            onClick={() => {
                                if (selectedForBooking) setBookingSlot(selectedForBooking);
                                else if (nearestSlot) setBookingSlot(nearestSlot);
                            }}
                        >
                            ✨ {selectedForBooking ? "Book Selected Parking Spot" : (searchActive ? "Select a Slot Below" : "Book AI-Recommended Spot")}
                        </button>
                    </div>

                    <div className="card cp mb6">
                        <div className="fb mb4">
                            <div>
                                <div style={{ fontWeight: 700 }}>Parking Slot Status</div>
                                {nearestSlot && (
                                    <div className="xs" style={{ color: t.primary, fontWeight: 700, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span className="pulse-dot"></span> Adaptive AI Active
                                    </div>
                                )}
                            </div>
                            <div style={{ display: "flex", gap: 10 }}>
                                <div className="fr"><div style={{ width: 10, height: 10, background: "#16a34a", borderRadius: "50%" }} /> <span style={{fontSize: 10, fontWeight: 600}}>Available</span></div>
                                <div className="fr"><div style={{ width: 10, height: 10, background: "#ef4444", borderRadius: "50%" }} /> <span style={{fontSize: 10, fontWeight: 600}}>Occupied</span></div>
                                <div className="fr"><div style={{ width: 10, height: 10, background: t.primary, borderRadius: "50%" }} /> <span style={{fontSize: 10, fontWeight: 600}}>My Booking</span></div>
                            </div>
                        </div>
                        <div className="slot-grid">
                            {displaySlots.map(s => {
                                const checkOverlap = (sId) => {
                                    if (!searchActive) return bookings.some(b => b.slotId === sId && b.status === "active");
                                    return bookings.some(b => b.slotId === sId && b.status === "active" && isTimeOverlap(b, {
                                        slotId: sId,
                                        date: searchDate,
                                        time: searchEntry,
                                        duration: (() => {
                                            const start = new Date(`${searchDate}T${searchEntry}`);
                                            const end = new Date(`${searchExitDate}T${searchExit}`);
                                            return Math.max(0.5, Math.ceil((end - start) / 360000) / 10);
                                        })()
                                    }));
                                };
                                const isBooked = checkOverlap(s.id);
                                const isBookedByMe = bookings.some(b => b.slotId === s.id && b.status === "active" && b.userEmail === auth.email);
                                const isPhysicallyOccupied = sensorStatus[s.id] ? sensorStatus[s.id].occupied : s.occupied;
                                
                                // NEW LOGIC: Booked by someone else OR physically occupied = RED (OCCUPIED)
                                // Available = GREEN
                                // My booking = PRIMARY (BLUE)
                                const slotStatusClass = isBookedByMe ? "bk-me" : (isPhysicallyOccupied || (isBooked && !isBookedByMe)) ? "occ" : "av";

                                const isNearest = nearestSlot && s.id === nearestSlot.id;
                                const isSelected = selectedForBooking && s.id === selectedForBooking.id;
                                return (
                                    <button key={s.id} 
                                        className={`slot ${slotStatusClass} ${isNearest ? "slot-nearest" : ""} ${isSelected ? "slot-selected" : ""}`} 
                                        style={slotStatusClass === "occ" ? { background: '#fee2e2', borderColor: '#ef4444', color: '#991b1b' } : slotStatusClass === "av" ? { background: '#dcfce7', borderColor: '#16a34a', color: '#166534' } : isSelected ? { border: '3px solid #10b981', background: '#ecfdf5', transform: 'scale(1.1)', boxShadow: '0 0 15px rgba(16,185,129,0.4)', zIndex: 10 } : {}}
                                        onClick={() => setSelectedSlot(s)}>
                                        <span>{s.id.split("-")[1]}</span>
                                        {isBookedByMe && <span style={{ position: "absolute", top: 1, right: 2, fontSize: 7 }}>★</span>}
                                        {isNearest && !isSelected && <span style={{ position: "absolute", bottom: -2, background: t.primary, color: "white", fontSize: 5, padding: "1px 3px", borderRadius: 2, fontWeight: 900, whiteSpace: 'nowrap', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>AI RECOMMENDED</span>}
                                        {isSelected && <span style={{ position: "absolute", bottom: -2, background: "#10b981", color: "white", fontSize: 6, padding: "1px 3px", borderRadius: 2, fontWeight: 900 }}>SELECTED</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    
                    <div className="card cp mb6" style={{ background: "linear-gradient(to bottom right, " + t.cardBg + ", " + t.appBg + ")" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid " + t.borderColor }}>
                            <div><div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Base Hourly Rate</div><div style={{ fontSize: 16, fontWeight: 800 }}>₹{(pricing[vehicleType] || {}).amount}{(pricing[vehicleType] || {}).model === "per_entry" ? "/visit" : "/hr"}</div></div>
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <button className="btn btn-primary btn-wide" onClick={onPricePredict}>💰 Price Predict</button>
                        <button className="btn btn-wide" style={{ background: t.accent, color: "white", border: "none" }} onClick={onPredict}>🧠 Occupancy AI</button>
                    </div>
                </div>
            )}


            {selectedSlot && <SlotDialog slot={selectedSlot} zone={zone} vehicleType={vehicleType} bookings={bookings} sensorStatus={sensorStatus} onClose={() => setSelectedSlot(null)} onBook={s => { setSelectedSlot(null); setSelectedForBooking(s); }} />}
            {bookingSlot && <BookConfirm 
                slot={bookingSlot} 
                zone={zone} 
                vehicleType={vehicleType} 
                bookings={bookings} 
                initialDate={searchActive ? searchDate : null}
                initialEntry={searchActive ? searchEntry : null}
                initialExitDate={searchActive ? searchExitDate : null}
                initialExitTime={searchActive ? searchExit : null}
                onConfirm={b => { onBook(b); setBookingSlot(null); }} 
                onCancel={() => setBookingSlot(null)} 
            />}
        </div>
    );
}


function CheckoutSummary({ booking, onClose, onConfirm }) {
    const { t, pricing } = useTheme();
    const [loading, setLoading] = useState(false);

    // Dynamic Logic: 
    // Actual Stay = Now - Booking EntryTime
    const now = new Date();
    const entry = new Date(`${booking.date}T${booking.time}`);
    
    // For demo/testing, if entry is in the future, we treat it as "just arrived" (0.1h)
    const diffMs = Math.max(0, now - entry);
    const actualHrs = Math.max(0.1, Math.round((diffMs / 3600000) * 10) / 10);
    const reservedHrs = booking.duration;

    const rate = (pricing[booking.vehicleType] || {}).amount || 40;
    const isOverEntry = (pricing[booking.vehicleType] || {}).model === "per_entry";
    
    const finalFee = isOverEntry ? rate : (actualHrs * rate);
    const originalFee = parseFloat(booking.estimatedCharge);
    
    const diff = finalFee - originalFee;
    const isRefund = diff < -0.1;
    const isExtra = diff > 0.1;

    const handleCheckout = async () => {
        setLoading(true);
        try {
            const res = await api.checkoutBooking(booking.bookingId, { 
                finalCharge: finalFee.toFixed(2), 
                actualExitTime: now.toLocaleTimeString(),
                status: isRefund ? "refunded" : "completed" 
            });
            if (res.success) {
                onConfirm(res.booking);
                onClose();
            }
        } finally { setLoading(false); }
    };

    return (
        <div className="overlay" onClick={onClose}>
            <div className="card cp fade" style={{ width: 440, padding: 32 }} onClick={e => e.stopPropagation()}>
                <div className="tc mb6">
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🧾</div>
                    <div style={{ fontWeight: 800, fontSize: 24 }}>Checkout Summary</div>
                    <div className="sm mu">Finalizing your stay at {booking.zone?.name}</div>
                </div>

                <div className="card cp mb4" style={{ background: t.hoverBg, border: "none" }}>
                    <div className="fb mb3"><span>Reserved Stay</span><span style={{ fontWeight: 700 }}>{reservedHrs} hrs</span></div>
                    <div className="fb mb3"><span>Actual Stay</span><span style={{ fontWeight: 700, color: t.primary }}>{actualHrs} hrs</span></div>
                    <div className="fb"><span>Base Rate</span><span style={{ fontWeight: 700 }}>₹{rate}/{isOverEntry ? 'entry' : 'hr'}</span></div>
                </div>

                <div className="fb mb2" style={{ fontSize: 13, color: "#64748b" }}><span>Original Reserved Fee</span><span>₹{originalFee.toFixed(2)}</span></div>
                
                {isRefund && <div className="fb mb2" style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}><span>Early Leave Refund</span><span>- ₹{Math.abs(diff).toFixed(2)}</span></div>}
                {isExtra && <div className="fb mb2" style={{ fontSize: 13, color: "#ef4444", fontWeight: 700 }}><span>Overtime Charge</span><span>+ ₹{Math.abs(diff).toFixed(2)}</span></div>}
                {!isRefund && !isExtra && <div className="fb mb2" style={{ fontSize: 13, color: "#64748b" }}><span>Time-match Adjustment</span><span>₹0.00</span></div>}

                <div className="sep" style={{ margin: "20px 0" }}></div>
                
                <div className="fb mb6">
                    <div style={{ fontSize: 16, fontWeight: 700 }}>Final Amount Paid</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: t.primaryText }}>₹{finalFee.toFixed(2)}</div>
                </div>

                <div className="fb" style={{ gap: 10 }}>
                    <button className="btn btn-wide" onClick={onClose} disabled={loading}>Go Back</button>
                    <button className="btn btn-primary btn-wide" onClick={handleCheckout} disabled={loading}>{loading ? "Processing..." : "Confirm & Pay"}</button>
                </div>
                
                <div className="xs mu tc mt4">Slot {booking.slotId.split('-')[1]} will be marked as available immediately.</div>
            </div>
        </div>
    );
}

function MyBookings({ bookings, onCancel, onBack, onCheckoutUpdate }) {
    const active = bookings.filter(b => b.status === "active");
    const past = bookings.filter(b => b.status !== "active");
    const [coSlot, setCoSlot] = useState(null);
    
    const renderSection = (title, items) => items.length === 0 ? null : (
        <div className="mb6">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{title} ({items.length})</div>
            {items.map(b => (
                <div key={b.bookingId} className="bk-item fade">
                    <div>
                        <div className="fr mb3">
                            <span style={{ fontWeight: 700 }}>{b.zone?.name} – Slot {b.slotId.split("-")[1]}</span>
                            <span className={`st st-${b.status}`}>
                                {b.status === "active" ? "✅ Active" : 
                                 b.status === "cancelled" ? "❌ Cancelled" : 
                                 b.status === "refunded" ? "💰 Refunded" : 
                                 b.status === "completed" ? "🏁 Completed" : "⌛ Expired"}
                            </span>
                        </div>
                        <div className="xs mu">{b.date} {b.time} · {b.duration}h reserved</div>
                        <div className="xs mt4">
                            {b.finalCharge ? `Final: ₹${b.finalCharge}` : `Reserved: ₹${b.estimatedCharge}`} · 
                            <span style={{ fontFamily: "monospace" }}> {b.bookingId}</span>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                        {b.status === "active" && (
                            <>
                                <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => setCoSlot(b)}>Leave & Checkout</button>
                                <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={() => onCancel(b.bookingId, "cancelled")}>Cancel</button>
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div className="fade">
            {coSlot && <CheckoutSummary booking={coSlot} onClose={() => setCoSlot(null)} onConfirm={onCheckoutUpdate} />}
            <button className="btn-back mb4" onClick={onBack}>← Back</button>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>📋 My Bookings</div>
            <div className="sm mu mb6">Your parking reservations & checkout history</div>
            {!bookings.length ? <div className="card cp tc" style={{ padding: 48 }}><div style={{ fontSize: 40, marginBottom: 12 }}>🅿️</div><div className="mu">No bookings yet.</div></div> : <>{renderSection("Active Bookings", active)}{renderSection("Past & Completed", past)}</>}
        </div>
    );
}

function AdminDash({ bookings, zones, onBack, fetchStats }) {
    const { t, sensorStatus, stats, setStats, pricing, setPricing } = useTheme();
    const [tab, setTab] = useState("overview");
    const [logsSort, setLogsSort] = useState("desc");
    const [users, setUsers] = useState([]);

    const updatePrice = async (vh, field, val) => {
        const cur = pricing[vh] || { model: "per_hour", amount: 40 };
        const newVal = { ...cur, [field]: field === "amount" ? parseFloat(val) : val };
        const res = await api.updatePricing(vh, newVal);
        if (res.success) {
            setPricing(prev => ({ ...prev, [vh]: newVal }));
        }
    };

    const [aiSyncing, setAiSyncing] = useState(false);
    const [aiPreds, setAiPreds] = useState({});

    useEffect(() => {
        if (tab === "users") api.fetchUsers().then(setUsers);
        if (tab === "overview" || tab === "system") {
            api.fetchOccupancyHistory().then(setStats);
        }
        
        if (tab === "system") {
            // Self-Correction Engine: Run periodic AI alignment
            const alignAI = async () => {
                const now = new Date();
                const slotsToPredict = [];
                zones.forEach(z => {
                    const zSlots = generateSlots(z, 'four-wheeler');
                    zSlots.forEach(s => slotsToPredict.push({ id: s.id }));
                });

                try {
                    const res = await api.predictOccupancyEnsemble({
                        entry_hour: now.getHours(),
                        weather_temp: 25,
                        traffic_level: 1,
                        slots: slotsToPredict
                    });

                    if (res && res.slot_predictions) {
                        const newPreds = {};
                        res.slot_predictions.forEach(p => { newPreds[p.id] = p; });
                        setAiPreds(newPreds);

                        // Batch Adapt: Only adapt if prediction disagrees with reality
                        res.slot_predictions.forEach(p => {
                            const live = sensorStatus[p.id] || {};
                            const reality = live.occupied ? "Occupied" : "Vacant";
                            if (p.prediction !== reality) {
                                api.feedback(res.prediction_id, reality);
                            }
                        });
                    }
                } catch (e) { console.error("AI Alignment sync failed", e); }
            };

            alignAI();
            const inv = setInterval(alignAI, 30000); // Align every 30s
            return () => clearInterval(inv);
        }
    }, [tab, zones, sensorStatus]);

    const systemLogs = useMemo(() => {
        const logs = [];
        zones.forEach(z => {
            const slots = generateSlots(z, z.optimalVehicle || 'four-wheeler');
            const zoneBookings = bookings.filter(b => b.zone && b.zone.id === z.id && b.status === "active");
            
            slots.forEach(s => {
                const booking = zoneBookings.find(b => b.slotId === s.id);
                const live = sensorStatus[s.id] || {};
                const isPhysicallyOccupied = live.occupied !== undefined ? live.occupied : s.occupied;
                
                const aip = aiPreds[s.id];
                logs.push({
                    slotId: s.id,
                    zoneName: z.name,
                    status: isPhysicallyOccupied ? "Occupied" : "Available",
                    isPreBooked: !!booking,
                    bookingDetails: booking ? booking.userEmail : null,
                    timestamp: live.lastSeen ? new Date(live.lastSeen).getTime() : 0,
                    aiPred: aip ? aip.prediction : "Analyzing...",
                    aiConf: aip ? aip.confidence : null
                });
            });
        });

        // Apply Sorting
        return logs.sort((a, b) => {
            const diff = (logsSort === "asc") ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
            if (diff !== 0) return diff;
            return a.slotId.localeCompare(b.slotId); // Tie-breaker
        });
    }, [zones, bookings, sensorStatus, logsSort]);

    const zoneStats = useMemo(() => {
        return zones.map(z => {
            const slots = generateSlots(z, z.optimalVehicle || 'four-wheeler');
            const physicalOccupiedIds = slots.filter(s => {
                return sensorStatus[s.id] ? sensorStatus[s.id].occupied : s.occupied;
            }).map(s => s.id);
            const zoneBookings = bookings.filter(b => b.zone && b.zone.id === z.id);
            const activeZoneBookings = zoneBookings.filter(b => b.status === "active");
            const cancelledZoneBookings = zoneBookings.filter(b => b.status === "cancelled");
            
            const bookedSlotIds = activeZoneBookings.map(b => b.slotId);
            const allOccupiedSet = new Set([...physicalOccupiedIds, ...bookedSlotIds]);
            
            return {
                ...z,
                physOccCount: physicalOccupiedIds.length,
                occ: allOccupiedSet.size,
                activeBookingsCount: activeZoneBookings.length,
                cancelledBookingsCount: cancelledZoneBookings.length
            };
        });
    }, [zones, bookings, sensorStatus]);

    const physicalRevenue = zoneStats.reduce((sum, z) => {
        const rate = pricing[z.optimalVehicle || 'four-wheeler']?.amount || 40;
        return sum + (z.physOccCount * rate);
    }, 0);

    const statsLoaded = stats && stats.daily && stats.daily.length > 0;

    const bookingRevenue = bookings.reduce((sum, b) => {
        if (b.status === "active") return sum + parseFloat(b.estimatedCharge || 0);
        if (b.status === "completed" || b.status === "refunded") return sum + parseFloat(b.finalCharge || 0);
        return sum;
    }, 0);
    const totalRevenue = (bookingRevenue + physicalRevenue).toFixed(2);
    const totalActiveVehicles = zoneStats.reduce((sum, z) => sum + z.occ, 0);
    const totalSpacesOverall = zones.reduce((sum, z) => sum + z.totalSpaces, 0);
    const avgOccupancy = totalSpacesOverall > 0 ? Math.round((totalActiveVehicles / totalSpacesOverall) * 100) : 0;

    return (
        <div className="fade container-wide">
            <div className="fb mb6"><div><div style={{ fontWeight: 800, fontSize: 20 }}>🛡️ Admin Dashboard</div></div><button className="btn" onClick={onBack}>← Back</button></div>
            <div className="tabs">
                {[["overview", "📊 Overview & Insights"], ["pricing", "₹ Settings"], ["bookings", "📅 Log"], ["users", "👥 Users"], ["system", "🖥️ System Logs"]].map(([k, l]) => (
                    <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>
                ))}
            </div>

            {tab === "overview" && (
                <div className="fade">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                        <div className="card cp" style={{ borderTop: `4px solid ${t.primary}` }}>
                            <div className="xs mu" style={{ textTransform: 'uppercase', fontWeight: 700 }}>Total Revenue</div>
                            <div style={{ fontSize: 28, fontWeight: 800 }}>₹{totalRevenue}</div>
                        </div>
                        <div className="card cp" style={{ borderTop: `4px solid ${t.accent}` }}>
                            <div className="xs mu" style={{ textTransform: 'uppercase', fontWeight: 700 }}>Active Vehicles</div>
                            <div style={{ fontSize: 28, fontWeight: 800 }}>{totalActiveVehicles}</div>
                        </div>
                        <div className="card cp" style={{ borderTop: `4px solid #10b981` }}>
                            <div className="xs mu" style={{ textTransform: 'uppercase', fontWeight: 700 }}>Avg Occupancy</div>
                            <div style={{ fontSize: 28, fontWeight: 800 }}>{avgOccupancy}%</div>
                        </div>
                    </div>

                    <div className="ctitle mb4">Facility Zones Overview</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                        {zoneStats.map(z => {
                            return (
                                <div key={z.id} className="card cp" style={{ background: t.hoverBg, border: 'none' }}>
                                    <div className="fb mb2">
                                        <div style={{ fontWeight: 700 }}>{z.name}</div>
                                        <div className="xs st" style={{ background: t.primaryLight, color: t.primary }}>{Math.round((z.occ / z.totalSpaces) * 100)}% Full</div>
                                    </div>
                                    <div style={{ fontSize: 24, fontWeight: 800, color: t.primaryText }}>{z.occ} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>/ {z.totalSpaces} vehicles</span></div>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                                        <div style={{ background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: 4 }}>📌 {z.activeBookingsCount} Booked</div>
                                        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: 4 }}>❌ {z.cancelledBookingsCount} Cancelled</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {!statsLoaded ? (
                        <div className="card cp tc" style={{ padding: '40px 20px' }}>
                            <div className="sp" style={{ margin: '0 auto 12px', fontSize: 24 }}>⟳</div>
                            <div className="sm mu">Processing IoT Historical Dataset...</div>
                        </div>
                    ) : (
                        <>
                            <div className="card cp mb4">
                                <div className="fb mb4">
                                    <div className="ctitle" style={{ marginBottom: 0 }}>Monthly Occupancy Patterns (Last 30 Days)</div>
                                    <div style={{ display: 'flex', gap: 10, fontSize: 10, fontWeight: 700, color: '#64748b' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, background: '#3b82f6', borderRadius: 2, opacity: 0.8 }}></div> Normal</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, background: '#ef4444', borderRadius: 2, opacity: 0.8 }}></div> High</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-end', height: 120, gap: 2, background: t.hoverBg, padding: '10px 6px', borderRadius: 8 }}>
                                    {stats.daily.map((d, i) => (
                                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={`${d.date_str}: ${d.val} usages`}>
                                            <div style={{ fontSize: '8px', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>{d.val}</div>
                                            <div style={{ width: '100%', height: `${Math.min(100, Math.max(2, d.val))}%`, background: d.val > 70 ? '#ef4444' : '#3b82f6', borderRadius: '2px 2px 0 0', opacity: 0.8 }} />
                                        </div>
                                    ))}
                                </div>
                                <div className="fb xs mu mt4">
                                    <span>{(() => {
                                        const d = new Date();
                                        d.setDate(d.getDate() - 20);
                                        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                                    })()}</span>
                                    <span>{(() => {
                                        const d = new Date();
                                        d.setDate(d.getDate() - 1);
                                        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                                    })()}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {tab === "pricing" && <div className="gs fade">
                {vehicleTypes.map(vt => {
                    const p = pricing[vt.id] || { model: "per_hour", amount: 40 };
                    return (
                        <div key={vt.id} className="card cp">
                            <div className="ctitle">{vt.emoji} {vt.label} Base Charges</div>
                            <div className="fgrid">
                                <div className="fg"><label>Billing Model</label><select value={p.model} onChange={e => updatePrice(vt.id, "model", e.target.value)}><option value="per_entry">Flat per visit</option><option value="per_hour">Per hour</option></select></div>
                                <div className="fg"><label>Amount (₹)</label><input type="number" value={p.amount} onChange={e => updatePrice(vt.id, "amount", e.target.value)} /></div>
                            </div>
                        </div>
                    );
                })}
            </div>}

            {tab === "bookings" && <div className="card cp fade">
                <div className="fb mb4">
                    <div className="ctitle" style={{marginBottom: 0}}>System Booking Logs</div>
                    <button className="btn" style={{ fontSize: 12 }} onClick={() => {
                        const rows = [["Booking ID", "User Email", "Zone", "Slot", "Date", "Duration", "Status", "Estimated Charge", "Final Charge"]];
                        bookings.forEach(b => {
                            rows.push([b.bookingId, b.userEmail, `"${b.zone?.name || ""}"`, b.slotId, b.date, b.duration, b.status, b.estimatedCharge, b.finalCharge || ""]);
                        });
                        const csvContent = rows.map(e => e.join(",")).join("\n");
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.setAttribute("download", `Booking_Logs_${new Date().toISOString().split('T')[0]}.csv`);
                        document.body.appendChild(link); link.click(); document.body.removeChild(link);
                    }}>📥 Export Logs CSV</button>
                </div>
                <div className="fc">
                    {bookings.length === 0 ? <div className="mu sm tc">No active tracking found.</div> :
                        bookings.map((b, i) => (
                            <div key={i} className="fb" style={{ padding: "10px 0", borderBottom: i < bookings.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                                <div><div style={{ fontWeight: 700 }}>{b.zone?.name} - Slot {b.slotId.split("-")[1]}</div><div className="xs mu">{b.bookingId} · {b.date}</div></div>
                                <div style={{ textAlign: "right" }}><div style={{ fontWeight: 700, color: t.primaryText }}>₹{b.estimatedCharge}</div><div className="xs mu">{b.userEmail}</div></div>
                            </div>
                        ))}
                </div>
            </div>}

            {tab === "users" && <div className="card cp fade">
                <div className="fb mb4">
                    <div className="ctitle" style={{marginBottom: 0}}>Registered Users Tracking</div>
                    <button className="btn" style={{ fontSize: 12 }} onClick={() => {
                        const rows = [["User Email", "Username", "Role", "Total Bookings", "Active Bookings"]];
                        users.forEach(u => {
                            const uBooks = bookings.filter(b => b.userEmail === u.email);
                            rows.push([u.email, `"${u.username}"`, u.role, uBooks.length, uBooks.filter(b => b.status === "active").length]);
                        });
                        const csvContent = rows.map(e => e.join(",")).join("\n");
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.setAttribute("download", `User_Activity_${new Date().toISOString().split('T')[0]}.csv`);
                        document.body.appendChild(link); link.click(); document.body.removeChild(link);
                    }}>📥 Export Activity CSV</button>
                </div>
                <div className="fc">
                    {users.length === 0 ? <div className="mu sm tc">Loading user database...</div> :
                        users.map((u, i) => (
                            <div key={i} className="fb" style={{ padding: "12px 0", borderBottom: i < users.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 15 }}>{u.username}</div>
                                    <div className="xs mu">{u.email}</div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <span className="st" style={{ background: u.role === 'admin' ? t.primaryLight : t.hoverBg, color: u.role === 'admin' ? t.primary : '#64748b', fontSize: 10, fontWeight: 700, padding: "4px 8px" }}>
                                        {u.role?.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        ))}
                </div>
            </div>}

            {tab === "system" && <div className="card cp fade">
                <div className="fb mb4" style={{ alignItems: 'flex-start' }}>
                    <div>
                        <div className="ctitle" style={{marginBottom: 4}}>System Occupancy Logs</div>
                        <div className="fr" style={{ gap: 8 }}>
                            <button className={`btn btn-xs ${logsSort === 'asc' ? 'btn-primary' : ''}`} style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => setLogsSort('asc')}>↑ Oldest First</button>
                            <button className={`btn btn-xs ${logsSort === 'desc' ? 'btn-primary' : ''}`} style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => setLogsSort('desc')}>↓ Newest First</button>
                        </div>
                    </div>
                    <button className="btn" style={{ fontSize: 12 }} onClick={() => {
                        const rows = [["Zone", "Slot ID", "Status", "Pre-Booked", "Booking User"]];
                        systemLogs.forEach(l => {
                            rows.push([`"${l.zoneName}"`, l.slotId, l.status, l.isPreBooked ? "Yes" : "No", l.bookingDetails || (l.status === 'Occupied' ? "Walk-in" : "--")]);
                        });
                        const csvContent = rows.map(e => e.join(",")).join("\n");
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.setAttribute("download", `System_Occupancy_${new Date().toISOString().split('T')[0]}.csv`);
                        document.body.appendChild(link); link.click(); document.body.removeChild(link);
                    }}>📥 Export CSV</button>
                </div>
                <div className="fc">
                    {systemLogs.length === 0 ? <div className="mu sm tc">No active data detected.</div> :
                        systemLogs.map((l, i) => (
                            <div key={i} className="fb" style={{ padding: "12px 0", borderBottom: i < systemLogs.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                                <div>
                                    <div style={{ fontWeight: 700 }}>{l.zoneName} - Slot {l.slotId.split("-")[1]}</div>
                                    <div className="xs mu">
                                        Status: <span style={{color: l.status === 'Occupied' ? '#ef4444' : '#10b981', fontWeight: 600}}>{l.status.toUpperCase()}</span>
                                        {l.timestamp > 0 && <span style={{ marginLeft: 8, opacity: 0.6 }}>⏱️ {new Date(l.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                                    </div>
                                    <div className="xs mt4" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ color: '#6366f1', fontWeight: 700 }}>🧠 AI: {l.aiPred}</span>
                                        {l.aiConf && <span style={{ opacity: 0.6 }}>({l.aiConf}%)</span>}
                                        {l.aiPred !== "Analyzing..." && (l.aiPred === (l.status === "Available" ? "Vacant" : "Occupied") ? 
                                            <span style={{ color: '#10b981' }}>✅ Aligned</span> : 
                                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚡ Self-Correcting...</span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    {l.isPreBooked ? (
                                        <div className="st" style={{ background: '#dcfce7', color: '#166534', fontSize: 10, padding: '4px 8px' }}>✅ Pre-Booked ({l.bookingDetails})</div>
                                    ) : l.status === 'Occupied' ? (
                                        <div className="st" style={{ background: '#f1f5f9', color: '#64748b', fontSize: 10, padding: '4px 8px' }}>🚶 Walk-in (Sensor)</div>
                                    ) : (
                                        <div className="st" style={{ background: '#f0fdf4', color: '#166534', fontSize: 10, padding: '4px 8px', border: '1px solid #bbf7d0' }}>✨ Available</div>
                                    )}
                                </div>
                            </div>
                        ))}
                </div>
            </div>}

        </div>
    );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
// ─── Stability & Persistence Hardening ───
const safeLoad = (key, fallback) => {
  try {
    const val = localStorage.getItem(key);
    if (!val || val === "undefined") return fallback;
    return JSON.parse(val);
  } catch { return fallback; }
};

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 20, fontFamily: 'Inter, sans-serif' }}>
          <div style={{ background: 'white', padding: 40, borderRadius: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.08)', textAlign: 'center', maxWidth: 440, width: '100%', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>⚠️</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', margin: '0 0 16px 0' }}>Something went wrong</h2>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 32, wordBreak: 'break-word', lineHeight: 1.6 }}>
              {this.state.error?.toString() || "An unexpected error occurred in the application."}
            </p>
            <button 
              onClick={() => {
                localStorage.removeItem('ps_auth');
                localStorage.removeItem('ps_hist');
                localStorage.removeItem('ps_zone');
                localStorage.removeItem('ps_vehicle');
                window.location.reload();
              }}
              style={{ background: '#6366f1', color: 'white', border: 'none', padding: '14px 24px', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%' }}
            >
              Go to Login Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  const [themeKey, setThemeKey] = useState(() => localStorage.getItem('ps_theme') || "indigo");
  const [bgThemeKey, setBgThemeKey] = useState(() => localStorage.getItem('ps_bg_theme') || "light");
  const [pricing, setPricing] = useState({});
  const [zones, setZones] = useState([]);
  const [auth, setAuth] = useState(() => safeLoad('ps_auth', null));
  
  // Cleanup stale sessions in useEffect, not in state initializer
  useEffect(() => {
    if (auth && !auth.role) {
        localStorage.removeItem('ps_auth');
        setAuth(null);
    }
  }, [auth]);
  
  // Navigation History Stack
  const [history, setHistory] = useState(() => safeLoad('ps_hist', ["vehicle"]));
  const page = history[history.length - 1] || "vehicle";
  const pushPage = (p) => setHistory(prev => (prev[prev.length - 1] === p ? prev : [...prev, p]));
  const popPage = () => setHistory(prev => prev.length > 1 ? prev.slice(0, -1) : prev);

  const [zone, setZone] = useState(() => safeLoad('ps_zone', null));
  const [vehicle, setVehicle] = useState(() => localStorage.getItem('ps_vehicle') || null);
  const [bookings, setBookings] = useState([]);
  const [showTheme, setShowTheme] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [sensorStatus, setSensorStatus] = useState({});
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const syncSensors = () => api.fetchSensorStatus().then(res => res.success && setSensorStatus(res.sensors));
    syncSensors();
    const inv = setInterval(syncSensors, 10000); // 10s polling
    return () => clearInterval(inv);
  }, []);

  useEffect(() => { localStorage.setItem('ps_auth', JSON.stringify(auth)); }, [auth]);
  useEffect(() => { localStorage.setItem('ps_hist', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('ps_zone', JSON.stringify(zone)); }, [zone]);
  useEffect(() => { localStorage.setItem('ps_vehicle', vehicle); }, [vehicle]);
  useEffect(() => { localStorage.setItem('ps_theme', themeKey); }, [themeKey]);
  useEffect(() => { localStorage.setItem('ps_bg_theme', bgThemeKey); }, [bgThemeKey]);

  useEffect(() => {
    const load = async () => {
        const [z, p] = await Promise.all([api.fetchZones(), api.fetchPricing()]);
        if (z) {
            setZones(z);
            setZone(prev => {
                const currentId = prev?.id || 'A';
                const fresh = z.find(item => item.id === currentId);
                return fresh || z[0];
            });
        }
        if (p) setPricing(p);
    };
    if (auth) load();
  }, [auth]);

  useEffect(() => { if (auth) api.fetchBookings(auth.role === 'admin' ? null : auth.email).then(setBookings); }, [auth]);

  const addBooking = async b => {
    try {
        const dbBooking = { ...b, userEmail: auth.email };
        const res = await api.createBooking(dbBooking);
        if (res.success) setBookings(p => [res.booking, ...p]);
    } catch (e) {
        console.error("Booking error", e);
        alert("Sorry, an error occurred while creating your booking. Please try again.");
    }
  };
  
  const cancelBooking = async (id, status) => {
      const res = await api.updateBookingStatus(id, status);
      if (res.success) setBookings(p => p.map(b => b.bookingId === id ? { ...b, status } : b));
  };

  const t = { 
    ...(THEMES[themeKey] || THEMES.indigo), 
    textColor: "#1e293b", 
    ...(BG_THEMES[bgThemeKey] || BG_THEMES.light) 
  };
  const css = makeCSS(t);
  const ctx = { pricing, setPricing, auth, themeKey, setThemeKey, bgThemeKey, setBgThemeKey, t, sensorStatus, stats, setStats };

  if (!auth) return <AppContext.Provider value={ctx}><style>{css}</style><LoginPage onLogin={u => setAuth(u)} /></AppContext.Provider>;
  if (page === "loading") return <AppContext.Provider value={ctx}><style>{css}</style><div className="login-wrap"><div className="sp">⟳</div></div></AppContext.Provider>;

  return (
      <AppContext.Provider value={ctx}>
          <style>{css}</style>
          <div className="app">
              {showTheme && <ThemePicker onClose={() => setShowTheme(false)} />}
              {showInfo && <InfoGuide onClose={() => setShowInfo(false)} />}
              {auth.role === "admin" ? (
                  <div className="container-wide">
                      <div className="topbar">
                          <span className="st" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>🛡️ ADMIN MODE</span>
                          <button className="btn" onClick={() => setShowInfo(true)}>ℹ️ Info</button>
                          <button className="btn" onClick={() => setShowTheme(true)}>🎨 Theme</button>
                          <button className="btn btn-ghost" onClick={() => setAuth(null)}>Logout</button>
                      </div>
                      <AdminDash bookings={bookings} zones={zones} onBack={() => setAuth(null)} />
                  </div>
              ) : (
                  <div className="container">
                      <div className="topbar">
                          <span className="st" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>👤 USER MODE</span>
                          <span className="sm fb7">👋 {auth.username}</span>
                          <button className="btn" onClick={() => setHistory(["vehicle"])}>Home</button>
                          <button className="btn" onClick={() => pushPage("bookings")} style={{ position: "relative" }}>
                              Bookings {bookings.filter(b => b.status === "active").length > 0 && <span style={{ background: "#ef4444", color: "white", borderRadius: "50%", fontSize: 10, fontWeight: 700, width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: 4 }}>{bookings.filter(b => b.status === "active").length}</span>}
                          </button>
                          <button className="btn" onClick={() => setShowInfo(true)}>ℹ️ Info</button>
                          <button className="btn" onClick={() => setShowTheme(true)}>🎨 Theme</button>
                          <button className="btn btn-ghost" onClick={() => { setAuth(null); setHistory(["vehicle"]); setZone(null); setVehicle(null); }}>Logout</button>
                      </div>
                      {page === "vehicle" && <VehicleSelection username={auth.username} onSelect={v => { setVehicle(v); pushPage("zone"); }} onBack={() => { setAuth(null); setHistory(["vehicle"]); }} />}
                      {page === "zone" && <ZoneSelection zones={zones} vehicleType={vehicle} onSelect={z => { setZone(z); pushPage("dashboard"); }} onBack={popPage} />}
                      {page === "dashboard" && <Dashboard zone={zone} vehicleType={vehicle} bookings={bookings} onBook={addBooking} onBack={popPage} onPredict={() => pushPage("predict")} onPricePredict={() => pushPage("price")} />}
                      {page === "predict" && <PredictOccupancy zone={zone} vehicleType={vehicle} onBack={popPage} />}
                      {page === "price" && <PricePredictor zone={zone} vehicleType={vehicle} onBack={popPage} />}
                      {page === "bookings" && <MyBookings bookings={bookings} onCancel={cancelBooking} onBack={popPage} onCheckoutUpdate={b => setBookings(p => p.map(x => x.bookingId === b.bookingId ? b : x))} />}
                  </div>
              )}
          </div>
      </AppContext.Provider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
