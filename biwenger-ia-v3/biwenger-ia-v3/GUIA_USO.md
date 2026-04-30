# Guia de uso de BiwengerIA

## Que es

BiwengerIA es un copiloto fantasy para ayudarte a tomar decisiones antes del cierre de jornada.
No se limita a mostrar un once: intenta decirte que hacer hoy con tu plantilla.

## Flujo principal

### 1. Entra en el copiloto

Abre la ruta `/analyzer`.

Aqui es donde se construye la plantilla, se ajusta el contexto de jornada y se genera el plan.

### 2. Crea una plantilla

En la seccion `Mis plantillas` pulsa `+ Nueva plantilla`.

Cada plantilla representa una liga o un equipo distinto que quieras analizar por separado.

### 3. Anade jugadores

Usa el buscador para encontrar jugadores por nombre o por equipo.

Tambien puedes filtrar por posicion:
- `POR`
- `DEF`
- `CEN`
- `DEL`

Pulsa sobre un jugador para meterlo en tu plantilla.

## Como leer la plantilla

Cada jugador muestra:
- posicion
- equipo
- media
- precio
- mini barras con forma reciente
- estado fisico si no esta en `fit`

## Flags manuales

Cada jugador tiene un boton pequeno que rota entre varios contextos:

- `Normal`: sin ajuste especial
- `Racha`: jugador a priorizar
- `Rotacion`: riesgo de suplencia o minutos bajos
- `Evitar`: muy mala idea alinear hoy salvo emergencia
- `Vuelve`: regresa tras lesion o ausencia

Esto te permite meter tu lectura personal antes de pedir el analisis.

## Escaneo de noticias

Si tienes varios jugadores cargados, puedes pulsar `Escanear`.

El sistema consulta fuentes de noticias y trata de detectar:
- lesiones
- dudas
- riesgo de rotacion
- jugadores en racha

Cuando encuentra senales, actualiza los flags de la plantilla para afinar el plan.

## Contexto de jornada

Antes de generar el plan, rellena:
- `Jornada`
- `Rival principal`
- `Dificultad`
- `Condicion` local o visitante

Esto sirve para que el analisis no sea generico y se adapte a la situacion concreta.

## Generar plan

Pulsa `Generar plan`.

La app devuelve una vista de decision con:

- `Que hacer hoy`: resumen ejecutivo de la jornada
- `Confianza del plan`: cuanto se fia el sistema del once
- `Acciones de hoy`: decisiones concretas
- `Radar de jornada`: confianza, suelo, techo y riesgo
- `Once recomendado`
- `Capitan` y `vicecapitan`
- `Banquillo`
- `Jugadores clave`
- `Siguiente movimiento de mercado`

## Como interpretar el resultado

### Que hacer hoy

Es la idea principal de la jornada.
Si solo fueras a leer una cosa, seria esta.

### Confianza del plan

Es una lectura rapida de estabilidad.
Cuanto mas alta, menos fragil es el once sugerido.

### Acciones de hoy

Son las ordenes mas utiles antes del cierre:
- mantener un capitan
- vigilar un jugador con riesgo
- preparar una operacion de mercado

### Radar de jornada

Da una foto rapida de:
- confianza del once
- suelo de puntos
- techo diferencial
- riesgo de rotacion

### Jugadores clave

Resume por que algunos nombres son especialmente importantes:
- capitan fijo
- titular agresivo
- jugador a vigilar
- comodin de banquillo

### Mercado

No intenta listar cien nombres.
Busca una o dos operaciones concretas con sentido para tu plantilla.

## Modo demo vs modo real

### Modo demo

Si no hay clave de Anthropic, la app sigue funcionando.
Genera un plan razonable usando reglas internas y contexto de plantilla.

### Modo real

Si anades `ANTHROPIC_API_KEY` en tu entorno, el analisis usa IA para afinar:
- razonamiento
- acciones
- radar
- recomendaciones

## Seccion de noticias

La ruta `/noticias` tiene dos usos:

- `Muro en directo (Demo)`: muestra el formato editorial que podria tener el producto
- `Articulos SEO (IA)`: genera articulos largos sobre temas fantasy

No es el centro del producto.
La prioridad del proyecto es el copiloto de decisiones.

## Para que sirve hoy y para que servira despues

### Hoy

Sirve para:
- construir una plantilla
- contextualizar una jornada
- recibir un plan de accion

### Siguiente evolucion natural

Las proximas mejoras mas importantes son:
- importar plantilla real
- importar mercado real
- recomendar puja maxima
- leer rivales y clasificacion
- alertas antes del cierre

## Resumen corto

La app funciona en 5 pasos:

1. Creas una plantilla
2. Metes jugadores
3. Ajustas flags y contexto
4. Escaneas noticias si quieres
5. Generas un plan de jornada con decisiones concretas
