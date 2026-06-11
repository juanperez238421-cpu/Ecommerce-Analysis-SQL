# 🛒 Análisis de Funnel y Retención: Caso MercadoLibre

 <p align="center">
  <img src="ecommerce_sql_portfolio_under25mb_optimized.gif" alt="Circular Double Linked List Animation" width="1280"/>
</p>


Este proyecto utiliza SQL avanzado para deconstruir el comportamiento del usuario en una plataforma de E-commerce. Se centra en la conversión del embudo de ventas y la retención de usuarios a lo largo del tiempo.

## 📄 Informe Ejecutivo (Metodología C-F-I)

### 1. Contexto (Context)
Se analizó el proceso de compra completo de los usuarios, desde la visita inicial hasta la transacción final, abarcando el periodo de **Enero a Agosto de 2025**.
El objetivo fue identificar cuellos de botella en la conversión y medir la fidelidad de los usuarios nuevos agrupados por mes de registro (cohortes).

### 2. Hallazgos (Findings)
Basado en el análisis de datos (ver script SQL):
*   **Fugas en el Funnel:** Se observó una caída significativa de usuarios (aprox. 85%) entre la selección de productos y el inicio del checkout.
*   **Comportamiento de Cohortes:** La retención cae drásticamente después de la primera semana. Menos del 30% de los usuarios regresan después del día 7.
*   **Estabilidad:** Las cohortes de principios de año mostraron un comportamiento más estable que las de los meses recientes.

### 3. Implicaciones y Acciones (Implications)
Para mejorar la rentabilidad y el "Lifetime Value" del usuario:
*   **Optimizar el Checkout:** Simplificar el formulario de `add_shipping_info`, ya que representa una fricción innecesaria donde se pierden muchos clientes.
*   **Estrategia de Re-engagement:** Implementar campañas de Email Marketing automatizadas en el día 3 y 5 post-registro para evitar la caída drástica del día 7.
*   **Incentivos:** Ofrecer envíos gratuitos o descuentos temporales a usuarios que abandonan el carrito para recuperar esa conversión perdida.

---

## 🛠 Habilidades Técnicas Demostradas
*   **CTEs (Common Table Expressions):** Para estructurar y limpiar los datos paso a paso.
*   **JOINs Complejos:** Unificación de múltiples tablas de eventos.
*   **Análisis de Cohortes:** Segmentación temporal para medir retención.
*   **Funciones de Agregación:** `COUNT(DISTINCT)`, `CASE WHEN` y manejo de nulos con `NULLIF`.

## 📂 Estructura del Repositorio
*   `analisis_funnel_retencion.sql`: Código fuente completo con las consultas de extracción y transformación.
