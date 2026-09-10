# PLAN.md

## Nombre
Futbolra - Pronósticos de Fútbol Premium

## Concepto visual
Plataforma premium y elegante para predicciones de fútbol entre amigos, con un diseño minimalista y lujoso que refleja la profesionalidad del deporte. Interfaz intuitiva que muestra en tiempo real el estado de las predicciones, eliminaciones y progreso del concurso.

## Tecnología elegida
- **Backend:** Node.js + Express - ambiente de ejecución moderno y escalable
- **Frontend:** Vanilla JavaScript + CSS Grid + Tailwind CSS - diseño premium sin frameworks adicionales
- **Almacenamiento:** Firebase Realtime Database - sin costos, sincronización en tiempo real y acceso desde cualquier dispositivo
- **Autenticación:** Sin autenticación - solo almacenamiento de sesión anónima
- **GitHub Actions:** CI/CD para pruebas y despliegue automatizado

## Skills y herramientas que voy a usar
1. **Animaciones premium:** Para transiciones fluidas y micro-interacciones de alta calidad
2. **Revisión de calidad:** Para garantizar la consistencia visual y la funcionalidad
3. **Despliegue:** Para automatizar el despliegue desde GitHub
4. **Herramientas premium:** Awwwards, FWA, CSS Design Awards para inspiración de diseño

## Estructura y pasos

### Estructura del proyecto
```
futbolra/
├── public/
│   ├── index.html
│   └── styles.css
├── src/
│   ├── core/
│   │   ├── GameManager.js
│   │   ├── Match.js
│   │   └── Participant.js
│   ├── ui/
│   │   ├── App.js
│   │   ├── MatchCard.js
│   │   └── PredictionForm.js
│   ├── services/
│   │   ├── DataService.js
│   │   └── ScheduleService.js
│   └── utils/
│       ├── validators.js
│       └── formatters.js
├── tests/
│   ├── core/
│   │   ├── GameManager.test.js
│   │   ├── Match.test.js
│   │   └── Participant.test.js
│   ├── ui/
│   │   ├── App.test.js
│   │   └── MatchCard.test.js
│   └── services/
│       ├── DataService.test.js
│       └── ScheduleService.test.js
├── .github/
│   └── workflows/
│       └── deploy.yml
├── package.json
├── README.md
└── INFORME.md
```

### Pasos de implementación

1. **Configuración inicial:** Instalar dependencias, configurar GitHub Actions
2. **Servicios básicos:** Implementar DataService y ScheduleService
3. **Lógica central:** GameManager, Match, Participant con reglas de negocio
4. **Componentes de UI:** App.js, MatchCard.js, PredictionForm.js
5. **Funcionalidades:** Eliminación, filtro de fin de semana, reinicio semanal
6. **Pruebas:** Cubrir toda la lógica central y componentes UI
7. **Despliegue:** Configurar CI/CD y desplegar a GitHub Pages
8. **Documentación:** Escribir INFORME.md completo

### Pasos de cada jornada
1. **Martes 00:00:** ScheduleService resetea y carga nueva jornada de 3 partidos
2. **Miércoles-Domingo:** Los participantes pueden hacer predicciones
3. **En vivo:** Los partidos se juegan, los goles se actualizan en tiempo real
4. **Después de cada partido:** Eliminación automática de participantes sin predicción correcta
5. **Lunes:** Una vez finalizados todos los partidos, se determina el ganador

## Supuestos

- Los datos de los partidos (escudos, día/hora) se cargarán desde una API o se simularán
- El sistema de puntuación se basa en predicciones correctas de goles exactos
- No se requieren sesiones de usuario, el almacenamiento es anónimo
- Los partidos siempre siguen el orden: Real Madrid, FC Barcelona, SD Ponferradina
- Solo se permiten partidos de sábado a lunes (fin de semana)
- Una vez iniciada una jornada, no se pueden hacer nuevas predicciones

## Herramientas externas

- **GitHub:** Para control de versiones, CI/CD y despliegue
- **Firebase:** Almacenamiento en tiempo real sin servidor
- **Awwwards/FWA/CSS Design Awards:** Referencia para diseño premium
- **Animaciones:** Usar librerías premium como GSAP si es necesario
- **Tests:** Jest para pruebas unitarias

## Punto de verificación

Al final del día 1, haber:
1. ✅ Creado un nuevo repositorio en GitHub con nombre único
2. ✅ Configurado entorno de Node.js y npm
3. ✅ Instalado todas las dependencias en última versión estable
4. ✅ Escrito PLAN.md completo como se describe
5. ✅ Implementado al menos un componente funcional
6. ✅ Escrito tests para el componente implementado
7. ✅ Tener el componente funcionando en navegador local
