import { useEffect, useState } from 'react';
import type { EventoDominio, Sala } from './contrato';

export interface FeedItem {
  key: string;
  evento: EventoDominio;
  /** performance.now() al recibir el evento por Socket.IO. */
  recibidoEn: number;
  /** Milisegundos entre pulsar "enviar" y recibir el evento (solo para mis propios mensajes). */
  latenciaMs?: number;
}

const PASOS = [
  { id: 'cmd', titulo: 'Comando', detalle: 'POST HTTP' },
  { id: 'es', titulo: 'event_store', detalle: 'PostgreSQL (Neon)' },
  { id: 'mq', titulo: 'RabbitMQ', detalle: 'exchange fanout' },
  { id: 'fan', titulo: 'Proyector + Broadcast', detalle: 'dos consumidores' },
  { id: 'cli', titulo: 'Clientes / Consulta', detalle: 'Socket.IO · read_*' },
];

/** Panel que muestra el flujo CQRS en vivo: cada evento recibido enciende el camino completo. */
export function FlowFeed({ items, salas }: { items: FeedItem[]; salas: Sala[] }) {
  const [activo, setActivo] = useState(-1);
  const ultimo = items[0]?.key;

  // Animacion: al llegar un evento se iluminan los pasos de izquierda a derecha.
  useEffect(() => {
    if (!ultimo) return;
    setActivo(0);
    const timers = PASOS.map((_, i) => setTimeout(() => setActivo(i), i * 140));
    const fin = setTimeout(() => setActivo(-1), PASOS.length * 140 + 700);
    return () => [...timers, fin].forEach(clearTimeout);
  }, [ultimo]);

  const nombreSala = (id: string) => salas.find((s) => s.id === id)?.nombre ?? id.slice(0, 8);

  return (
    <aside className="feed">
      <h2>Flujo de datos en vivo</h2>
      <p className="feed-sub">Cada evento de dominio recorre este camino (CQRS + broadcast).</p>

      <ol className="pipeline">
        {PASOS.map((p, i) => (
          <li key={p.id} className={i <= activo ? 'on' : ''}>
            <span className="punto" />
            <span><strong>{p.titulo}</strong><small>{p.detalle}</small></span>
          </li>
        ))}
      </ol>

      <h3>Eventos recibidos <span className="contador">{items.length}</span></h3>
      {items.length === 0 && <p className="vacio">Aún no llegan eventos. Crea un canal o envía un mensaje.</p>}
      <ul className="eventos">
        {items.map((it) => {
          const e = it.evento;
          return (
            <li key={it.key} className={e.type === 'SalaCreada' ? 'sala' : 'msg'}>
              <div className="ev-top">
                <span className="ev-tipo">{e.type}</span>
                <span className="ev-v">v{e.version}</span>
              </div>
              <div className="ev-cuerpo">
                {e.type === 'SalaCreada'
                  ? <>Canal <b>#{e.payload.nombre}</b> creado</>
                  : <><b>{e.payload.autor.split(' · ')[0]}</b> en <b>#{nombreSala(e.aggregateId)}</b>: {e.payload.texto.slice(0, 60)}</>}
              </div>
              <div className="ev-meta">
                evento #{e.id} · {new Date(e.occurredAt).toLocaleTimeString('es-CO', { hour12: false })}
                {it.latenciaMs !== undefined && <span className="latencia"> · entregado en {Math.round(it.latenciaMs)} ms</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
