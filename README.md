# Pádel Pro · Torneos Round Robin en vivo

Plataforma web para organizar y seguir **en tiempo real** un torneo de pádel con
**tres categorías independientes (A, B y C)**, **parejas fijas**, **canchas
compartidas** (3 por defecto), **Round Robin automático**, marcadores por sets,
clasificaciones, fase final opcional y premiación.

- **Panel administrativo** (privado) para una sola persona: inscripciones,
  calendario, asignación de canchas, marcadores, correcciones y cierre.
- **Dashboard público** (sin registro, solo lectura) para móvil y ordenador.
- **Modo TV / proyector** con rotación automática.
- **Modo demostración** con 24 jugadores en 12 parejas, separado de los torneos reales.

Stack: React 18 · TypeScript estricto · Tailwind CSS · Vite · Supabase
(PostgreSQL + Auth + Realtime) · Vitest.

---

## 1. Reglas deportivas configuradas

| Regla | Valor por defecto (configurable) |
|---|---|
| Formato | Al mejor de **3 sets completos** a 6 juegos, tie-break a 7 en 6-6 |
| Super tie-break | Desactivado. Si se activa para el set decisivo, cuenta como **1 juego (1-0)** |
| Punto de oro | Desactivado (se juega con ventaja) |
| W.O. | Victoria con el **marcador máximo** del formato (6-0 6-0) |
| Abandono | Se conservan los juegos reales y se **completan a favor del ganador** el set en curso y los restantes |
| Clasificación | 1) partidos ganados → 2) diferencia de juegos → 3) juegos ganados → 4) **diferencia de sets** → 5) enfrentamiento directo → 6) **sorteo** registrado por la organización |
| Fase final | **Opcional**. Solo se activa a mano: semifinales 1º-4º y 2º-3º + final (o final directa 1º-2º). El partido por el 3er puesto es opcional; sin él, el 3er lugar es el semifinalista perdedor mejor clasificado en el Round Robin |
| Campeones | Solo se pueden declarar cuando todos los partidos de la categoría están disputados o cancelados, y sin empates pendientes en el podio |

Los partidos **cancelados** no cuentan para la clasificación. Cuando las parejas
llevan distinto número de partidos jugados, se avisa en pantalla y la columna
PJ lo muestra.

---

## 2. Ejecución local

Necesitas Node.js 18 o superior.

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:5173>.

Sin variables de entorno, la app arranca en **modo local**: los datos se guardan
en el navegador y se sincronizan al instante entre sus pestañas y ventanas (por
ejemplo, el panel en el portátil y el modo TV en un segundo monitor). Cada
torneo se protege con un PIN. Para que jugadores y público sigan el torneo
desde **sus propios móviles**, configura Supabase (sección 3).

Otros comandos:

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

---

## 3. Configurar Supabase (producción)

1. Crea un proyecto en <https://supabase.com>.
2. En **SQL Editor**, ejecuta en este orden los archivos
   `supabase/migrations/20261119000000_init.sql` y
   `supabase/migrations/20261120000000_grants.sql`. También puedes usar la CLI:

   ```bash
   supabase link --project-ref <tu-proyecto>
   ```

   ```bash
   supabase db push
   ```

   La migración crea las tablas, las restricciones deportivas, las políticas
   RLS, las funciones RPC transaccionales y activa Realtime en la tabla
   `tournaments`.
3. En **Authentication → Providers**, deja **Email** activado. Hay dos formas de
   dar de alta a quien organiza:
   - crear el usuario a mano en **Authentication → Users → Add user**, o
   - registrarse desde `/login` con "Crear cuenta". Si la confirmación por
     correo está activada, hay que confirmar el correo antes de entrar.

   Cuando ya exista tu cuenta, puedes **desactivar los registros nuevos** en
   *Authentication → Sign In / Providers* para que nadie más pueda crear cuentas.
4. En **Project Settings → API**, copia la *Project URL* y la *anon public key*.
5. Crea `.env.local` a partir de `.env.example`:

   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   VITE_PUBLIC_BASE_URL=https://tu-dominio.com   # opcional, para enlaces y QR
   ```

La *anon key* es pública por diseño. La seguridad la garantiza RLS: cualquiera
puede **leer**, pero solo se puede **escribir** a través de las funciones
`apply_changes` y `create_tournament`, que comprueban que el usuario autenticado
es el organizador del torneo.

### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `VITE_SUPABASE_URL` | Para producción | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Para producción | Clave pública *anon* |
| `VITE_PUBLIC_BASE_URL` | No | Dominio público para enlaces y QR (por defecto, el origen actual) |

---

## 4. Despliegue

Es una SPA estática. El directorio `dist/` puede servirse desde cualquier CDN.

**Vercel:** importa el repositorio, elige el framework *Vite*, añade las
variables de entorno y despliega. `vercel.json` ya incluye la reescritura de
rutas a `index.html`.

**Netlify:** usa `npm run build` como comando de build y `dist` como directorio
de publicación. Añade las variables de entorno. `public/_redirects` ya está
incluido.

**Cloudflare Pages u otros:** usa `npm run build` como comando de build y `dist`
como salida. Configura un *fallback* SPA a `/index.html`.

Después del despliegue, añade tu dominio en Supabase, en **Authentication → URL
Configuration** (*Site URL* y *Redirect URLs*).

---

## 5. Uso durante el torneo

1. **Inicio:** crea el torneo. Las categorías A, B y C y las 3 canchas se crean
   solas.
2. **Inscripciones:** escribe Jugador 1, Jugador 2, elige la categoría y pulsa
   *Agregar pareja*. También puedes importar las parejas desde CSV/Excel (hay
   plantilla descargable). El sistema impide jugadores repetidos y parejas
   incompletas.
3. **Categorías y cierre:** genera el calendario de cada categoría, eligiendo
   entre una o varias vueltas completas o un número reducido de partidos por
   pareja. Desde ese momento las parejas quedan fijas.
4. **Control en vivo:** cada cancha libre muestra una **propuesta** de partido.
   Para elegirla, el sistema tiene en cuenta los descansos mínimos, que nadie
   repita rival antes de enfrentarse a todos, el progreso equilibrado de A/B/C
   y el tiempo de espera de las parejas.
   - *Confirmar* o *Elegir otro* → *Iniciar* → *Resultado*.
   - Al registrar el resultado, la cancha queda libre y aparece la siguiente
     propuesta.
   - Desde aquí también se mueve un partido de cancha (si la otra está ocupada,
     se intercambian), se pospone, se suspende o se devuelve a pendientes.
5. **Correcciones:** el resultado se puede corregir o anular en cualquier
   momento mientras la categoría esté abierta. Las estadísticas se recalculan
   siempre desde el historial oficial, así que corregir nunca duplica
   victorias.
6. **Cierre:** con la categoría completa puedes hacer el sorteo (si hay empate
   absoluto) y luego *Declarar campeones* o *Activar fase eliminatoria*. Cuando
   todas las categorías estén cerradas, pulsa *Finalizar torneo* para que se
   muestre la pantalla de premiación.
7. **Compartir:** desde aquí tienes el enlace público, el QR (descargable en
   PNG o imprimible), el enlace al modo TV y las exportaciones en PDF y CSV.

**Modo TV:** `/t/<slug>/tv?intervalo=15`. Teclas: ← → cambiar de pantalla,
espacio para pausar, F para pantalla completa. La pantalla se mantiene encendida
(Wake Lock) y se reconecta sola.

---

## 6. Arquitectura

```
src/
  domain/            Lógica pura, sin dependencias de UI ni de red (100 % testeada)
    types.ts           Modelo: torneo, categorías, jugadores, parejas, integrantes,
                       canchas, partidos, sets, configuración
    roundRobin.ts      Método del círculo (Berger), vueltas, partidos reducidos, impares
    scheduler.ts       Propuestas de cancha, prioridades, simulación del calendario
    format.ts          Validación de sets/partidos, tie-break, super TB, W.O., abandono
    standings.ts       Clasificación desde el historial, desempates, evolución
    stats.ts           Historial, rachas, enfrentamientos directos, datos destacados
    commands.ts        Todas las operaciones (inmutables y validadas)
    demo.ts            Datos y simulación del modo demostración
  data/
    repository.ts      Contrato de persistencia
    supabaseRepo.ts    PostgreSQL + Auth + Realtime
    localRepo.ts       localStorage + BroadcastChannel
    diff.ts            Diferencias fila a fila → una transacción por cambio
  hooks/               Estado del torneo, tiempo real, autenticación, avisos
  components/          UI reutilizable: canchas, tabla animada, podio, marcadores
  pages/public/        En vivo, clasificación, calendario, parejas, ficha, premiación, TV
  pages/admin/         Control en vivo, inscripciones, partidos, cierre, ajustes, compartir
supabase/migrations/   Esquema SQL, RLS, RPC y vista de estadísticas
```

**Flujo de un cambio:** el comando de dominio valida y produce el nuevo estado.
`diff.ts` calcula qué filas cambian y la función `apply_changes` las aplica en
**una sola transacción**, con control de concurrencia optimista (`revision`).
La base de datos tiene además sus propias garantías:

- una cancha no puede tener dos partidos activos (restricción `EXCLUDE`);
- una pareja no puede jugar dos partidos a la vez (*trigger*);
- los partidos solo enfrentan parejas de la misma categoría;
- no puede haber jugadores duplicados;
- cada pareja tiene exactamente dos integrantes.

Cada guardado incrementa `tournaments.revision`. Supabase Realtime avisa a todas
las pantallas, que recargan el estado sin refrescar la página. Si la conexión
se corta, hay sondeo de respaldo cada 30 s y reconexión automática.

---

## 7. Pruebas

- **Dominio:** más de 75 pruebas que cubren:
  - Round Robin de 2 a 16 parejas, impares, varias vueltas y número reducido de
    partidos;
  - separación de categorías y permanencia de las parejas;
  - asignación de canchas y ausencia de solapes;
  - descansos mínimos y equilibrio entre categorías;
  - validación de marcadores, W.O. y abandonos;
  - clasificación, desempates y sorteo;
  - corrección de resultados, partidos suspendidos y cancelados;
  - categorías que terminan antes que otras y fase final;
  - simulación completa del torneo demo.
- **Base de datos:** prueba de integración con PostgreSQL real (ver
  `supabase/test/README.md`). Cubre transacciones, concurrencia, permisos,
  restricciones y la coincidencia entre la vista SQL y la clasificación.
