# Desafío 12 Semanas · Bici + Soga

App web para seguir un plan de entrenamiento de 12 semanas basado en **bicicleta** y
**soga de saltar**, pensado para retomar la actividad después de un parón largo y bajar de peso
de forma sostenible. Funciona sin conexión y guarda todo en el navegador: no hay servidor,
no hay cuenta, no hay datos que salgan del dispositivo.

## Cómo usarla

**En la compu:** abrí `index.html` con doble clic. Listo.

**En el teléfono (recomendado):** publicá la carpeta en cualquier hosting estático — por ejemplo
GitHub Pages, activándolo en *Settings → Pages → Deploy from a branch* — entrá desde el celular y
usá "Agregar a pantalla de inicio". Queda como una app nativa y funciona sin señal.

> Los datos viven en el `localStorage` del navegador donde la abriste. Si limpiás el navegador o
> cambiás de teléfono, se pierden: usá **Ajustes → Exportar copia** cada tanto.

## Qué hace

| Pestaña | Para qué sirve |
|---|---|
| **Hoy** | Progreso del desafío, peso, racha, y las sesiones de la semana ordenadas desde hoy. Botones para marcar hecho o registrar. |
| **Plan** | Las 12 semanas completas, con el detalle de cada sesión, volumen y calorías estimadas. |
| **Registro** | Carga de sesiones (tipo, duración, distancia, saltos, RPE, sensación, notas) con cálculo automático de calorías, y la bitácora filtrable. |
| **Peso** | Registro de peso con gráfico de evolución, tendencia de 7 días, línea de meta, IMC, metabolismo basal y objetivo calórico. |
| **Progreso** | Totales acumulados, mapa de constancia de 13 semanas, minutos por semana, 18 logros desbloqueables y tests de control. |
| **Ajustes** | Perfil, día de fútbol, exportar/importar/borrar datos y las advertencias de seguridad. |

## El plan

Cuatro bloques de tres semanas. Cada bloque sube el volumen dos semanas y afloja en la tercera
(**descarga**) para asimilar la carga. La progresión total va de ~175 min la primera semana a
~320 min en la semana 11, alrededor de un 10% de aumento semanal.

| Bloque | Semanas | Foco |
|---|---|---|
| Adaptación | 1-3 | Tolerancia al impacto de la soga y base aeróbica en bici. Sin intervalos duros. |
| Construcción | 4-6 | Entran los intervalos de 1 minuto y las series largas de soga. Test de control en la 6. |
| Intensidad | 7-9 | Intervalos de 2 minutos y bloques de 3 minutos de soga continua. |
| Pico / Cierre | 10-12 | Intervalos de 4 minutos, rodaje largo de hasta 75 min y tests finales. |

Semana tipo (los días se reordenan según cuándo juegues al fútbol):

- **Lunes** — bici suave, ritmo conversado
- **Martes** — soga por series + circuito de fuerza
- **Miércoles** — descanso activo (opcional)
- **Jueves** — bici con intervalos
- **Viernes** — soga corta + core
- **Sábado** — bici larga, la sesión clave para bajar de peso
- **Domingo** — fútbol

### Cómo se estiman las calorías

`kcal = MET × peso × horas`, con los METs del Compendium of Physical Activities
(bici 7,0 · soga 11,8 · fútbol 8,0 · fuerza 5,0 · caminata 3,5) ajustados por intensidad
(suave ×0,8 · moderado ×1,0 · fuerte ×1,28). El metabolismo basal usa Mifflin-St Jeor, y el
gasto diario suma el gasto base (×1,35) más el promedio real de entrenamiento de los últimos
14 días, para no contar dos veces las sesiones.

Son estimaciones orientativas. Ninguna fórmula reemplaza un control médico ni a un nutricionista.

## Estructura

```
index.html          markup y vistas
assets/styles.css   estilos (tema oscuro, mobile-first)
assets/app.js       plan, cálculos, gráficos SVG y persistencia
sw.js               service worker para uso sin conexión
manifest.json       instalación como app
tools/              utilidades de build
```

Sin dependencias, sin build step ni pedidos de red: los gráficos son SVG generados a mano y las
tipografías (Chivo y Karla, subconjunto latino, SIL Open Font License 1.1) van incrustadas en el
CSS para que la app conserve su identidad también sin conexión.

`tools/build-artifact.sh` genera una versión de un solo archivo en `dist/` por si querés publicarla
o compartirla sin la carpeta entera.
