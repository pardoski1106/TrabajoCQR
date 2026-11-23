import { EMPLEADOS, EMPRESA, iniciales, puedeCrearCanales, type Empleado } from './empresa';

export function Login({ onEnter }: { onEnter: (e: Empleado) => void }) {
  return (
    <div className="login">
      <div className="login-card">
        <div className="logo">{EMPRESA.nombre[0]}</div>
        <h1>{EMPRESA.nombre}</h1>
        <p className="lema">{EMPRESA.lema}</p>
        <p className="ayuda">
          Elige con qué empleado entrar. Abre otra ventana con otro empleado para ver los mensajes llegar en vivo.
        </p>
        <div className="empleados">
          {EMPLEADOS.map((e) => (
            <button key={e.id} className="empleado" onClick={() => onEnter(e)}>
              <span className="avatar" style={{ background: e.color }}>{iniciales(e.nombre)}</span>
              <span className="datos">
                <strong>{e.nombre}</strong>
                <small>{e.cargo} · {e.area}</small>
              </span>
              {puedeCrearCanales(e) && <span className="chip admin">Puede crear canales</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
