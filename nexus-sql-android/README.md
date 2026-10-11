# NEXUS / SQL Protocol — Android v0.4

**NATIVE Android application project** (Java 17 + Android WebView/Canvas 2D + SQLiteDatabase).

## Estado del artefacto

This folder is **source code, not a compiled APK**. A real, installable APK is created by running the Android build workflow. A real APK must contain `AndroidManifest.xml` in binary form, `classes.dex`, assets, and a valid signature. Renaming a ZIP to `.apk` is not a valid build.

## Características

- Funciona **100% sin internet y sin Python** en Android.
- UI local de NEXUS v0.3, ambientes AURORA-7 / DUST-9 / CRYO-2, Canvas 2D con animaciones fluidas.
- Base SQLite **nativa**, persistida en sandbox privado de Android; se conserva al cerrar/reabrir.
- Puente seguro Android `JavascriptInterface` con consultas de solo lectura.
- Motor de dos drones: navegación BFS, extracción, entregas, recarga, inventario, recursos y progreso.
- No pide permiso de Internet, almacenamiento externo, cámara, ubicación ni micrófono.

## Cómo generar APK instalable

1. Instala Android Studio con Android SDK Platform **35** y Build Tools **35**.
2. Abre esta carpeta (`NEXUS_SQL_PROTOCOL_ANDROID_0_4`) como proyecto Gradle.
3. Espera sincronización y elige **Build > Build APK(s)** (variante `debug`).
4. El APK firmado con clave de depuración queda en `app/build/outputs/apk/debug/app-debug.apk`.
5. Copia ese archivo al teléfono y pulsa **Instalar**. Es posible que Android solicite autorización para instalar desde la aplicación origen.

Alternativa automatizada: GitHub Actions en `.github/workflows/android-apk.yml` genera el mismo APK con Gradle 8.11.1, AGP 8.7.3 y Java 17. Descarga el artefacto ZIP del workflow, que **sí incluye el APK real** si la ejecución finalizó correctamente.

> La clave debug sirve para probar e instalar, no para publicar en Google Play. Una versión de distribución necesita firma release privada, administrada fuera del repositorio.

## Protección SQL

La interfaz consulta una conexión SQLite de solo lectura. El controlador nativo valida y ejecuta las órdenes y modifica las tablas de forma transaccional. El comando SQL retornado por el jugador no obtiene permisos de escritura.

## Pruebas locales disponibles

```bash
python -m unittest discover -s tests -v
node --check app/src/main/assets/game.js
```

Las pruebas de contrato SQL no sustituyen instalación y ejecución en dispositivo real; esa comprobación requiere SDK/emulador o teléfono.

## Estructura

- `app/src/main/java/com/nexus/sqlprotocol/MainActivity.java`: actividad, WebView y API segura.
- `app/src/main/java/com/nexus/sqlprotocol/NativeEngine.java`: motor Android, SQLite y navegación.
- `app/src/main/assets/`: mundo Canvas 2D, CSS, controles, SQL y esquema.
- `.github/workflows/android-apk.yml`: pipeline CI de construcción + validación.
- `tests/`: pruebas SQL del esquema Android.
