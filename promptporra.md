# Prompt — Web de la porra

Trabajas **solo y sin supervisión** durante horas. Nadie responderá preguntas: si algo no está claro, decide con un supuesto razonable y anótalo en `INFORME.md`. Trabaja dentro de esta carpeta y construye todo desde cero. No escribas claves en el código.

## Qué es

Web de una porra de fútbol entre amigos, **100% automática**: el dueño no tiene que hacer nada para que funcione. Cada jornada tiene 3 partidos, siempre en este orden:

1. **Partido 1:** Real Madrid, juegue en casa o fuera.
2. **Partido 2:** FC Barcelona, juegue en casa o fuera.
3. **Partido 3:** SD Ponferradina, juegue en casa o fuera.

Cada participante pronostica el marcador exacto de los tres.

## Jornadas

- Los partidos se ponen solos, con escudos, día y hora.
- Solo partidos de fin de semana, de sábado a lunes. Nunca entre semana.
- Los martes por la mañana la jornada se reinicia sola y pone la siguiente de fin de semana.

## Pronósticos

- El sistema para meter los resultados tiene que ser intuitivo.
- Una vez empezada la jornada, nadie puede poner ningún resultado.

## Partidos

- Marcador, día y hora del partido.
- En vivo: goles y quién los mete, tarjetas, fin de primera parte, descanso, comienzo de segunda parte, final del partido. Datos básicos de un partido.

## Eliminación

- Según termina un partido, el que sea, los participantes que no tienen ese resultado quedan eliminados. Así con el segundo y así con el tercero, salvo que haya un ganador.

## Dinero

- No hay pago ninguno, nunca.
- Hay un bote, que va diciendo el admin.

## Nombre y logo

Busca un nombre y crea un logo propios, con personalidad.

## Diseño

**Lujo, premium. No vale otra cosa.** Tiene que ser algo único y genuino, que llame la atención. Usa el navegador para estudiar webs premiadas (Awwwards, FWA, CSS Design Awards), animaciones y tendencias, y crea algo propio a ese nivel, no una copia.

## Herramientas

- **Navegador:** puedes navegar por internet todo lo que necesites.
- **GitHub, recursos externos:** busca libremente en GitHub repositorios públicos (librerías, utilidades de animación, herramientas de tests, despliegue, ejemplos) y úsalos si son gratuitos y mejoran el resultado.
- **GitHub, tu repo:** tienes git y la cuenta de GitHub del dueño ya autenticada en este equipo (comando `gh`). Con ella crea **un repositorio nuevo** con el nombre elegido, trabaja con commits, sube el código ahí y deja la web publicada y funcionando desde ese repo.
- **Prohibido:** leer, abrir, clonar, listar, modificar o borrar **cualquier otro repositorio** de la cuenta del dueño. Solo existe para ti el repositorio nuevo que tú crees.
- **Skills:** crea las skills que necesites para trabajar mejor (por ejemplo diseño premium, revisión de calidad, pruebas, despliegue) y úsalas de verdad durante el trabajo. Guárdalas en el proyecto y anota en `INFORME.md` cuáles creaste y para qué.

## Condiciones

- Todo gratis: ningún servicio de pago, nunca.
- Todo lo que instales, en su **última versión estable**. Comprueba en el navegador cuál es la última versión de cada cosa antes de instalarla y anótala en `INFORME.md`.
- Los datos (participantes, pronósticos, bote) tienen que guardarse y verse igual para todos desde cualquier dispositivo.
- No crees cuentas nuevas ni introduzcas contraseñas. Si algo lo exige, busca una alternativa gratuita que no lo necesite; si no la hay, anótalo en `INFORME.md`.

## Cómo trabajar

1. Escribe `PLAN.md` con nombre, concepto visual, tecnología elegida y por qué, skills y herramientas que vas a usar, estructura y pasos, antes de programar.
2. Implementa paso a paso con tests de la lógica (eliminación, ganador, bloqueo al empezar la jornada, filtro de fin de semana).
3. Tras cada paso ejecuta los tests; no avances si fallan.
4. Al final escribe `INFORME.md` con:
   - nombre y logo elegidos,
   - dirección del repositorio y de la web publicada,
   - skills creadas,
   - herramientas externas usadas y sus versiones,
   - qué has hecho,
   - la salida **real** de los tests,
   - los supuestos tomados,
   - lo que no funciona.

   No digas que algo funciona si no lo has ejecutado.
