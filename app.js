const urlInput = document.getElementById('url');
const loadForm = document.getElementById('loadForm');
const searchForm = document.getElementById('searchForm');
const q = document.getElementById('q');
const statusEl = document.getElementById('status');
const docMeta = document.getElementById('docMeta');
const titleBox = document.getElementById('titleBox');
const outline = document.getElementById('outline');
const hits = document.getElementById('hits');
const pager = document.getElementById('pager');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const pageLabel = document.getElementById('pageLabel');
const caseSensitive = document.getElementById('caseSensitive');
const wholeWord = document.getElementById('wholeWord');

let paragraphs = []; // texto dividido en párrafos
let sourceUrl = "";
let results = [];
let pageIdx = 0;
const pageSize = 12;

loadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  resetUI();
  sourceUrl = urlInput.value.trim();
  if (!sourceUrl) return;

  statusEl.textContent = "Extrayendo contenido…";
  try {
    const res = await fetch(`/api/extract?url=${encodeURIComponent(sourceUrl)}`);
    if (!res.ok) throw new Error('No se pudo extraer el contenido.');
    const data = await res.json();

    const title = data.title || '(Sin título)';
    const text = (data.textContent || '').replace(/\r/g,'').trim();
    paragraphs = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);

    titleBox.textContent = title;
    docMeta.textContent = `${new URL(sourceUrl).hostname} — ${paragraphs.length} párrafos — ${text.length.toLocaleString()} caracteres`;
    outline.innerHTML = "";
    paragraphs.slice(0, 200).forEach((p, i) => {
      const li = document.createElement('li');
      li.textContent = p.slice(0, 140) + (p.length > 140 ? '…' : '');
      outline.appendChild(li);
    });

    statusEl.textContent = "Listo. Escribe tu consulta y presiona Buscar.";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error al cargar el enlace. Revisa que el sitio permita ser leído.";
  }
});

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch();
});

function resetUI(){
  paragraphs = []; results = []; pageIdx = 0;
  hits.innerHTML = ""; pager.classList.add('hidden'); outline.innerHTML = "";
  titleBox.textContent = ""; docMeta.textContent = ""; statusEl.textContent = "";
}

// -------- Buscador (igual que antes, con frases/OR/exclusión/*) -------
function parseQuery(s){
  const tokens = []; const re = /"([^"]+)"|(\S+)/g; let m;
  while ((m = re.exec(s)) !== null) tokens.push(m[1] ? {type:'phrase', value:m[1]} : {type:'plain', value:m[2]});

  const must=[], should=[], not=[]; let hasOr=false;
  for (let i=0;i<tokens.length;i++){
    const t=tokens[i];
    if (t.type==='plain' && t.value.toUpperCase()==='OR'){ hasOr=true; continue; }
    const neg = t.type==='plain' && t.value.startsWith('-');
    const raw = neg ? t.value.slice(1) : t.value;
    const wildcard = /\*$/.test(raw);
    const value = wildcard ? raw.slice(0,-1) : raw;
    const term = {type:t.type, value, wildcard};
    if (neg) not.push(term);
    else if (hasOr){ should.push(term); hasOr=false; }
    else must.push(term);
  }
  return {must, should, not};
}
function termToRegExp(term){
  const flags = caseSensitive.checked ? "g" : "gi";
  const esc = (s)=> s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  if (term.type==='phrase'){
    const inner = wholeWord.checked ? `\\b${esc(term.value)}\\b` : esc(term.value);
    return new RegExp(inner, flags);
  } else {
    let inner = esc(term.value);
    if (term.wildcard) inner = `${inner}\\w*`;
    if (wholeWord.checked) inner = `\\b${inner}\\b`;
    return new RegExp(inner, flags);
  }
}
function matchParagraph(p, qobj){
  const mustR = qobj.must.map(termToRegExp);
  const shouldR = qobj.should.map(termToRegExp);
  const notR = qobj.not.map(termToRegExp);

  for (const r of notR){ if (r.test(p)) return null; }
  for (const r of mustR){ if (!r.test(p)) return null; }

  const markers = [...mustR, ...shouldR];
  if (markers.length===0) return null;

  let html = p;
  for (const r of markers){ r.lastIndex=0; html = html.replace(r, s=>`<mark>${s}</mark>`); }
  return html;
}
function runSearch(){
  const query = q.value.trim();
  hits.innerHTML = ""; results = []; pageIdx = 0;
  if (!paragraphs.length){ statusEl.textContent = "Primero carga un enlace válido."; return; }
  if (!query){ statusEl.textContent = "Escribe una consulta."; return; }

  statusEl.textContent = "Buscando…";
  const qobj = parseQuery(query);

  paragraphs.forEach((p, idx) => {
    const html = matchParagraph(p, qobj);
    if (html) results.push({idx, html, raw: p});
  });

  statusEl.textContent = results.length ? `Coincidencias: ${results.length}` : "Sin coincidencias.";
  renderPage();
}
function renderPage(){
  hits.innerHTML = "";
  if (!results.length){ pager.classList.add('hidden'); return; }
  pager.classList.remove('hidden');
  const start = pageIdx*pageSize;
  const slice = results.slice(start, start+pageSize);
  slice.forEach(r=>{
    const div = document.createElement('div');
    div.className="hit";
    div.innerHTML = `<div class="loc">Párrafo ${r.idx+1} — <a href="${sourceUrl}" target="_blank" rel="noopener">abrir fuente</a></div>
                     <div class="snippet">${r.html}</div>`;
    hits.appendChild(div);
  });
  prevBtn.disabled = pageIdx===0;
  nextBtn.disabled = (start+pageSize)>=results.length;
  pageLabel.textContent = `Página de resultados ${pageIdx+1} / ${Math.ceil(results.length/pageSize)}`;
}
prevBtn.addEventListener('click', ()=>{ pageIdx=Math.max(0,pageIdx-1); renderPage(); });
nextBtn.addEventListener('click', ()=>{ const max=Math.ceil(results.length/pageSize)-1; pageIdx=Math.min(max,pageIdx+1); renderPage(); });
