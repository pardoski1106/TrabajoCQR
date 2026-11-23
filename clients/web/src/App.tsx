import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Socket } from 'socket.io-client';
import { crearSala, enviarMensaje, listarMensajes, listarSalas } from './api';
import type { EventoDominio, Mensaje, Sala } from './contrato';
import { connectRealtime } from './realtime';

const AUTOR_KEY = 'cqrs.autor';

function initialAutor(): string {
  try {
    return localStorage.getItem(AUTOR_KEY) ?? '';
  } catch {
    return '';
  }
}

export function App() {
  const [salas, setSalas] = useState<Sala[]>([]);
  const [salaActual, setSalaActual] = useState<Sala | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [conectado, setConectado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevaSala, setNuevaSala] = useState('');
  const [autor, setAutor] = useState(initialAutor);
  const [texto, setTexto] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const salaActualId = useRef<string | null>(null);

  // Evento en vivo (broadcast): actualiza la UI sin volver a consultar.
  const onEvent = useCallback((e: EventoDominio) => {
    if (e.type === 'SalaCreada') {
      setSalas((prev) =>
        prev.some((s) => s.id === e.aggregateId)
          ? prev
          : [...prev, { id: e.aggregateId, nombre: e.payload.nombre, creadaEn: e.occurredAt }],
      );
    } else if (e.aggregateId === salaActualId.current) {
      const m: Mensaje = {
        id: e.payload.mensajeId,
        salaId: e.aggregateId,
        autor: e.payload.autor,
        texto: e.payload.texto,
        enviadoEn: e.occurredAt,
      };
      setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
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

  async function abrirSala(sala: Sala) {
    setError(null);
    const socket = socketRef.current;
    // Primero suscribirse y luego consultar: no se pierde ningun evento intermedio (se deduplica por id).
    if (salaActualId.current) await socket?.emitWithAck('desuscribir', salaActualId.current);
    salaActualId.current = sala.id;
    setSalaActual(sala);
    setMensajes([]);
    await socket?.emitWithAck('suscribir', sala.id);
    try {
      const historial = await listarMensajes(sala.id);
      setMensajes((prev) => {
        const ids = new Set(historial.map((m) => m.id));
        return [...historial, ...prev.filter((m) => !ids.has(m.id))];
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onCrearSala(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    try {
      await crearSala(nuevaSala);
      setNuevaSala('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onEnviar(ev: FormEvent) {
    ev.preventDefault();
    if (!salaActual) return;
    setError(null);
    try {
      await enviarMensaje(salaActual.id, autor, texto);
      setTexto('');
      try {
        localStorage.setItem(AUTOR_KEY, autor);
      } catch {
        /* almacenamiento no disponible */
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="layout">
      <aside>
        <h1>Salas</h1>
        <span className={conectado ? 'estado ok' : 'estado'}>{conectado ? 'En vivo' : 'Sin conexion'}</span>
        <ul>
          {salas.map((s) => (
            <li key={s.id}>
              <button className={s.id === salaActual?.id ? 'activa' : ''} onClick={() => void abrirSala(s)}>
                # {s.nombre}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => void onCrearSala(e)}>
          <input value={nuevaSala} onChange={(e) => setNuevaSala(e.target.value)} placeholder="Nueva sala" maxLength={80} />
          <button type="submit">Crear (comando)</button>
        </form>
      </aside>

      <main>
        {error && <p className="error">{error}</p>}
        {!salaActual ? (
          <p className="vacio">Elige o crea una sala.</p>
        ) : (
          <>
            <h2># {salaActual.nombre}</h2>
            <ul className="mensajes">
              {mensajes.map((m) => (
                <li key={m.id}>
                  <strong>{m.autor}</strong> <time>{new Date(m.enviadoEn).toLocaleTimeString()}</time>
                  <p>{m.texto}</p>
                </li>
              ))}
            </ul>
            <form className="enviar" onSubmit={(e) => void onEnviar(e)}>
              <input value={autor} onChange={(e) => setAutor(e.target.value)} placeholder="Tu nombre" maxLength={40} />
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensaje" maxLength={1000} />
              <button type="submit">Enviar (comando)</button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
