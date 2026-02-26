<div align="center">

# 💰 TaxMil

**Calculadora del impuesto 4×1000 (GMF) de Colombia**

[![Angular](https://img.shields.io/badge/Angular-20-DD0031?logo=angular&logoColor=white)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Deploy](https://img.shields.io/badge/GitHub%20Pages-deployed-success?logo=github)](https://jcuervom.github.io/jc000005-TaxMil/)
[![Tests](https://img.shields.io/badge/tests-53%20passed-brightgreen)]()

[**Ver Demo en Vivo →**](https://jcuervom.github.io/jc000005-TaxMil/)

</div>

---

## 📋 Descripción

**TaxMil** es una calculadora web para el **Gravamen a los Movimientos Financieros (GMF)**, conocido como el **4×1000**, un impuesto colombiano que grava las transacciones financieras.

Ingresa el monto total de tu transacción y TaxMil te muestra al instante:

- ✅ **Cuánto puedes enviar** (monto neto después del impuesto)
- 💸 **Cuánto se cobra de impuesto** (4×1000)
- 📊 **Desglose visual** con barra de proporción y resumen detallado

> **Ejemplo:** Si ingresas **$270.000**, TaxMil calcula que puedes enviar **$268.924** y el impuesto es **$1.076**.

---

## ✨ Características

| Característica                | Detalle                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| ⚡ **Cálculo en tiempo real** | Resultados instantáneos mientras escribes                   |
| 📋 **Copiar al portapapeles** | Un clic para copiar el monto neto                           |
| 📱 **100% Responsive**        | Diseñado mobile-first, funciona en cualquier dispositivo    |
| 🎨 **Diseño moderno**         | UI dark theme con gradientes y animaciones suaves           |
| ♿ **Accesible**              | HTML semántico, ARIA labels, navegación por teclado         |
| 🚀 **Zoneless**               | Angular signals sin Zone.js para máximo rendimiento         |
| 🧪 **53 tests**               | Cobertura completa: lógica, DOM, accesibilidad y edge cases |
| 🌐 **Deploy automático**      | CI/CD con GitHub Actions a GitHub Pages                     |

---

## 🧮 Fórmula

El impuesto **4×1000** se calcula así:

```
Impuesto = Monto × 0.004 / 1.004
Monto Neto = Monto - Impuesto
```

De esta forma, `Monto Neto + Impuesto = Monto Total ingresado`.

---

## 🛠️ Tech Stack

- **Framework:** Angular 20 (standalone components, signals)
- **Lenguaje:** TypeScript 5.8
- **Estilos:** SCSS con variables y responsive design
- **Testing:** Jasmine + Karma (53 specs)
- **Deploy:** GitHub Actions → GitHub Pages
- **Fuente:** Inter (Google Fonts)

---

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js 22+
- npm 10+

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/jcuervom/jc000005-TaxMil.git
cd jc000005-TaxMil

# Instalar dependencias
npm install
```

### Desarrollo

```bash
# Iniciar servidor de desarrollo
npm start
```

Abre [http://localhost:4200](http://localhost:4200) en tu navegador.

### Build de producción

```bash
npm run build
```

Los archivos se generan en `dist/jc000005-TaxMil/browser/`.

### Tests

```bash
# Ejecutar tests
npm test

# Tests en modo headless (CI)
npx ng test --no-watch --browsers=ChromeHeadless
```

---

## 📁 Estructura del Proyecto

```
src/
├── index.html                    # HTML principal
├── styles.scss                   # Estilos globales
├── main.ts                       # Bootstrap de la app
└── app/
    ├── app.ts                    # Componente raíz
    ├── app.html                  # Template raíz
    ├── app.config.ts             # Configuración (zoneless)
    └── calculator/
        ├── calculator.ts         # Lógica: signals, computed, clipboard
        ├── calculator.html       # Template: semántico + accesible
        ├── calculator.scss       # Estilos: responsive + dark theme
        └── calculator.spec.ts    # 53 unit tests
```

---

## 🧪 Cobertura de Tests

| Categoría          | Tests | Descripción                                                |
| ------------------ | ----- | ---------------------------------------------------------- |
| Signals & Computed | 15    | `amount`, `taxAmount`, `netAmount`, `taxPercentageOfTotal` |
| Métodos            | 12    | `formatCOP`, `onInput`, `clear`, `copyNetAmount`           |
| DOM / Template     | 10    | Renderizado condicional, botón copiar, breakdown           |
| Accesibilidad      | 8     | Elementos semánticos, ARIA attributes                      |
| Edge Cases         | 8     | Montos mínimos, tasa exacta, invariantes                   |

---

## 🌐 Deploy

El proyecto se despliega automáticamente a **GitHub Pages** con cada push a `main`.

**URL:** [https://jcuervom.github.io/jc000005-TaxMil/](https://jcuervom.github.io/jc000005-TaxMil/)

El workflow (`.github/workflows/deploy.yml`) ejecuta:

1. `npm ci` — Instala dependencias
2. `ng build --base-href /jc000005-TaxMil/` — Build de producción
3. Deploy a GitHub Pages vía `actions/deploy-pages`

---

## 👤 Autor

**Jose Cuervo**

[![LinkedIn](https://img.shields.io/badge/LinkedIn-j--cuervom-0A66C2?logo=linkedin&logoColor=white)](https://linkedin.com/in/j-cuervom)
[![GitHub](https://img.shields.io/badge/GitHub-jcuervom-181717?logo=github&logoColor=white)](https://github.com/jcuervom)

---

## 📄 Licencia

© 2026 Jose Cuervo. **Todos los derechos reservados.**

Este software es propiedad exclusiva de su autor. Queda **estrictamente prohibido** copiar, modificar, distribuir, sublicenciar o utilizar total o parcialmente este código sin autorización expresa por escrito del autor. Hecho con ❤️ en Colombia 🇨🇴
