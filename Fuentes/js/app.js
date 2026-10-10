// FridgeNFC · interfaz
//
// Una lista = una "sala" con un id aleatorio que va en el enlace (#id).
// Ese enlace es lo que se graba en el sticker NFC.

import { SUPABASE_URL, SUPABASE_ANON_KEY, INTERVALO_REFRESCO } from './config.js';
import { crearAlmacen, leerLocal, guardarLocal, borrarLocal } from './datos.js';
import qrcode from './qrcode.js';

const FORMATO_SALA = /^[a-z0-9]{12,32}$/;
const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ESPERA_DESHACER = 5000;
const MAX_SUGERENCIAS = 8;

const $ = (selector) => document.querySelector(selector);

const ICONO_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICONO_QUITAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// Solo se enseña el estado cuando hay algo que contar.
const TEXTO_ESTADO = {
  'sin-conexion': 'Sin conexión',
  error: 'Sin conexión con el servidor',
};

// ── Listas guardadas en este móvil ──────────────────────────────────────────

function nuevaSala() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('');
}

const misListas = () => leerLocal('listas', []);

function nombreDeLista(sala) {
  return misListas().find((l) => l.sala === sala)?.nombre || 'Lista';
}

function guardarLista(sala, nombre) {
  const listas = misListas().filter((l) => l.sala !== sala);
  listas.unshift({ sala, nombre });
  guardarLocal('listas', listas);
}

function quitarLista(sala) {
  guardarLocal('listas', misListas().filter((l) => l.sala !== sala));
  borrarLocal(`items:${sala}`);
  borrarLocal(`cola:${sala}`);
  borrarLocal(`historial:${sala}`);
}

// La versión anterior guardaba la lista en "fridgenfc_room".
function migrarVersionAnterior() {
  try {
    const antigua = localStorage.getItem('fridgenfc_room');
    if (antigua && FORMATO_SALA.test(antigua) && !misListas().length) {
      guardarLista(antigua, 'Nevera');
      guardarLocal('ultima', antigua);
    }
  } catch {
    // Sin almacenamiento: no hay nada que migrar.
  }
}

function elegirSala() {
  const delEnlace = location.hash.slice(1).toLowerCase();
  if (FORMATO_SALA.test(delEnlace)) return { sala: delEnlace, deEnlace: true };
  const ultima = leerLocal('ultima', null);
  if (ultima && FORMATO_SALA.test(ultima)) return { sala: ultima, deEnlace: false };
  return { sala: nuevaSala(), deEnlace: false };
}

const enlaceDeLista = (sala) => `${location.origin}${location.pathname}#${sala}`;

function abrirLista(sala) {
  guardarLocal('ultima', sala);
  location.hash = sala;
  location.reload();
}

// ── Utilidades de texto ─────────────────────────────────────────────────────

function limpiar(texto) {
  const t = texto.replace(/\s+/g, ' ').trim().slice(0, 60);
  return t ? t[0].toLocaleUpperCase('es') + t.slice(1) : '';
}

function normalizar(texto) {
  return texto.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function haceCuanto(iso) {
  const segundos = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(segundos)) return '';
  if (segundos < 60) return 'ahora';
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
  if (segundos < 172800) return 'ayer';
  if (segundos < 604800) return `hace ${Math.floor(segundos / 86400)} días`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// ── Estado de la pantalla ───────────────────────────────────────────────────

migrarVersionAnterior();

const { sala, deEnlace } = elegirSala();
const listaNueva = !misListas().some((l) => l.sala === sala);
guardarLocal('ultima', sala);
history.replaceState(null, '', `#${sala}`);

const almacen = crearAlmacen({ url: SUPABASE_URL, clave: SUPABASE_ANON_KEY, sala });

const ui = {
  foto: almacen.foto(),
  filtro: null, // persona por la que se filtra "Falta"
  ocultos: new Set(), // borrados que aún se pueden deshacer
  borradoPendiente: null, // { ids, temporizador }
  recienAnadidos: new Set(),
  resaltar: null,
};

// ── Historial para "Lo de siempre" ──────────────────────────────────────────

function registrarHistorial(nombre) {
  const historial = leerLocal(`historial:${sala}`, {});
  const clave = normalizar(nombre);
  const previo = historial[clave] || { veces: 0 };
  historial[clave] = { nombre, veces: previo.veces + 1, ultima: Date.now() };
  guardarLocal(`historial:${sala}`, historial);
}

function sugerencias(items) {
  const historial = leerLocal(`historial:${sala}`, {});
  // Lo que otros han apuntado en esta lista también cuenta.
  for (const item of items) {
    const clave = normalizar(item.name);
    if (!historial[clave]) historial[clave] = { nombre: item.name, veces: 1, ultima: 0 };
  }
  const pendientes = new Set(items.filter((i) => !i.done).map((i) => normalizar(i.name)));
  return Object.entries(historial)
    .filter(([clave]) => !pendientes.has(clave))
    .sort(([, a], [, b]) => b.veces - a.veces || b.ultima - a.ultima)
    .slice(0, MAX_SUGERENCIAS)
    .map(([, v]) => v.nombre);
}

// ── Pintar ──────────────────────────────────────────────────────────────────

function crearFila(item) {
  const li = document.createElement('li');
  li.className = 'fila';
  li.dataset.id = item.id;
  if (item.done) li.classList.add('hecha');
  if (ui.recienAnadidos.has(item.id)) li.classList.add('nueva');
  if (ui.resaltar === item.id) li.classList.add('resaltada');

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'check';
  check.dataset.accion = 'marcar';
  check.setAttribute('aria-label', item.done ? `Volver a poner «${item.name}» en la lista` : `Marcar «${item.name}» como comprado`);
  check.innerHTML = `<span class="caja">${ICONO_CHECK}</span>`;

  const texto = document.createElement('div');
  texto.className = 'texto';
  texto.dataset.accion = 'marcar';
  const nombre = document.createElement('span');
  nombre.className = 'nombre';
  nombre.textContent = item.name;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = [item.added_by, haceCuanto(item.created_at)].filter(Boolean).join(' · ');
  texto.append(nombre, meta);

  const quitar = document.createElement('button');
  quitar.type = 'button';
  quitar.className = 'quitar';
  quitar.dataset.accion = 'borrar';
  quitar.setAttribute('aria-label', `Borrar «${item.name}»`);
  quitar.innerHTML = ICONO_QUITAR;

  li.append(check, texto, quitar);
  return li;
}

function pintarSubtitulo(cuantas, estado, pendientes) {
  $('#estado').dataset.estado = estado;
  const texto = $('#estado-texto');
  texto.textContent = cuantas ? `${cuantas} ${cuantas === 1 ? 'cosa' : 'cosas'} por comprar` : 'No falta nada';
  const problema = TEXTO_ESTADO[estado];
  if (problema) {
    const aviso = document.createElement('span');
    aviso.className = 'aviso-estado';
    const cola = pendientes ? ` · ${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'} por enviar` : '';
    aviso.textContent = ` · ${problema}${cola}`;
    texto.append(aviso);
  }
}

function pintarFiltro(pendientes) {
  const personas = [...new Set(pendientes.map((i) => i.added_by).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const filtro = $('#filtro');
  if (ui.filtro && !personas.includes(ui.filtro)) ui.filtro = null;
  if (personas.length < 2) {
    filtro.hidden = true;
    return;
  }
  filtro.hidden = false;
  filtro.replaceChildren(
    ...[null, ...personas].map((persona) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.textContent = persona ?? 'Todos';
      boton.setAttribute('aria-pressed', String(ui.filtro === persona));
      boton.addEventListener('click', () => {
        ui.filtro = persona;
        pintar();
      });
      return boton;
    }),
  );
}

function pintar() {
  const { items, estado, pendientes } = ui.foto;
  const visibles = items.filter((i) => !ui.ocultos.has(i.id));
  const recientesPrimero = (a, b) => (b.created_at || '').localeCompare(a.created_at || '');

  const falta = visibles.filter((i) => !i.done).sort(recientesPrimero);
  const comprado = visibles.filter((i) => i.done).sort(recientesPrimero);

  document.title = `${nombreDeLista(sala)} · FridgeNFC`;
  $('#nombre-lista').textContent = nombreDeLista(sala);
  pintarSubtitulo(falta.length, estado, pendientes);
  pintarFiltro(falta);

  const faltaFiltrado = ui.filtro ? falta.filter((i) => i.added_by === ui.filtro) : falta;
  $('#lista-falta').replaceChildren(...faltaFiltrado.map(crearFila));
  $('#vacio').hidden = falta.length > 0;
  $('#titulo-falta').hidden = falta.length === 0;

  $('#bloque-comprado').hidden = comprado.length === 0;
  $('#cuenta-comprado').textContent = comprado.length;
  $('#lista-comprado').replaceChildren(...comprado.map(crearFila));

  pintarSugerencias();

  ui.recienAnadidos.clear();
  ui.resaltar = null;
}

function pintarSugerencias() {
  const campo = $('#campo-nuevo');
  const escrito = normalizar(campo.value);
  const visibles = ui.foto.items.filter((i) => !ui.ocultos.has(i.id));
  const sugeridas = document.activeElement === campo
    ? sugerencias(visibles).filter((nombre) => normalizar(nombre).includes(escrito) && normalizar(nombre) !== escrito)
    : [];
  $('#sugerencias').hidden = sugeridas.length === 0;
  $('#lista-sugerencias').replaceChildren(
    ...sugeridas.map((nombre) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = nombre;
      // pointerdown + preventDefault: el campo no pierde el foco al tocar.
      chip.addEventListener('pointerdown', (evento) => evento.preventDefault());
      chip.addEventListener('click', () => {
        anadir(nombre);
        campo.value = '';
        alEscribir();
      });
      return chip;
    }),
  );
}

function alEscribir() {
  pintarSugerencias();
}

// ── Aviso con "Deshacer" ────────────────────────────────────────────────────

let temporizadorAviso = null;

function avisar(texto, accion = null) {
  const aviso = $('#aviso');
  const boton = $('#aviso-accion');
  $('#aviso-texto').textContent = texto;
  boton.hidden = !accion;
  boton.onclick = null;
  if (accion) {
    boton.textContent = accion.texto;
    boton.onclick = () => {
      aviso.hidden = true;
      accion.alPulsar();
    };
  }
  aviso.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => {
    aviso.hidden = true;
  }, accion ? ESPERA_DESHACER : 2800);
}

// ── Acciones ────────────────────────────────────────────────────────────────

function anadir(texto) {
  const nombre = limpiar(texto);
  if (!nombre) return;
  const clave = normalizar(nombre);
  const existente = ui.foto.items.find((i) => !ui.ocultos.has(i.id) && normalizar(i.name) === clave);

  if (existente && !existente.done) {
    ui.resaltar = existente.id;
    avisar(`«${existente.name}» ya está en la lista`);
    pintar();
    return;
  }
  if (existente && existente.done) {
    almacen.marcar(existente.id, false);
    registrarHistorial(existente.name);
    avisar(`«${existente.name}» vuelve a la lista`);
    return;
  }
  const item = almacen.anadir(nombre, leerLocal('yo', ''));
  ui.recienAnadidos.add(item.id);
  registrarHistorial(nombre);
  pintar();
}

function confirmarBorrado() {
  const pendiente = ui.borradoPendiente;
  if (!pendiente) return;
  clearTimeout(pendiente.temporizador);
  ui.borradoPendiente = null;
  almacen.borrar(pendiente.ids);
  for (const id of pendiente.ids) ui.ocultos.delete(id);
}

function borrarConDeshacer(ids, texto) {
  confirmarBorrado(); // si había otro borrado esperando, se hace ya
  for (const id of ids) ui.ocultos.add(id);
  ui.borradoPendiente = { ids, temporizador: setTimeout(confirmarBorrado, ESPERA_DESHACER) };
  pintar();
  avisar(texto, {
    texto: 'Deshacer',
    alPulsar: () => {
      clearTimeout(ui.borradoPendiente?.temporizador);
      ui.borradoPendiente = null;
      for (const id of ids) ui.ocultos.delete(id);
      pintar();
    },
  });
}

function alPulsarLista(evento) {
  const objetivo = evento.target.closest('[data-accion]');
  const fila = evento.target.closest('.fila');
  if (!objetivo || !fila) return;
  const item = ui.foto.items.find((i) => i.id === fila.dataset.id);
  if (!item) return;

  if (objetivo.dataset.accion === 'marcar') {
    almacen.marcar(item.id, !item.done);
  } else if (objetivo.dataset.accion === 'borrar') {
    borrarConDeshacer([item.id], `Borrado «${item.name}»`);
  }
}

// ── Diálogos ────────────────────────────────────────────────────────────────

function abrirDialogo(id) {
  const dialogo = document.getElementById(id);
  if (!dialogo.open) dialogo.showModal();
}

function cerrarDialogo(id) {
  const dialogo = document.getElementById(id);
  if (dialogo.open) dialogo.close();
}

function mostrarBienvenida() {
  $('#bienvenida-titulo').textContent = deEnlace ? 'Una lista compartida' : 'Lista nueva';
  $('#bienvenida-texto').textContent = deEnlace
    ? 'Ponle un nombre para reconocerla en este móvil y di quién eres. Verás lo mismo que el resto de tu casa.'
    : 'Ponle un nombre y di quién eres. Después podrás guardar el enlace en un sticker NFC.';
  $('#campo-nombre-lista').value = 'Compra';
  $('#campo-yo').value = leerLocal('yo', '');
  abrirDialogo('dialogo-bienvenida');
}

function mostrarCompartir() {
  const enlace = enlaceDeLista(sala);
  $('#enlace-lista').textContent = enlace;
  $('#qr').innerHTML = svgQr(enlace);
  $('#boton-copiar').textContent = 'Copiar enlace';
  $('#boton-enviar').hidden = !navigator.share;
  const hayNfc = 'NDEFReader' in window;
  $('#nfc-directo').hidden = !hayNfc;
  $('#nfc-pasos').hidden = hayNfc;
  abrirDialogo('dialogo-compartir');
}

// QR del enlace como SVG (nítido en pantalla y al imprimir).
function svgQr(texto) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

function imprimirQr() {
  const enlace = enlaceDeLista(sala);
  $('#hoja-nombre').textContent = nombreDeLista(sala);
  $('#hoja-codigo').innerHTML = svgQr(enlace);
  $('#dialogo-compartir').close();
  // Un instante para que se cierre el diálogo antes de abrir la impresión.
  setTimeout(() => window.print(), 100);
}

async function copiarEnlace() {
  const enlace = enlaceDeLista(sala);
  try {
    await navigator.clipboard.writeText(enlace);
    $('#boton-copiar').textContent = 'Copiado';
  } catch {
    const rango = document.createRange();
    rango.selectNodeContents($('#enlace-lista'));
    const seleccion = getSelection();
    seleccion.removeAllRanges();
    seleccion.addRange(rango);
    $('#boton-copiar').textContent = 'Selecciona y copia';
  }
}

async function grabarSticker() {
  const estado = $('#nfc-estado');
  try {
    const lector = new window.NDEFReader();
    estado.textContent = 'Acerca el sticker a la parte trasera del móvil…';
    await lector.write({ records: [{ recordType: 'url', data: enlaceDeLista(sala) }] });
    estado.textContent = 'Grabado. Ya puedes pegar el sticker en la nevera.';
  } catch (error) {
    estado.textContent = error?.name === 'NotAllowedError'
      ? 'Hace falta permitir el NFC para grabar el sticker.'
      : 'No se ha podido grabar. Prueba otra vez o usa NFC Tools.';
  }
}

function mostrarAjustes() {
  $('#ajuste-nombre-lista').value = nombreDeLista(sala);
  $('#ajuste-yo').value = leerLocal('yo', '');
  const nota = $('#nota-modo');
  nota.hidden = almacen.remoto;
  nota.textContent = 'Modo local: falta configurar Supabase (js/config.js), así que esta lista solo existe en este móvil.';

  const listas = misListas();
  $('#mis-listas').replaceChildren(
    ...listas.map((lista) => {
      const li = document.createElement('li');
      const abrir = document.createElement('button');
      abrir.type = 'button';
      abrir.className = 'abrir';
      const nombre = document.createElement('span');
      nombre.textContent = lista.nombre;
      abrir.append(nombre);
      abrir.addEventListener('click', () => {
        if (lista.sala !== sala) abrirLista(lista.sala);
      });
      li.append(abrir);

      if (lista.sala === sala) {
        const actual = document.createElement('span');
        actual.className = 'actual';
        actual.textContent = 'Abierta';
        li.append(actual);
      } else {
        const quitar = document.createElement('button');
        quitar.type = 'button';
        quitar.className = 'quitar-lista';
        quitar.textContent = 'Quitar de este móvil';
        quitar.addEventListener('click', () => {
          quitarLista(lista.sala);
          mostrarAjustes();
        });
        li.append(quitar);
      }
      return li;
    }),
  );
  abrirDialogo('dialogo-listas');
}

// ── Arranque ────────────────────────────────────────────────────────────────

function conectarEventos() {
  $('#form-anadir').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const campo = $('#campo-nuevo');
    anadir(campo.value);
    campo.value = '';
    campo.focus();
    alEscribir();
  });
  $('#campo-nuevo').addEventListener('input', alEscribir);
  $('#campo-nuevo').addEventListener('focus', pintarSugerencias);
  $('#campo-nuevo').addEventListener('blur', () => setTimeout(pintarSugerencias, 120));

  $('#lista-falta').addEventListener('click', alPulsarLista);
  $('#lista-comprado').addEventListener('click', alPulsarLista);

  // La ayuda se queda cerrada si alguien la cierra en este móvil.
  const ayuda = $('#ayuda');
  try { if (localStorage.getItem('fridgenfc_ayuda') === 'cerrada') ayuda.open = false; } catch {}
  ayuda.addEventListener('toggle', () => {
    try { localStorage.setItem('fridgenfc_ayuda', ayuda.open ? 'abierta' : 'cerrada'); } catch {}
  });

  $('#boton-vaciar').addEventListener('click', () => {
    const ids = ui.foto.items.filter((i) => i.done && !ui.ocultos.has(i.id)).map((i) => i.id);
    if (ids.length) borrarConDeshacer(ids, `Vaciado: ${ids.length} ${ids.length === 1 ? 'cosa' : 'cosas'}`);
  });

  $('#boton-compartir').addEventListener('click', mostrarCompartir);
  $('#boton-copiar').addEventListener('click', copiarEnlace);
  $('#boton-imprimir').addEventListener('click', imprimirQr);
  $('#boton-enviar').addEventListener('click', () => {
    navigator.share?.({ title: nombreDeLista(sala), url: enlaceDeLista(sala) }).catch(() => {});
  });
  $('#boton-nfc').addEventListener('click', grabarSticker);

  $('#boton-listas').addEventListener('click', mostrarAjustes);
  $('#boton-nueva-lista').addEventListener('click', () => abrirLista(nuevaSala()));

  $('#form-bienvenida').addEventListener('submit', (evento) => {
    evento.preventDefault();
    guardarLista(sala, limpiar($('#campo-nombre-lista').value) || 'Compra');
    guardarLocal('yo', limpiar($('#campo-yo').value));
    cerrarDialogo('dialogo-bienvenida');
    pintar();
    $('#campo-nuevo').focus();
  });

  $('#form-ajustes').addEventListener('submit', (evento) => {
    evento.preventDefault();
    guardarLista(sala, limpiar($('#ajuste-nombre-lista').value) || 'Lista');
    guardarLocal('yo', limpiar($('#ajuste-yo').value));
    cerrarDialogo('dialogo-listas');
    pintar();
  });

  for (const boton of document.querySelectorAll('[data-cerrar]')) {
    boton.addEventListener('click', () => boton.closest('dialog').close());
  }
  // La bienvenida no se cierra sin rellenarla (Esc incluido).
  $('#dialogo-bienvenida').addEventListener('cancel', (evento) => evento.preventDefault());

  // Otro enlace pegado en la barra de direcciones: se abre esa lista.
  window.addEventListener('hashchange', () => {
    const nueva = location.hash.slice(1).toLowerCase();
    if (FORMATO_SALA.test(nueva) && nueva !== sala) abrirLista(nueva);
  });

  // Refrescos: al volver a la app, al recuperar la red y cada poco rato.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') almacen.refrescar();
    else confirmarBorrado();
  });
  window.addEventListener('pagehide', confirmarBorrado);
  window.addEventListener('online', () => almacen.refrescar());
  setInterval(() => {
    if (document.visibilityState === 'visible') almacen.refrescar();
  }, INTERVALO_REFRESCO);
}

almacen.alCambiar((foto) => {
  ui.foto = foto;
  pintar();
});
conectarEventos();
almacen.refrescar();
if (listaNueva) mostrarBienvenida();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch((error) => console.warn('FridgeNFC: sin modo offline', error));
}
