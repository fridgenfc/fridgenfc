// Capa de datos de FridgeNFC.
//
// - Habla con Supabase solo a través de funciones (RPC) que exigen el id de
//   la lista: sin conocer el id no se puede leer ni tocar nada.
// - Guarda una copia de la lista en el móvil, para abrirla sin conexión.
// - Cada cambio entra en una cola local y se envía en orden. Si no hay red,
//   se queda en la cola y se reintenta en el siguiente refresco.
// - Los ids se generan en el móvil, así que un elemento recién añadido ya
//   tiene su id definitivo y se puede marcar o borrar al momento.

const PREFIJO = 'fridgenfc';

// Errores del servidor que significan "esta operación no vale" (se descarta).
// El resto (red caída, 401, 404, 5xx) deja la operación en la cola.
const ERRORES_DEFINITIVOS = new Set([400, 409, 422]);

export function leerLocal(clave, porDefecto) {
  try {
    const valor = localStorage.getItem(`${PREFIJO}:${clave}`);
    return valor === null ? porDefecto : JSON.parse(valor);
  } catch {
    return porDefecto;
  }
}

export function guardarLocal(clave, valor) {
  try {
    localStorage.setItem(`${PREFIJO}:${clave}`, JSON.stringify(valor));
  } catch {
    // Almacenamiento lleno o bloqueado: la app sigue funcionando en memoria.
  }
}

export function borrarLocal(clave) {
  try {
    localStorage.removeItem(`${PREFIJO}:${clave}`);
  } catch {
    // Nada que hacer.
  }
}

export function nuevoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function aplicar(lista, op) {
  switch (op.tipo) {
    case 'guardar': {
      const i = lista.findIndex((x) => x.id === op.item.id);
      if (i >= 0) lista[i] = { ...lista[i], ...op.item };
      else lista.push({ ...op.item });
      return lista;
    }
    case 'marcar':
      return lista.map((x) => (x.id === op.id ? { ...x, done: op.hecho } : x));
    case 'borrar':
      return lista.filter((x) => !op.ids.includes(x.id));
    default:
      return lista;
  }
}

/**
 * Crea el almacén de una lista.
 * @param {{url: string, clave: string, sala: string}} opciones
 */
export function crearAlmacen({ url, clave, sala }) {
  const remoto = Boolean(url && clave);
  let items = leerLocal(`items:${sala}`, []);
  let cola = leerLocal(`cola:${sala}`, []);
  let estado = remoto ? 'sincronizando' : 'local';
  let enviando = null;
  const oyentes = new Set();

  const persistir = () => {
    guardarLocal(`items:${sala}`, items);
    guardarLocal(`cola:${sala}`, cola);
  };

  const foto = () => ({ items: items.map((x) => ({ ...x })), estado, pendientes: cola.length });

  const avisar = () => {
    const f = foto();
    for (const oyente of oyentes) oyente(f);
  };

  async function rpc(funcion, args) {
    const respuesta = await fetch(`${url}/rest/v1/rpc/${funcion}`, {
      method: 'POST',
      headers: {
        apikey: clave,
        Authorization: `Bearer ${clave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!respuesta.ok) {
      const error = new Error(`${funcion}: ${respuesta.status} ${await respuesta.text()}`);
      error.codigo = respuesta.status;
      throw error;
    }
    const texto = await respuesta.text();
    return texto ? JSON.parse(texto) : null;
  }

  function enviarOperacion(op) {
    switch (op.tipo) {
      case 'guardar':
        return rpc('guardar_item', {
          p_sala: sala,
          p_id: op.item.id,
          p_nombre: op.item.name,
          p_quien: op.item.added_by,
        });
      case 'marcar':
        return rpc('marcar_item', { p_sala: sala, p_id: op.id, p_hecho: op.hecho });
      case 'borrar':
        return rpc('borrar_items', { p_sala: sala, p_ids: op.ids });
      default:
        return Promise.resolve();
    }
  }

  // Envía la cola en orden. Devuelve true si se ha vaciado entera.
  function enviarCola() {
    if (!remoto) {
      cola = [];
      persistir();
      return Promise.resolve(true);
    }
    if (enviando) return enviando;
    enviando = (async () => {
      while (cola.length) {
        const op = cola[0];
        try {
          await enviarOperacion(op);
          cola.shift();
          persistir();
        } catch (error) {
          if (ERRORES_DEFINITIVOS.has(error.codigo)) {
            console.warn('FridgeNFC: operación rechazada por el servidor, se descarta', op, error);
            cola.shift();
            persistir();
            continue;
          }
          estado = error.codigo ? 'error' : 'sin-conexion';
          if (error.codigo) console.error('FridgeNFC:', error);
          avisar();
          return false;
        }
      }
      return true;
    })().finally(() => {
      enviando = null;
    });
    return enviando;
  }

  function encolar(op) {
    items = aplicar(items, op);
    cola.push(op);
    persistir();
    avisar();
    if (remoto) refrescar();
  }

  async function refrescar() {
    if (!remoto) {
      avisar();
      return;
    }
    if (estado !== 'al-dia') {
      estado = 'sincronizando';
      avisar();
    }
    const vaciada = await enviarCola();
    if (!vaciada) return;
    try {
      let lista = (await rpc('listar_items', { p_sala: sala })) || [];
      // Lo que se haya añadido mientras llegaba la respuesta sigue en la cola.
      for (const op of cola) lista = aplicar(lista, op);
      items = lista;
      estado = 'al-dia';
      persistir();
    } catch (error) {
      estado = error.codigo ? 'error' : 'sin-conexion';
      if (error.codigo) console.error('FridgeNFC:', error);
    }
    avisar();
  }

  return {
    remoto,
    sala,
    foto,
    alCambiar(oyente) {
      oyentes.add(oyente);
      oyente(foto());
      return () => oyentes.delete(oyente);
    },
    refrescar,
    anadir(nombre, quien) {
      const item = {
        id: nuevoId(),
        room_id: sala,
        name: nombre,
        done: false,
        added_by: quien || null,
        created_at: new Date().toISOString(),
      };
      encolar({ tipo: 'guardar', item });
      return item;
    },
    marcar(id, hecho) {
      encolar({ tipo: 'marcar', id, hecho });
    },
    borrar(ids) {
      if (ids.length) encolar({ tipo: 'borrar', ids: [...ids] });
    },
  };
}
