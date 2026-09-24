'use strict';
const { $, $$, esc, obavijest, spremi, dropzona, lokalno } = AB;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

let bajtovi = null, pdf = null, imeDat = '';
let str = [];        // { el, vp1 (viewport za scale 1, s rotacijom), rot }
let stavke = [];     // { id, str, fx, fy, fw, omjer, url, el }
let brojac = 0, aktivna = 0;
const KLJUC = 'pdf-potpis-spremljeni';
let spremljeni = lokalno.uzmi(KLJUC, []);
if (spremljeni.length) $('#zapamti').checked = true;

// ================= učitavanje i crtanje stranica =================
async function ucitaj([f]) {
  if (!f || !(f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) return obavijest('Odaberi PDF datoteku.');
  bajtovi = new Uint8Array(await f.arrayBuffer());
  try { pdf = await pdfjsLib.getDocument({ data: bajtovi.slice() }).promise; }
  catch (e) { return obavijest(e.name === 'PasswordException' ? 'PDF je zaštićen lozinkom.' : 'PDF se ne može otvoriti.'); }
  imeDat = f.name;
  $('#ime').value = f.name.replace(/\.pdf$/i, '') + '-potpisano.pdf';
  stavke = []; str = [];
  $('#drop').hidden = true; $('#radno').hidden = false;
  $('#stranice').innerHTML = '';
  crtajBlok.postavi();
  for (let i = 1; i <= pdf.numPages; i++) {
    const s = await pdf.getPage(i);
    const vp1 = s.getViewport({ scale: 1 });
    const el = document.createElement('div');
    el.className = 'stranica';
    el.dataset.i = i - 1;
    el.innerHTML = `<span class="broj">Stranica ${i} / ${pdf.numPages}</span>`;
    el.style.aspectRatio = `${vp1.width} / ${vp1.height}`;
    el.style.width = Math.min(860, vp1.width * 1.4) + 'px';
    $('#stranice').appendChild(el);
    str.push({ el, vp1, stranica: s, nacrtano: false });
  }
  promatrac();
  oznaciAktivnu(0);
}

// stranice se iscrtavaju tek kad dođu u vidno polje
let io;
function promatrac() {
  io?.disconnect();
  io = new IntersectionObserver(zapisi => {
    for (const z of zapisi) {
      const i = +z.target.dataset.i;
      if (z.isIntersecting) { iscrtaj(i); if (z.intersectionRatio > .4) oznaciAktivnu(i); }
    }
  }, { rootMargin: '400px 0px', threshold: [0, .4, .8] });
  str.forEach(s => io.observe(s.el));
}
async function iscrtaj(i) {
  const s = str[i];
  if (s.nacrtano) return;
  s.nacrtano = true;
  const sirina = s.el.clientWidth * Math.min(2, devicePixelRatio || 1);
  const vp = s.stranica.getViewport({ scale: sirina / s.vp1.width });
  const c = document.createElement('canvas');
  c.width = vp.width; c.height = vp.height;
  await s.stranica.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  s.el.prepend(c);
}
function oznaciAktivnu(i) {
  aktivna = i;
  str.forEach((s, k) => s.el.classList.toggle('aktivna', k === i));
}
$('#stranice').addEventListener('pointerdown', e => { const s = e.target.closest('.stranica'); if (s) oznaciAktivnu(+s.dataset.i); });

// ================= izvori potpisa =================
$$('input[name="vrsta"]').forEach(r => r.addEventListener('change', () => {
  for (const v of ['crtaj', 'slika', 'tekst']) $('.v-' + v).hidden = r.value !== v;
  if (r.value === 'crtaj') crtajBlok.postavi();
}));

// obreži prozirne rubove
function obrezi(c) {
  const x = c.getContext('2d'), { width: w, height: h } = c;
  const d = x.getImageData(0, 0, w, h).data;
  let a = w, b = h, cc = -1, dd = -1;
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    if (d[(y * w + xx) * 4 + 3] > 8) { if (xx < a) a = xx; if (xx > cc) cc = xx; if (y < b) b = y; if (y > dd) dd = y; }
  }
  if (cc < 0) return null;
  const p = 6, o = document.createElement('canvas');
  o.width = cc - a + 1 + 2 * p; o.height = dd - b + 1 + 2 * p;
  o.getContext('2d').drawImage(c, a - p, b - p, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}

const crtajBlok = (() => {
  const c = $('#blok');
  let x, crta = false, tocke = [], prazno = true;
  function postavi() {
    const r = c.getBoundingClientRect();
    if (!r.width) return;
    const k = 2;
    if (c.width === Math.round(r.width * k)) return;
    c.width = Math.round(r.width * k); c.height = Math.round(r.height * k);
    x = c.getContext('2d');
    x.scale(k, k);
    x.lineCap = x.lineJoin = 'round';
    prazno = true;
  }
  const poz = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  c.addEventListener('pointerdown', e => {
    postavi();
    c.setPointerCapture(e.pointerId);
    crta = true; tocke = [poz(e)];
    x.strokeStyle = x.fillStyle = $('input[name="boja"]:checked').value;
    x.lineWidth = +$('#debljina').value;
    x.beginPath(); x.arc(tocke[0][0], tocke[0][1], x.lineWidth / 2, 0, Math.PI * 2); x.fill();
    prazno = false;
  });
  c.addEventListener('pointermove', e => {
    if (!crta) return;
    tocke.push(poz(e));
    if (tocke.length < 3) return;
    const [a, b, d] = tocke.slice(-3);
    x.beginPath();
    x.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    x.quadraticCurveTo(b[0], b[1], (b[0] + d[0]) / 2, (b[1] + d[1]) / 2);
    x.stroke();
  });
  const kraj = () => { crta = false; };
  c.addEventListener('pointerup', kraj);
  c.addEventListener('pointercancel', kraj);
  $('#brisiBlok').onclick = () => { x?.clearRect(0, 0, c.width, c.height); prazno = true; };
  window.addEventListener('resize', () => { if (prazno) { c.width = 0; postavi(); } });
  return { postavi, slika: () => prazno ? null : obrezi(c), ocisti: () => $('#brisiBlok').onclick() };
})();

let ucitanaSlika = null;
dropzona($('#dropSlika'), async ([f]) => {
  if (!f?.type.startsWith('image/')) return obavijest('Odaberi sliku.');
  ucitanaSlika = await createImageBitmap(f);
  pripremiSliku();
}, { accept: 'image/*', visestruko: false });
$('#makniBijelo').addEventListener('change', () => ucitanaSlika && pripremiSliku());
let pripremljenaSlika = null;
function pripremiSliku() {
  const k = Math.min(1, 1200 / Math.max(ucitanaSlika.width, ucitanaSlika.height));
  const c = document.createElement('canvas');
  c.width = Math.round(ucitanaSlika.width * k); c.height = Math.round(ucitanaSlika.height * k);
  const x = c.getContext('2d');
  x.drawImage(ucitanaSlika, 0, 0, c.width, c.height);
  if ($('#makniBijelo').checked) {
    const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const svj = Math.min(d[i], d[i + 1], d[i + 2]);
      if (svj > 225) d[i + 3] = 0;
      else if (svj > 180) d[i + 3] = Math.round(d[i + 3] * (225 - svj) / 45);
    }
    x.putImageData(im, 0, 0);
  }
  pripremljenaSlika = obrezi(c) || c;
  $('#pregledSlike').innerHTML = `<img src="${pripremljenaSlika.toDataURL('image/png')}" alt="Pregled">`;
}

function tekstSlika() {
  const t = $('#tekst').value.trim();
  if (!t) return null;
  const c = document.createElement('canvas'), x = c.getContext('2d'), vel = 72;
  const font = `${$('#font').selectedIndex === 0 ? '' : '600 '}${vel}px ${$('#font').value}`;
  x.font = font;
  const redovi = t.split('\n'), w = Math.max(...redovi.map(r => x.measureText(r).width));
  c.width = Math.ceil(w) + 20; c.height = Math.ceil(vel * 1.35 * redovi.length) + 20;
  x.font = font; x.fillStyle = $('input[name="boja"]:checked')?.value || '#111827'; x.textBaseline = 'top';
  redovi.forEach((r, i) => x.fillText(r, 10, 10 + i * vel * 1.35));
  return obrezi(c);
}
$('#danas').onclick = () => {
  const d = new Date().toLocaleDateString('hr-HR', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const t = $('#tekst');
  t.value = t.value ? `${t.value.trim()}, ${d}` : d;
};

// ================= stavke na stranici =================
function dodajStavku(url, sirinaPx, visinaPx) {
  const s = str[aktivna];
  if (!s) return;
  const W = s.el.clientWidth, H = s.el.clientHeight;
  const omjer = sirinaPx / visinaPx;
  const fw = Math.min(.35, (W * .35) / W, (H * .12 * omjer) / W);
  const st = { id: ++brojac, str: aktivna, fx: .5 - fw / 2, fy: .75, fw, omjer, url };
  stavke.push(st);
  postaviStavku(st);
  s.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function postaviStavku(st) {
  const s = str[st.str];
  if (!st.el) {
    st.el = document.createElement('div');
    st.el.className = 'stavka';
    st.el.innerHTML = `<img src="${st.url}" alt=""><span class="ruckica"></span><button type="button" class="x" aria-label="Ukloni">×</button>`;
    st.el.querySelector('.x').onclick = e => { e.stopPropagation(); st.el.remove(); stavke = stavke.filter(x => x !== st); };
    pomicanje(st);
    s.el.appendChild(st.el);
  }
  const W = s.el.clientWidth, H = s.el.clientHeight;
  const w = st.fw * W, h = w / st.omjer;
  st.fx = Math.max(0, Math.min(st.fx, 1 - st.fw));
  st.fy = Math.max(0, Math.min(st.fy, 1 - h / H));
  Object.assign(st.el.style, { left: st.fx * 100 + '%', top: st.fy * 100 + '%', width: st.fw * 100 + '%', height: h / H * 100 + '%' });
}
function pomicanje(st) {
  st.el.addEventListener('pointerdown', e => {
    if (e.target.classList.contains('x')) return;
    e.preventDefault();
    $$('.stavka.odabrana').forEach(x => x.classList.remove('odabrana'));
    st.el.classList.add('odabrana');
    const s = str[st.str], W = s.el.clientWidth, H = s.el.clientHeight;
    const velicinu = e.target.classList.contains('ruckica');
    const x0 = e.clientX, y0 = e.clientY, fx0 = st.fx, fy0 = st.fy, fw0 = st.fw;
    st.el.setPointerCapture(e.pointerId);
    const mic = ev => {
      const dx = (ev.clientX - x0) / W, dy = (ev.clientY - y0) / H;
      if (velicinu) st.fw = Math.max(.03, Math.min(1 - st.fx, fw0 + dx));
      else { st.fx = fx0 + dx; st.fy = fy0 + dy; }
      postaviStavku(st);
    };
    const pusti = () => { st.el.removeEventListener('pointermove', mic); st.el.removeEventListener('pointerup', pusti); };
    st.el.addEventListener('pointermove', mic);
    st.el.addEventListener('pointerup', pusti);
  });
}
window.addEventListener('resize', () => stavke.forEach(postaviStavku));
document.addEventListener('pointerdown', e => { if (!e.target.closest('.stavka')) $$('.stavka.odabrana').forEach(x => x.classList.remove('odabrana')); });

$('#dodaj').onclick = () => {
  const vrsta = $('input[name="vrsta"]:checked').value;
  const c = vrsta === 'crtaj' ? crtajBlok.slika() : vrsta === 'slika' ? pripremljenaSlika : tekstSlika();
  if (!c) return obavijest(vrsta === 'crtaj' ? 'Najprije nacrtaj potpis.' : vrsta === 'slika' ? 'Najprije učitaj sliku.' : 'Upiši tekst.');
  const url = c.toDataURL('image/png');
  dodajStavku(url, c.width, c.height);
  if (vrsta !== 'tekst' && !spremljeni.some(s => s.url === url)) {
    spremljeni.unshift({ url, w: c.width, h: c.height });
    spremljeni = spremljeni.slice(0, 9);
    spremiPopis();
  }
  if (vrsta === 'crtaj') crtajBlok.ocisti();
};
function spremiPopis() {
  if ($('#zapamti').checked) lokalno.stavi(KLJUC, spremljeni);
  $('#spremljeni').innerHTML = spremljeni.map((s, i) => `<button type="button" data-i="${i}" title="Postavi ponovno"><img src="${s.url}" alt=""><span class="makni" data-makni="${i}" title="Ukloni">×</span></button>`).join('');
}
$('#spremljeni').addEventListener('click', e => {
  const m = e.target.closest('[data-makni]');
  if (m) { spremljeni.splice(+m.dataset.makni, 1); spremiPopis(); return; }
  const b = e.target.closest('[data-i]');
  if (b) { const s = spremljeni[+b.dataset.i]; dodajStavku(s.url, s.w, s.h); }
});
$('#zapamti').addEventListener('change', e => {
  if (e.target.checked) { lokalno.stavi(KLJUC, spremljeni); obavijest('Potpisi se pamte samo u ovom pregledniku.'); }
  else { lokalno.makni(KLJUC); obavijest('Zapamćeni potpisi su obrisani.'); }
});

// ================= spremanje =================
$('#spremi').onclick = async () => {
  if (!stavke.length) return obavijest('Na dokumentu još nema potpisa.');
  const gumb = $('#spremi');
  gumb.disabled = true;
  try {
    const doc = await PDFLib.PDFDocument.load(bajtovi, { ignoreEncryption: true });
    const stranicePdf = doc.getPages(), slike = new Map();
    for (const st of stavke) {
      const s = str[st.str], W = s.el.clientWidth, H = s.el.clientHeight;
      const k = W / s.vp1.width;                         // px zaslona po PDF točki
      const vp = s.stranica.getViewport({ scale: k });   // isti prikaz kao na zaslonu (s rotacijom)
      const lijevo = st.fx * W, sirina = st.fw * W, visina = sirina / st.omjer, dno = st.fy * H + visina;
      const [x, y] = vp.convertToPdfPoint(lijevo, dno);
      if (!slike.has(st.url)) slike.set(st.url, await doc.embedPng(st.url));
      const rot = ((s.stranica.rotate || 0) % 360 + 360) % 360;
      stranicePdf[st.str].drawImage(slike.get(st.url), { x, y, width: sirina / k, height: visina / k, rotate: PDFLib.degrees(rot) });
    }
    doc.setProducer('app-bonic Potpis na PDF');
    const van = await doc.save();
    const ime = ($('#ime').value.trim() || 'potpisano').replace(/[\\/:*?"<>|]/g, '-').replace(/(\.pdf)?$/i, '.pdf');
    spremi(new Blob([van], { type: 'application/pdf' }), ime);
    obavijest('Potpisani PDF je spreman.');
  } catch (e) {
    console.error(e);
    obavijest('Nije uspjelo: ' + e.message);
  } finally { gumb.disabled = false; }
};
$('#novi').onclick = () => { io?.disconnect(); stavke = []; str = []; pdf = null; $('#stranice').innerHTML = ''; $('#radno').hidden = true; $('#drop').hidden = false; };

dropzona($('#drop'), ucitaj, { accept: 'application/pdf,.pdf', visestruko: false });
spremiPopis();
