/* ============================================================
   CRM Mejía — app.js
   Todo el estado vive en localStorage. Sin backend, sin build.
   ============================================================ */
(function(){
"use strict";

/* ---------------- Config ---------------- */
const STORAGE_KEY = "crmMejiaData_v1";
const CATEGORIES = ["Imprenta","PhotoBooth","Foto y Video","Web","Redes Sociales","Vinyl","Otro"];
const MONTHS_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DOW_ES = ["dom","lun","mar","mié","jue","vie","sáb"];

/* ---------------- State ---------------- */
let state = {
  clients: [],
  projects: [],
  view: "inicio",             // inicio | clients | clientDetail | calendar
  currentClientId: null,
  search: "",
  showCompleted: {},          // clientId -> bool
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth() // 0-11
};

/* ---------------- Storage ---------------- */
function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      state.clients = Array.isArray(parsed.clients) ? parsed.clients : [];
      state.projects = Array.isArray(parsed.projects) ? parsed.projects : [];
    }
  }catch(e){
    console.error("Error leyendo datos guardados", e);
  }
}
function saveData(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      clients: state.clients,
      projects: state.projects,
      savedAt: new Date().toISOString()
    }));
  }catch(e){
    console.error("Error guardando datos", e);
    toast("No se pudo guardar. Revisa el espacio de almacenamiento.", "err");
  }
}

/* ---------------- Utils ---------------- */
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function fmtDate(iso){
  if(!iso) return "";
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"});
}
function fmtRange(start,end){
  if(!start) return "Sin fecha";
  if(!end || end === start) return fmtDate(start);
  return `${fmtDate(start)} → ${fmtDate(end)}`;
}
function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function rangesOverlap(aStart,aEnd,bStart,bEnd){
  const ae = aEnd || aStart, be = bEnd || bStart;
  if(!aStart || !bStart) return false;
  return aStart <= be && bStart <= ae;
}
function toast(msg, kind){
  const host = document.getElementById("toastHost");
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(()=>{ el.style.opacity = "0"; el.style.transition="opacity .2s"; setTimeout(()=>el.remove(),200); }, 2400);
}
function clientById(id){ return state.clients.find(c=>c.id===id); }
function projectsForClient(id, includeCompleted){
  return state.projects
    .filter(p=>p.clientId===id && (includeCompleted || p.status !== "terminado"))
    .sort((a,b)=> (a.startDate||"").localeCompare(b.startDate||""));
}

/* ---------------- Money helpers ---------------- */
function balanceOf(p){
  const price = Number(p.price)||0, deposit = Number(p.deposit)||0;
  return price - deposit;
}
function fmtMoney(n){
  const v = Number(n)||0;
  return v.toLocaleString("es-MX", {style:"currency", currency:"MXN", maximumFractionDigits: v%1===0 ? 0 : 2});
}
function totalPendingForClient(clientId){
  return state.projects.filter(p=>p.clientId===clientId).reduce((sum,p)=>sum + Math.max(0, balanceOf(p)), 0);
}
function totalPendingGlobal(){
  return state.projects.reduce((sum,p)=>sum + Math.max(0, balanceOf(p)), 0);
}

/* ---------------- WhatsApp helper ---------------- */
function waLink(phone){
  const digits = String(phone||"").replace(/\D/g,"");
  if(!digits) return null;
  const withCountry = digits.length === 10 ? "52"+digits : digits;
  return `https://wa.me/${withCountry}`;
}

/* ---------------- Upcoming (próximos 7 días) ---------------- */
function addDaysISO(iso, days){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate()+days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
function getUpcoming(days){
  const today = todayISO();
  const limit = addDaysISO(today, days);
  return state.projects
    .filter(p => p.status !== "terminado" && p.startDate && p.startDate >= today && p.startDate <= limit)
    .sort((a,b)=> (a.startDate||"").localeCompare(b.startDate||""));
}

/* ---------------- Conflict detection ---------------- */
// Overlaps computed among ALL active ("activo") projects, across every client.
function computeConflicts(){
  const active = state.projects.filter(p => p.status !== "terminado" && p.startDate);
  const conflicts = []; // {a,b}
  for(let i=0;i<active.length;i++){
    for(let j=i+1;j<active.length;j++){
      const a = active[i], b = active[j];
      if(rangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)){
        conflicts.push({a,b});
      }
    }
  }
  return conflicts;
}
function conflictedProjectIds(conflicts){
  const set = new Set();
  conflicts.forEach(c=>{ set.add(c.a.id); set.add(c.b.id); });
  return set;
}

/* ---------------- Render root ---------------- */
function render(){
  const app = document.getElementById("app");
  document.querySelectorAll(".tab").forEach(t=>{
    t.classList.toggle("active", t.dataset.view === (state.view === "clientDetail" ? "clients" : state.view));
  });
  const conflicts = computeConflicts();
  const badge = document.getElementById("conflictBadge");
  if(conflicts.length){
    badge.textContent = conflicts.length;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
  const upcomingCount = getUpcoming(7).length;
  const upcomingBadge = document.getElementById("upcomingBadge");
  if(upcomingCount){
    upcomingBadge.textContent = upcomingCount;
    upcomingBadge.classList.remove("hidden");
  } else {
    upcomingBadge.classList.add("hidden");
  }

  if(state.view === "inicio") app.innerHTML = renderInicioView(conflicts);
  else if(state.view === "clients") app.innerHTML = renderClientsView();
  else if(state.view === "clientDetail") app.innerHTML = renderClientDetailView();
  else if(state.view === "calendar") app.innerHTML = renderCalendarView(conflicts);

  bindViewEvents();
}

/* ---------------- Inicio (dashboard) view ---------------- */
function renderInicioView(conflicts){
  if(state.clients.length === 0){
    return `
      <div class="empty-state">
        <h3>Bienvenido a CRM Mejía</h3>
        <p>Agrega tu primer cliente para empezar a registrar proyectos, cobros y fechas.</p>
        <button class="btn btn-primary" id="emptyNewClient">+ Nuevo cliente</button>
      </div>`;
  }

  const activeCount = state.projects.filter(p=>p.status!=="terminado").length;
  const pending = totalPendingGlobal();
  const upcoming = getUpcoming(7);

  const statCards = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${state.clients.length}</div>
        <div class="stat-label">Clientes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${activeCount}</div>
        <div class="stat-label">Proyectos activos</div>
      </div>
      <div class="stat-card ${pending>0?'stat-warn':''}">
        <div class="stat-value">${fmtMoney(pending)}</div>
        <div class="stat-label">Pendiente de cobro</div>
      </div>
      <div class="stat-card ${conflicts.length?'stat-danger':''}" id="statConflicts">
        <div class="stat-value">${conflicts.length}</div>
        <div class="stat-label">Fechas empalmadas</div>
      </div>
    </div>`;

  const upcomingHtml = upcoming.length ? upcoming.map(p=>{
    const c = clientById(p.clientId);
    const bal = balanceOf(p);
    return `
    <div class="upcoming-row" data-client="${p.clientId}">
      <div class="upcoming-date">
        <span class="upcoming-daynum">${p.startDate.slice(8,10)}</span>
        <span class="upcoming-monthabbr">${MONTHS_ES[Number(p.startDate.slice(5,7))-1].slice(0,3)}</span>
      </div>
      <div class="upcoming-main">
        <div class="upcoming-client">${escapeHtml(c?c.name:"?")}</div>
        <div class="upcoming-sub">${escapeHtml(p.title||p.category)} <span class="cat-chip" data-cat="${p.category}"><span class="cat-dot"></span>${p.category}</span></div>
      </div>
      ${bal>0 ? `<div class="upcoming-balance">${fmtMoney(bal)}<span>por cobrar</span></div>` : ""}
    </div>`;
  }).join("") : `<div class="empty-state" style="padding:32px 20px;"><h3>Nada agendado</h3><p>No tienes proyectos activos en los próximos 7 días.</p></div>`;

  return `
    <div class="section-head"><span class="section-title">Inicio</span></div>
    ${statCards}
    <div class="section-head" style="margin-top:26px;">
      <span class="section-title" style="font-size:19px;">Próximos 7 días</span>
    </div>
    <div class="upcoming-list">${upcomingHtml}</div>
  `;
}

/* ---------------- Clients list view ---------------- */
function renderClientsView(){
  const q = state.search.trim().toLowerCase();
  let clients = state.clients.slice().sort((a,b)=> (a.name||"").localeCompare(b.name||"", "es"));
  if(q){
    clients = clients.filter(c =>
      (c.name||"").toLowerCase().includes(q) ||
      (c.phone||"").toLowerCase().includes(q) ||
      (c.email||"").toLowerCase().includes(q) ||
      (c.address||"").toLowerCase().includes(q)
    );
  }

  if(state.clients.length === 0){
    return `
      <div class="empty-state">
        <h3>Todavía no hay clientes</h3>
        <p>Agrega tu primer cliente para empezar a registrar proyectos y fechas.</p>
        <button class="btn btn-primary" id="emptyNewClient">+ Nuevo cliente</button>
      </div>`;
  }

  const cards = clients.map(c => {
    const projects = state.projects.filter(p=>p.clientId===c.id && p.status !== "terminado");
    const cats = [...new Set(projects.map(p=>p.category))].slice(0,4);
    const totalActive = projects.length;
    const pending = totalPendingForClient(c.id);
    const wa = waLink(c.phone);
    return `
    <div class="client-card" data-id="${c.id}">
      <div class="client-card-name">${escapeHtml(c.name)}</div>
      ${c.phone ? `<div class="client-card-row">${iconPhone()}${escapeHtml(c.phone)}${wa?`<a href="${wa}" target="_blank" rel="noopener" class="wa-btn" title="Abrir WhatsApp" onclick="event.stopPropagation()">${iconWhatsapp()}</a>`:""}</div>` : ""}
      ${c.email ? `<div class="client-card-row">${iconMail()}${escapeHtml(c.email)}</div>` : ""}
      ${c.address ? `<div class="client-card-row">${iconPin()}${escapeHtml(c.address)}</div>` : ""}
      <div class="client-card-meta">
        <span class="client-card-projects">${totalActive} proyecto${totalActive===1?"":"s"} activo${totalActive===1?"":"s"}</span>
        <div class="chip-row">
          ${cats.map(cat=>`<span class="cat-chip" data-cat="${cat}"><span class="cat-dot"></span></span>`).join("")}
        </div>
      </div>
      ${pending>0 ? `<div class="client-card-pending">${fmtMoney(pending)} por cobrar</div>` : ""}
    </div>`;
  }).join("");

  return `
    <div class="section-head">
      <span class="section-title">Clientes</span>
      <span class="section-count">${clients.length} de ${state.clients.length}</span>
    </div>
    ${clients.length ? `<div class="client-grid">${cards}</div>` : `<div class="empty-state"><h3>Sin resultados</h3><p>No hay clientes que coincidan con “${escapeHtml(state.search)}”.</p></div>`}
  `;
}

/* ---------------- Client detail view ---------------- */
function renderClientDetailView(){
  const c = clientById(state.currentClientId);
  if(!c){
    state.view = "clients";
    return renderClientsView();
  }
  const showDone = !!state.showCompleted[c.id];
  const projects = projectsForClient(c.id, showDone);
  const conflicts = computeConflicts();
  const conflictIds = conflictedProjectIds(conflicts);
  const doneCount = state.projects.filter(p=>p.clientId===c.id && p.status==="terminado").length;

  const rows = projects.length ? projects.map(p => {
    const isDone = p.status === "terminado";
    const hasConflict = conflictIds.has(p.id);
    return `
    <div class="project-row ${isDone?'is-done':''} ${hasConflict?'has-conflict':''}" data-id="${p.id}">
      <div class="project-main">
        <div class="project-title">
          ${escapeHtml(p.title || "(sin título)")}
          <span class="cat-chip" data-cat="${p.category}"><span class="cat-dot"></span>${p.category}</span>
          ${hasConflict ? `<span class="conflict-flag">${iconAlert()} choca con otra fecha</span>` : ""}
        </div>
        <div class="project-dates">${iconCalSmall()} ${fmtRange(p.startDate, p.endDate)}</div>
        ${(Number(p.price)>0) ? `<div class="project-money">${fmtMoney(p.price)} total · ${fmtMoney(p.deposit)} anticipo${balanceOf(p)>0 ? ` · <strong>${fmtMoney(balanceOf(p))} pendiente</strong>` : ` · <span class="paid-tag">${iconCheck()} pagado</span>`}</div>` : ""}
        ${p.notes ? `<div class="project-notes">${escapeHtml(p.notes)}</div>` : ""}
      </div>
      <div class="project-actions">
        <button class="icon-btn ${isDone?'done-active':''}" data-action="toggle-done" data-id="${p.id}" title="${isDone?'Marcar como activo':'Marcar como terminado'}">${iconCheck()}</button>
        <button class="icon-btn" data-action="edit-project" data-id="${p.id}" title="Editar">${iconEdit()}</button>
        <button class="icon-btn" data-action="delete-project" data-id="${p.id}" title="Eliminar">${iconTrash()}</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty-state"><h3>Sin proyectos${showDone? '' : ' activos'}</h3><p>Agrega el primer proyecto para ${escapeHtml(c.name)}.</p></div>`;

  return `
    <button class="detail-back" id="backToClients">${iconBack()} Volver a clientes</button>

    <div class="detail-header">
      <div class="detail-header-info">
        <h2>${escapeHtml(c.name)}</h2>
        ${c.phone ? `<div class="detail-line">${iconPhone()}<a href="tel:${escapeHtml(c.phone)}" style="color:inherit;text-decoration:none;">${escapeHtml(c.phone)}</a>${waLink(c.phone)?`<a href="${waLink(c.phone)}" target="_blank" rel="noopener" class="wa-btn" title="Abrir WhatsApp">${iconWhatsapp()}</a>`:""}</div>` : ""}
        ${c.email ? `<div class="detail-line">${iconMail()}<a href="mailto:${escapeHtml(c.email)}" style="color:inherit;text-decoration:none;">${escapeHtml(c.email)}</a></div>` : ""}
        ${c.address ? `<div class="detail-line">${iconPin()}${escapeHtml(c.address)}</div>` : ""}
        ${c.notes ? `<div class="detail-notes">${escapeHtml(c.notes)}</div>` : ""}
        ${totalPendingForClient(c.id)>0 ? `<div class="detail-pending">${iconAlertSmall()} ${fmtMoney(totalPendingForClient(c.id))} pendiente de cobro</div>` : ""}
      </div>
      <div class="detail-actions">
        <button class="btn btn-ghost btn-sm" id="editClientBtn">${iconEdit()} Editar</button>
        <button class="btn btn-danger btn-sm" id="deleteClientBtn">${iconTrash()} Borrar</button>
      </div>
    </div>

    <div class="projects-head">
      <h3>Proyectos</h3>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        ${doneCount ? `
        <label class="toggle-line">
          <span class="switch"><input type="checkbox" id="toggleCompleted" ${showDone?'checked':''}><span class="switch-track"></span></span>
          <span class="toggle-label">Mostrar terminados (${doneCount})</span>
        </label>` : ""}
        <button class="btn btn-primary btn-sm" id="newProjectBtn">+ Nuevo proyecto</button>
      </div>
    </div>
    <div class="project-list">${rows}</div>
  `;
}

/* ---------------- Calendar view ---------------- */
function renderCalendarView(conflicts){
  const y = state.calYear, m = state.calMonth;
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();
  const today = todayISO();

  const active = state.projects.filter(p => p.status !== "terminado" && p.startDate);
  const conflictIds = conflictedProjectIds(conflicts);

  function projectsOnDay(iso){
    return active.filter(p => (p.startDate <= iso) && ((p.endDate || p.startDate) >= iso));
  }

  let cells = "";
  // leading days from previous month
  for(let i=startDow-1;i>=0;i--){
    const dayNum = daysInPrevMonth - i;
    cells += `<div class="cal-cell outside"><div class="cal-daynum">${dayNum}</div></div>`;
  }
  for(let d=1; d<=daysInMonth; d++){
    const iso = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dayProjects = projectsOnDay(iso);
    const hasConflict = dayProjects.length>1 && dayProjects.some(p=>conflictIds.has(p.id));
    const isToday = iso === today;
    const shown = dayProjects.slice(0,3);
    const extra = dayProjects.length - shown.length;
    cells += `
      <div class="cal-cell ${isToday?'today':''} ${hasConflict?'has-conflict':''}">
        <div class="cal-daynum">${d}</div>
        ${shown.map(p=>{
          const client = clientById(p.clientId);
          return `<div class="cal-chip" data-cat="${p.category}" style="background:color-mix(in srgb, var(--catc) 22%, white); color:var(--catc);" data-action="open-project-from-cal" data-project="${p.id}" title="${escapeHtml((client?client.name+' — ':'')+p.title)}">${escapeHtml(client?client.name:'')}</div>`;
        }).join("")}
        ${extra>0 ? `<div class="cal-more">+${extra} más</div>` : ""}
      </div>`;
  }
  // trailing days
  const totalCells = startDow + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for(let d=1; d<=trailing; d++){
    cells += `<div class="cal-cell outside"><div class="cal-daynum">${d}</div></div>`;
  }

  const conflictListHtml = conflicts.length ? conflicts.map(({a,b})=>{
    const ca = clientById(a.clientId), cb = clientById(b.clientId);
    return `
    <div class="conflict-item">
      <div>
        <div><span class="conflict-client">${escapeHtml(ca?ca.name:'?')}</span> — ${escapeHtml(a.title||a.category)} <span class="cat-chip" data-cat="${a.category}"><span class="cat-dot"></span>${a.category}</span></div>
        <div class="conflict-range">${fmtRange(a.startDate,a.endDate)}</div>
      </div>
      <div style="font-family:var(--font-mono);color:var(--stamp);font-weight:700;">↔</div>
      <div>
        <div><span class="conflict-client">${escapeHtml(cb?cb.name:'?')}</span> — ${escapeHtml(b.title||b.category)} <span class="cat-chip" data-cat="${b.category}"><span class="cat-dot"></span>${b.category}</span></div>
        <div class="conflict-range">${fmtRange(b.startDate,b.endDate)}</div>
      </div>
    </div>`;
  }).join("") : "";

  return `
    <div class="calendar-toolbar">
      <div class="month-nav">
        <button class="icon-btn" id="prevMonth">${iconChevronLeft()}</button>
        <span class="month-label">${MONTHS_ES[m]} ${y}</span>
        <button class="icon-btn" id="nextMonth">${iconChevronRight()}</button>
        <button class="btn btn-ghost btn-sm" id="todayBtn">Hoy</button>
      </div>
      <div class="legend">
        ${CATEGORIES.map(cat=>`<span class="legend-item"><span class="cat-dot" data-cat="${cat}" style="width:8px;height:8px;border-radius:50%;background:var(--catc);"></span>${cat}</span>`).join("")}
      </div>
    </div>
    <div class="cal-grid">
      ${DOW_ES.map(d=>`<div class="cal-dow">${d}</div>`).join("")}
      ${cells}
    </div>
    ${conflicts.length ? `
    <div class="conflict-panel">
      <h3>${iconAlert()} ${conflicts.length} fecha${conflicts.length===1?'':'s'} empalmada${conflicts.length===1?'':'s'}</h3>
      <p class="hint">Estos proyectos activos comparten días. Revísalos antes de confirmar.</p>
      ${conflictListHtml}
    </div>` : `
    <div class="no-conflicts">${iconCheck()} No hay fechas empalmadas entre tus proyectos activos.</div>
    `}
  `;
}

/* ---------------- Icons (inline SVG) ---------------- */
function iconPhone(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.9 21 3 13.1 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1L6.6 10.8z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;}
function iconMail(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M4 6.5l8 6 8-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
function iconPin(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.5 7-11.5A7 7 0 105 9.5C5 14.5 12 21 12 21z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.3" stroke="currentColor" stroke-width="1.7"/></svg>`;}
function iconBack(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
function iconEdit(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" style="width:15px;height:15px;"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 000-3L18 6a2.1 2.1 0 00-3 0L4.5 16.5V20z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;}
function iconTrash(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" style="width:15px;height:15px;"><path d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
function iconCheck(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" style="width:15px;height:15px;"><path d="M4 12.5l5 5L20 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
function iconAlert(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" style="width:15px;height:15px;"><path d="M12 3l10 18H2L12 3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>`;}
function iconCalSmall(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" style="width:13px;height:13px;"><rect x="3.5" y="5" width="17" height="15.5" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;}
function iconChevronLeft(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
function iconChevronRight(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
function iconWhatsapp(){return `<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style="width:15px;height:15px;"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.79.47 3.47 1.29 4.92L2 22l5.29-1.38a9.9 9.9 0 004.75 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.02c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.95-.31-1.63-.6-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.17-1.56-1.17-2.97 0-1.41.74-2.1 1-2.39.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.57.81 1.98.88 2.12.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.8.88-1.08.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z"/></svg>`;}
function iconAlertSmall(){return `<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" style="width:15px;height:15px;color:var(--stamp);"><path d="M12 3l10 18H2L12 3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/></svg>`;}

/* ---------------- Modal helpers ---------------- */
function openModal(innerHtml){
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-box">${innerHtml}</div></div>`;
  root.querySelector("#modalOverlay").addEventListener("click", (e)=>{
    if(e.target.id === "modalOverlay") closeModal();
  });
  document.querySelectorAll(".modal-close").forEach(b=>b.addEventListener("click", closeModal));
}
function closeModal(){
  document.getElementById("modalRoot").innerHTML = "";
}

/* ---------------- Client form modal ---------------- */
function openClientForm(existing){
  const c = existing || {name:"",phone:"",email:"",address:"",notes:""};
  openModal(`
    <div class="modal-head"><h3>${existing?"Editar cliente":"Nuevo cliente"}</h3><button class="modal-close">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <label>Nombre *</label>
        <input type="text" id="f_name" value="${escapeHtml(c.name)}" placeholder="Nombre del cliente">
        <div class="error-text" id="err_name">El nombre es obligatorio.</div>
      </div>
      <div class="form-row">
        <label>Teléfono</label>
        <input type="tel" id="f_phone" value="${escapeHtml(c.phone)}" placeholder="55 1234 5678">
      </div>
      <div class="form-row">
        <label>Correo</label>
        <input type="email" id="f_email" value="${escapeHtml(c.email)}" placeholder="cliente@correo.com">
      </div>
      <div class="form-row">
        <label>Dirección</label>
        <input type="text" id="f_address" value="${escapeHtml(c.address)}" placeholder="Calle, colonia, ciudad">
      </div>
      <div class="form-row">
        <label>Notas</label>
        <textarea id="f_notes" placeholder="Detalles, preferencias, referencias…">${escapeHtml(c.notes)}</textarea>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost modal-close">Cancelar</button>
      <button class="btn btn-primary" id="saveClientBtn">${existing?"Guardar cambios":"Crear cliente"}</button>
    </div>
  `);
  document.getElementById("saveClientBtn").addEventListener("click", ()=>{
    const name = document.getElementById("f_name").value.trim();
    if(!name){
      document.getElementById("f_name").classList.add("field-error");
      document.getElementById("err_name").classList.add("show");
      return;
    }
    const data = {
      name,
      phone: document.getElementById("f_phone").value.trim(),
      email: document.getElementById("f_email").value.trim(),
      address: document.getElementById("f_address").value.trim(),
      notes: document.getElementById("f_notes").value.trim()
    };
    if(existing){
      Object.assign(existing, data);
      toast("Cliente actualizado", "ok");
    } else {
      const newClient = {id: uid(), createdAt: new Date().toISOString(), ...data};
      state.clients.push(newClient);
      state.currentClientId = newClient.id;
      state.view = "clientDetail";
      toast("Cliente creado", "ok");
    }
    saveData();
    closeModal();
    render();
  });
}

/* ---------------- Quick add client modal ---------------- */
function openQuickAddClient(){
  openModal(`
    <div class="modal-head"><h3>Alta rápida</h3><button class="modal-close">&times;</button></div>
    <div class="modal-body">
      <p style="font-size:12.5px;color:var(--ink-soft);margin-top:0;">Captura lo básico ahora; completa dirección y notas después desde la ficha del cliente.</p>
      <div class="form-row">
        <label>Nombre *</label>
        <input type="text" id="q_name" placeholder="Nombre del cliente" autofocus>
        <div class="error-text" id="q_err">El nombre es obligatorio.</div>
      </div>
      <div class="form-row">
        <label>Teléfono</label>
        <input type="tel" id="q_phone" placeholder="55 1234 5678">
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost modal-close">Cancelar</button>
      <button class="btn btn-primary" id="quickSaveBtn">Crear cliente</button>
    </div>
  `);
  document.getElementById("q_name").focus();
  document.getElementById("quickSaveBtn").addEventListener("click", ()=>{
    const name = document.getElementById("q_name").value.trim();
    if(!name){
      document.getElementById("q_name").classList.add("field-error");
      document.getElementById("q_err").classList.add("show");
      return;
    }
    const newClient = {
      id: uid(), createdAt: new Date().toISOString(),
      name, phone: document.getElementById("q_phone").value.trim(),
      email:"", address:"", notes:""
    };
    state.clients.push(newClient);
    state.currentClientId = newClient.id;
    state.view = "clientDetail";
    saveData();
    closeModal();
    render();
    toast("Cliente creado — completa sus datos cuando puedas", "ok");
  });
}

/* ---------------- Project form modal ---------------- */
function openProjectForm(clientId, existing){
  const p = existing || {title:"",category:CATEGORIES[0],startDate:todayISO(),endDate:"",status:"activo",notes:"",price:"",deposit:""};
  openModal(`
    <div class="modal-head"><h3>${existing?"Editar proyecto":"Nuevo proyecto"}</h3><button class="modal-close">&times;</button></div>
    <div class="modal-body">
      <div class="form-row">
        <label>Título</label>
        <input type="text" id="p_title" value="${escapeHtml(p.title)}" placeholder="Ej. Boda Ana &amp; Luis, tarjetas de presentación…">
      </div>
      <div class="form-row">
        <label>Categoría</label>
        <div class="cat-select-grid" id="catGrid">
          ${CATEGORIES.map(cat=>`
            <label class="cat-option ${p.category===cat?'selected':''}" data-cat="${cat}">
              <input type="radio" name="p_category" value="${cat}" ${p.category===cat?'checked':''}>
              <span class="cat-dot"></span>${cat}
            </label>`).join("")}
        </div>
      </div>
      <div class="form-row form-grid2">
        <div>
          <label>Fecha inicio</label>
          <input type="date" id="p_start" value="${p.startDate||""}">
        </div>
        <div>
          <label>Fecha fin (opcional)</label>
          <input type="date" id="p_end" value="${p.endDate||""}">
        </div>
      </div>
      <div class="form-row form-grid2">
        <div>
          <label>Precio total</label>
          <input type="number" id="p_price" min="0" step="0.01" inputmode="decimal" value="${p.price ?? ""}" placeholder="0">
        </div>
        <div>
          <label>Anticipo</label>
          <input type="number" id="p_deposit" min="0" step="0.01" inputmode="decimal" value="${p.deposit ?? ""}" placeholder="0">
        </div>
      </div>
      <div class="form-row" id="balancePreview" style="display:none;">
        <label>Saldo pendiente</label>
        <div class="balance-preview" id="balancePreviewValue">$0</div>
      </div>
      <div class="form-row">
        <label>Estado</label>
        <div class="status-toggle" id="statusToggle">
          <label class="status-opt ${p.status==='activo'?'selected':''}" data-val="activo">
            <input type="radio" name="p_status" value="activo" ${p.status==='activo'?'checked':''}> Activo
          </label>
          <label class="status-opt ${p.status==='terminado'?'selected':''}" data-val="terminado">
            <input type="radio" name="p_status" value="terminado" ${p.status==='terminado'?'checked':''}> Terminado
          </label>
        </div>
      </div>
      <div class="form-row">
        <label>Notas</label>
        <textarea id="p_notes" placeholder="Detalles del proyecto…">${escapeHtml(p.notes)}</textarea>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost modal-close">Cancelar</button>
      <button class="btn btn-primary" id="saveProjectBtn">${existing?"Guardar cambios":"Crear proyecto"}</button>
    </div>
  `);

  function refreshBalancePreview(){
    const price = parseFloat(document.getElementById("p_price").value) || 0;
    const deposit = parseFloat(document.getElementById("p_deposit").value) || 0;
    const box = document.getElementById("balancePreview");
    const val = document.getElementById("balancePreviewValue");
    if(price>0){
      box.style.display = "";
      const bal = price - deposit;
      val.textContent = fmtMoney(bal);
      val.className = "balance-preview" + (bal>0 ? " is-due" : " is-paid");
    } else {
      box.style.display = "none";
    }
  }
  document.getElementById("p_price").addEventListener("input", refreshBalancePreview);
  document.getElementById("p_deposit").addEventListener("input", refreshBalancePreview);
  refreshBalancePreview();

  document.querySelectorAll("#catGrid .cat-option").forEach(opt=>{
    opt.addEventListener("click", ()=>{
      document.querySelectorAll("#catGrid .cat-option").forEach(o=>o.classList.remove("selected"));
      opt.classList.add("selected");
      opt.querySelector("input").checked = true;
    });
  });
  document.querySelectorAll("#statusToggle .status-opt").forEach(opt=>{
    opt.addEventListener("click", ()=>{
      document.querySelectorAll("#statusToggle .status-opt").forEach(o=>o.classList.remove("selected"));
      opt.classList.add("selected");
      opt.querySelector("input").checked = true;
    });
  });

  document.getElementById("saveProjectBtn").addEventListener("click", ()=>{
    const title = document.getElementById("p_title").value.trim();
    const category = document.querySelector('input[name="p_category"]:checked').value;
    const startDate = document.getElementById("p_start").value;
    let endDate = document.getElementById("p_end").value;
    const status = document.querySelector('input[name="p_status"]:checked').value;
    const notes = document.getElementById("p_notes").value.trim();
    const price = document.getElementById("p_price").value === "" ? "" : parseFloat(document.getElementById("p_price").value);
    const deposit = document.getElementById("p_deposit").value === "" ? "" : parseFloat(document.getElementById("p_deposit").value);

    if(endDate && startDate && endDate < startDate){
      toast("La fecha fin no puede ser antes de la fecha inicio", "err");
      return;
    }

    const data = {title, category, startDate, endDate, status, notes, price, deposit};
    if(existing){
      Object.assign(existing, data);
      toast("Proyecto actualizado", "ok");
    } else {
      state.projects.push({id: uid(), clientId, createdAt: new Date().toISOString(), ...data});
      toast("Proyecto creado", "ok");
    }
    saveData();
    closeModal();
    render();
  });
}

/* ---------------- Confirm delete modal ---------------- */
function openConfirm(title, message, onConfirm){
  openModal(`
    <div class="modal-head"><h3>${escapeHtml(title)}</h3><button class="modal-close">&times;</button></div>
    <div class="modal-body"><p style="font-size:14px;color:var(--ink-soft);line-height:1.5;">${message}</p></div>
    <div class="modal-foot">
      <button class="btn btn-ghost modal-close">Cancelar</button>
      <button class="btn btn-danger" id="confirmBtn">Sí, eliminar</button>
    </div>
  `);
  document.getElementById("confirmBtn").addEventListener("click", ()=>{
    onConfirm();
    closeModal();
  });
}

/* ---------------- CSV export ---------------- */
function csvEscape(v){
  const s = String(v ?? "");
  if(/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}
function exportCSV(){
  const headers = ["Cliente","Teléfono","Correo","Dirección","Proyecto","Categoría","Fecha inicio","Fecha fin","Estado","Precio","Anticipo","Saldo","Notas del proyecto"];
  const rows = [headers];
  const sortedClients = state.clients.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"","es"));
  sortedClients.forEach(c=>{
    const projects = state.projects.filter(p=>p.clientId===c.id);
    if(projects.length === 0){
      rows.push([c.name,c.phone,c.email,c.address,"","","","","","","","",""]);
    } else {
      projects.forEach(p=>{
        rows.push([
          c.name, c.phone, c.email, c.address,
          p.title, p.category, p.startDate||"", p.endDate||"",
          p.status==="terminado"?"Terminado":"Activo",
          p.price||"", p.deposit||"", (Number(p.price)>0? balanceOf(p):""),
          p.notes||""
        ]);
      });
    }
  });
  const csv = rows.map(r=>r.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `crm-mejia-clientes-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("CSV descargado", "ok");
}

/* ---------------- Backup modal ---------------- */
function openBackupModal(){
  const clientCount = state.clients.length;
  const projectCount = state.projects.length;
  openModal(`
    <div class="modal-head"><h3>Respaldo y restauración</h3><button class="modal-close">&times;</button></div>
    <div class="modal-body">
      <div class="backup-section">
        <h4>Exportar respaldo</h4>
        <p>Descarga un archivo .json con ${clientCount} cliente${clientCount===1?'':'s'} y ${projectCount} proyecto${projectCount===1?'':'s'}. Guárdalo en Drive, WhatsApp o correo para pasarlo a otro dispositivo.</p>
        <button class="btn btn-primary btn-block" id="exportBtn">${iconDownload()} Descargar respaldo (.json)</button>
      </div>
      <div class="backup-section">
        <h4>Exportar a Excel / CSV</h4>
        <p>Descarga una tabla .csv con todos tus clientes y proyectos — ábrela en Excel, Google Sheets o Numbers. Útil para cuentas o como respaldo legible.</p>
        <button class="btn btn-ghost btn-block" id="exportCsvBtn">${iconDownload()} Descargar CSV</button>
      </div>
      <div class="backup-section">
        <h4>Importar respaldo</h4>
        <p><strong>Esto reemplaza todos los datos actuales</strong> en este dispositivo con lo que traiga el archivo. Exporta primero si quieres conservar lo que tienes aquí.</p>
        <div class="file-drop" id="fileDrop">${iconUpload()}<div style="margin-top:6px;">Toca para elegir el archivo .json</div></div>
        <input type="file" id="fileInput" accept="application/json,.json" style="display:none;">
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost modal-close">Cerrar</button></div>
  `);

  document.getElementById("exportBtn").addEventListener("click", ()=>{
    const payload = {clients: state.clients, projects: state.projects, exportedAt: new Date().toISOString(), app:"CRM Mejía"};
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0,16).replace(/[-:T]/g,"").replace(/(\d{8})(\d{4})/,"$1-$2");
    a.href = url;
    a.download = `crm-mejia-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Respaldo descargado", "ok");
  });

  document.getElementById("exportCsvBtn").addEventListener("click", exportCSV);

  const fileDrop = document.getElementById("fileDrop");
  const fileInput = document.getElementById("fileInput");
  fileDrop.addEventListener("click", ()=>fileInput.click());
  fileInput.addEventListener("change", (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev)=>{
      try{
        const parsed = JSON.parse(ev.target.result);
        if(!Array.isArray(parsed.clients) || !Array.isArray(parsed.projects)){
          throw new Error("Formato inválido");
        }
        closeModal();
        openConfirm(
          "Reemplazar datos",
          `Vas a reemplazar los datos actuales con el respaldo (${parsed.clients.length} clientes, ${parsed.projects.length} proyectos). Esta acción no se puede deshacer.`,
          ()=>{
            state.clients = parsed.clients;
            state.projects = parsed.projects;
            state.view = "clients";
            state.currentClientId = null;
            saveData();
            render();
            toast("Datos restaurados", "ok");
          }
        );
      }catch(err){
        toast("El archivo no es un respaldo válido de CRM Mejía", "err");
      }
    };
    reader.readAsText(file);
  });
}
function iconDownload(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;}
function iconUpload(){return `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" style="margin:0 auto;"><path d="M12 15V3m0 0l-4.5 4.5M12 3l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;}

/* ---------------- Event binding ---------------- */
function bindViewEvents(){
  // Inicio view
  document.querySelectorAll(".upcoming-row").forEach(row=>{
    row.addEventListener("click", ()=>{
      state.currentClientId = row.dataset.client;
      state.view = "clientDetail";
      render();
      window.scrollTo({top:0,behavior:"smooth"});
    });
  });
  const statConflicts = document.getElementById("statConflicts");
  if(statConflicts) statConflicts.addEventListener("click", ()=>{
    state.view = "calendar";
    render();
    window.scrollTo({top:0});
  });

  // Clients view
  document.querySelectorAll(".client-card").forEach(card=>{
    card.addEventListener("click", ()=>{
      state.currentClientId = card.dataset.id;
      state.view = "clientDetail";
      render();
      window.scrollTo({top:0,behavior:"smooth"});
    });
  });
  const emptyBtn = document.getElementById("emptyNewClient");
  if(emptyBtn) emptyBtn.addEventListener("click", ()=>openClientForm(null));

  // Client detail view
  const backBtn = document.getElementById("backToClients");
  if(backBtn) backBtn.addEventListener("click", ()=>{ state.view="clients"; render(); window.scrollTo({top:0}); });

  const editClientBtn = document.getElementById("editClientBtn");
  if(editClientBtn) editClientBtn.addEventListener("click", ()=>openClientForm(clientById(state.currentClientId)));

  const deleteClientBtn = document.getElementById("deleteClientBtn");
  if(deleteClientBtn) deleteClientBtn.addEventListener("click", ()=>{
    const c = clientById(state.currentClientId);
    const n = state.projects.filter(p=>p.clientId===c.id).length;
    openConfirm("Borrar cliente", `Se eliminará <strong>${escapeHtml(c.name)}</strong> y sus ${n} proyecto${n===1?'':'s'}. Esta acción no se puede deshacer.`, ()=>{
      state.projects = state.projects.filter(p=>p.clientId!==c.id);
      state.clients = state.clients.filter(cl=>cl.id!==c.id);
      state.view = "clients";
      state.currentClientId = null;
      saveData();
      render();
      toast("Cliente eliminado", "ok");
    });
  });

  const toggleCompleted = document.getElementById("toggleCompleted");
  if(toggleCompleted) toggleCompleted.addEventListener("change", (e)=>{
    state.showCompleted[state.currentClientId] = e.target.checked;
    render();
  });

  const newProjectBtn = document.getElementById("newProjectBtn");
  if(newProjectBtn) newProjectBtn.addEventListener("click", ()=>openProjectForm(state.currentClientId, null));

  document.querySelectorAll('[data-action="toggle-done"]').forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const p = state.projects.find(pr=>pr.id===btn.dataset.id);
      p.status = p.status==="terminado" ? "activo" : "terminado";
      saveData();
      render();
      toast(p.status==="terminado" ? "Proyecto marcado como terminado" : "Proyecto reactivado", "ok");
    });
  });
  document.querySelectorAll('[data-action="edit-project"]').forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const p = state.projects.find(pr=>pr.id===btn.dataset.id);
      openProjectForm(state.currentClientId, p);
    });
  });
  document.querySelectorAll('[data-action="delete-project"]').forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const p = state.projects.find(pr=>pr.id===btn.dataset.id);
      openConfirm("Borrar proyecto", `Se eliminará el proyecto <strong>${escapeHtml(p.title||p.category)}</strong>.`, ()=>{
        state.projects = state.projects.filter(pr=>pr.id!==p.id);
        saveData();
        render();
        toast("Proyecto eliminado", "ok");
      });
    });
  });

  // Calendar view
  const prevMonth = document.getElementById("prevMonth");
  if(prevMonth) prevMonth.addEventListener("click", ()=>{
    state.calMonth--; if(state.calMonth<0){state.calMonth=11;state.calYear--;}
    render();
  });
  const nextMonth = document.getElementById("nextMonth");
  if(nextMonth) nextMonth.addEventListener("click", ()=>{
    state.calMonth++; if(state.calMonth>11){state.calMonth=0;state.calYear++;}
    render();
  });
  const todayBtn = document.getElementById("todayBtn");
  if(todayBtn) todayBtn.addEventListener("click", ()=>{
    const d = new Date();
    state.calYear = d.getFullYear();
    state.calMonth = d.getMonth();
    render();
  });
  document.querySelectorAll('[data-action="open-project-from-cal"]').forEach(chip=>{
    chip.addEventListener("click", ()=>{
      const p = state.projects.find(pr=>pr.id===chip.dataset.project);
      if(!p) return;
      state.currentClientId = p.clientId;
      state.view = "clientDetail";
      state.showCompleted[p.clientId] = p.status === "terminado";
      render();
      window.scrollTo({top:0,behavior:"smooth"});
    });
  });
}

/* ---------------- Global chrome events ---------------- */
function bindChrome(){
  document.querySelectorAll(".tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      state.view = tab.dataset.view;
      if(state.view === "clients" || state.view === "inicio") state.currentClientId = null;
      render();
      window.scrollTo({top:0});
    });
  });
  document.getElementById("btnNewClient").addEventListener("click", ()=>openClientForm(null));
  document.getElementById("btnQuickAdd").addEventListener("click", openQuickAddClient);
  document.getElementById("btnBackup").addEventListener("click", openBackupModal);
  const search = document.getElementById("searchInput");
  search.addEventListener("input", (e)=>{
    state.search = e.target.value;
    if(state.view !== "clients"){ state.view = "clients"; state.currentClientId = null; }
    render();
  });
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape") closeModal();
  });
}

/* ---------------- PWA: service worker ---------------- */
function registerServiceWorker(){
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>{
      navigator.serviceWorker.register("./sw.js").catch(err=>{
        console.warn("No se pudo registrar el service worker", err);
      });
    });
  }
}

/* ---------------- Init ---------------- */
loadData();
bindChrome();
render();
registerServiceWorker();

})();
