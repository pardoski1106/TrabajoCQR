import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Socket } from 'socket.io-client';
import { crearSala, enviarMensaje, listarMensajes, listarSalas } from './api';
import type { EventoDominio, Mensaje, Sala } from './contrato';
import {
  CANALES_SUGERIDOS, EMPLEADOS, EMPRESA, autorDe, colorDe, iniciales, parseAutor, puedeCrearCanales, type Empleado,
} from './empresa';
import { FlowFeed, type FeedItem } from './FlowFeed';
import { Login } from './Login';
import { connectRealtime } from './realtime';

const USER_KEY = 'cqrs.empleado';
const TEXTO_MAX = 1000;

function empleadoGuardado(): Empleado | null {
  try {
    return EMPLEADOS.find((e) => e.id === localStorage.getItem(USER_KEY)) ?? null;
  } catch {
    return null;
  }
}

function Avatar({ autor, size = 36 }: { autor: string; size?: number }) {
  const { nombre, empleado } = parseAutor(autor);
  return (
    <span className="avatar" style={{ background: empleado?.color ?? colorDe(nombre), width: size, height: size }}>
      {iniciales(nombre)}
    </span>
  );
}

export function App() {
  const [usuario, setUsuario] = useState<Empleado | null>(empleadoGuardado);

  function entrar(e: Empleado) {
    try {
      localStorage.setItem(USER_KEY, e.id);
    } catch { /* almacenamiento no disponible */ }
    setUsuario(e);
  }
  function salir() {
    try {
      localStorage.removeItem(USER_KEY);
    } catch { /* almacenamiento no disponible */ }
    setUsuario(null);
  }

  return usuario ? <Espacio usuario={usuario} onSalir={salir} /> : <Login onEnter={entrar} />;
}

function Espacio({ usuario, onSalir }: { usuario: Empleado; onSalir: () => void }) {
  const [salas, setSalas] = useState<Sala[]>([]);
  const [salaActual, setSalaActual] = useState<Sala | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [noLeidos, setNoLeidos] = useState<Record<string, number>>({});
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [conectado, setConectado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevoCanal, setNuevoCanal] = useState('');
  const [texto, setTexto] = useState('');
  const [verFlujo, setVerFlujo] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const salaActualId = useRef<string | null>(null);
  /** mensajeId -> performance.now() al pulsar enviar, para medir la latencia del broadcast. */
  const envios = useRef(new Map<string, number>());
  const finRef = useRef<HTMLDivElement>(null);

  const onEvent = useCallback((e: EventoDominio) => {
    const ahora = performance.now();
    const inicio = e.type === 'MensajeEnviado' ? envios.current.get(e.payload.mensajeId) : undefined;
    setFeed((prev) =>
      [{ key: `${e.id}-${e.type}`, evento: e, recibidoEn: ahora, latenciaMs: inicio === undefined ? undefined : ahora - inicio }, ...prev]
        .filter((it, i, arr) => arr.findIndex((x) => x.key === it.key) === i)
        .slice(0, 40),
    );

    if (e.type === 'SalaCreada') {
      setSalas((prev) =>
        prev.some((s) => s.id === e.aggregateId)
          ? prev
          : [...prev, { id: e.aggregateId, nombre: e.payload.nombre, creadaEn: e.occurredAt }],
      );
      return;
    }
    if (e.aggregateId === salaActualId.current) {
      const m: Mensaje = {
        id: e.payload.mensajeId, salaId: e.aggregateId, autor: e.payload.autor, texto: e.payload.texto, enviadoEn: e.occurredAt,
      };
      setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } else {
      setNoLeidos((prev) => ({ ...prev, [e.aggregateId]: (prev[e.aggregateId] ?? 0) + 1 }));
    }
  }, []);

  useEffect(() => {
    const socket = connectRealtime(onEvent, setConectado);
    socketRef.current = socket;
    listarSalas().then(setSalas).catch((e: Error) => setError(e.message));
    return () => {
      socket.close();
    };
  }, [onEvent]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  async function abrirSala(sala: Sala) {
    setError(null);
    salaActualId.current = sala.id;
    setSalaActual(sala);
    setMensajes([]);
    setNoLeidos((prev) => ({ ...prev, [sala.id]: 0 }));
    try {
      // El socket ya esta suscrito a "todas": no se pierde ningun evento mientras llega el historial.
      const historial = await listarMensajes(sala.id);
      setMensajes((prev) => {
        const ids = new Set(historial.map((m) => m.id));
        return [...historial, ...prev.filter((m) => !ids.has(m.id))];
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function crearCanal(nombre: string) {
    setError(null);
    try {
      await crearSala(nombre);
      setNuevoCanal('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onEnviar(ev?: FormEvent) {
    ev?.preventDefault();
    if (!salaActual || !texto.trim()) return;
    setError(null);
    const inicio = performance.now();
    const contenido = texto;
    setTexto('');
    try {
      const { mensajeId } = await enviarMensaje(salaActual.id, autorDe(usuario), contenido);
      envios.current.set(mensajeId, inicio);
      // Si el evento llego antes que la respuesta HTTP, completa la latencia ahora.
      setFeed((prev) =>
        prev.map((it) =>
          it.evento.type === 'MensajeEnviado' && it.evento.payload.mensajeId === mensajeId && it.latenciaMs === undefined
            ? { ...it, latenciaMs: it.recibidoEn - inicio }
            : it,
        ),
      );
    } catch (e) {
      setTexto(contenido);
      setError((e as Error).message);
    }
  }

  function onTecla(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onEnviar();
    }
  }

  const admin = puedeCrearCanales(usuario);
  const sugeridos = CANALES_SUGERIDOS.filter((c) => !salas.some((s) => s.nombre.toLowerCase() === c.toLowerCase()));

  return (
    <div className={verFlujo ? 'app con-flujo' : 'app'}>
      <aside className="sidebar">
        <div className="marca">
          <span className="logo sm">{EMPRESA.nombre[0]}</span>
          <div>
            <strong>{EMPRESA.nombre}</strong>
            <small>{EMPRESA.lema}</small>
          </div>
        </div>

        <div className="usuario">
          <Avatar autor={autorDe(usuario)} />
          <div className="u-datos">
            <strong>{usuario.nombre}</strong>
            <small>{usuario.cargo} · {usuario.area}</small>
          </div>
          <button className="link" onClick={onSalir} title="Cambiar de empleado">Cambiar</button>
        </div>

        <h3>Canales</h3>
        <ul className="canales">
          {salas.length === 0 && <li className="vacio">Sin canales todavía</li>}
          {salas.map((s) => (
            <li key={s.id}>
              <button className={s.id === salaActual?.id ? 'canal activo' : 'canal'} onClick={() => void abrirSala(s)}>
                <span># {s.nombre}</span>
                {(noLeidos[s.id] ?? 0) > 0 && <span className="badge">{noLeidos[s.id]}</span>}
              </button>
            </li>
          ))}
        </ul>

        {admin ? (
          <form className="nuevo" onSubmit={(e) => { e.preventDefault(); void crearCanal(nuevoCanal); }}>
            <h3>Crear canal <span className="chip admin">{usuario.cargo}</span></h3>
            <div className="fila">
              <input value={nuevoCanal} onChange={(e) => setNuevoCanal(e.target.value)} placeholder="Nombre del canal" maxLength={80} />
              <button type="submit" disabled={!nuevoCanal.trim()}>Crear</button>
            </div>
            {sugeridos.length > 0 && (
              <div className="sugeridos">
                {sugeridos.map((c) => (
                  <button type="button" key={c} className="chip" onClick={() => void crearCanal(c)}>+ {c}</button>
                ))}
              </div>
            )}
          </form>
        ) : (
          <p className="nota">Solo gerentes, directores y líderes pueden crear canales (permiso de demostración).</p>
        )}

        <div className={conectado ? 'estado ok' : 'estado'}>
          <span className="dot" /> {conectado ? 'Conectado en vivo' : 'Sin conexión con el servidor'}
        </div>
      </aside>

      <main className="chat">
        <header className="chat-top">
          <div>
            <h2>{salaActual ? `# ${salaActual.nombre}` : 'Bienvenido'}</h2>
            <small>{salaActual ? `Canal interno de ${EMPRESA.nombre}` : 'Elige un canal para empezar'}</small>
          </div>
          <button className="ghost" onClick={() => setVerFlujo((v) => !v)}>
            {verFlujo ? 'Ocultar flujo de datos' : 'Ver flujo de datos'}
          </button>
        </header>

        {error && <p className="error" onClick={() => setError(null)}>{error}</p>}

        {!salaActual ? (
          <div className="bienvenida">
            <div className="logo">{EMPRESA.nombre[0]}</div>
            <h3>Hola, {usuario.nombre.split(' ')[0]}</h3>
            <p>
              {salas.length === 0
                ? admin ? 'Aún no hay canales. Crea el primero desde el panel izquierdo (por ejemplo, #General).'
                        : 'Aún no hay canales. Pídele a un gerente, director o líder que cree el primero.'
                : 'Selecciona un canal del panel izquierdo.'}
            </p>
          </div>
        ) : (
          <>
            <ul className="mensajes">
              {mensajes.length === 0 && <li className="vacio">Sé el primero en escribir en este canal.</li>}
              {mensajes.map((m, i) => {
                const { nombre, cargo } = parseAutor(m.autor);
                const mio = m.autor === autorDe(usuario);
                const sigue = mensajes[i - 1]?.autor === m.autor;
                return (
                  <li key={m.id} className={`${mio ? 'mio' : ''} ${sigue ? 'sigue' : ''}`}>
                    {!sigue && <Avatar autor={m.autor} />}
                    <div className="burbuja-wrap">
                      {!sigue && (
                        <div className="autor">
                          <strong>{nombre}</strong>
                          {cargo && <span className="chip rol">{cargo}</span>}
                          <time>{new Date(m.enviadoEn).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</time>
                        </div>
                      )}
                      <div className="burbuja">{m.texto}</div>
                    </div>
                  </li>
                );
              })}
              <div ref={finRef} />
            </ul>

            <form className="composer" onSubmit={(e) => void onEnviar(e)}>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={onTecla}
                placeholder={`Escribe en #${salaActual.nombre} como ${usuario.nombre}…  (Enter envía, Shift+Enter nueva línea)`}
                maxLength={TEXTO_MAX}
                rows={2}
              />
              <button type="submit" disabled={!texto.trim()}>Enviar</button>
            </form>
          </>
        )}
      </main>

      {verFlujo && <FlowFeed items={feed} salas={salas} />}
    </div>
  );
}
