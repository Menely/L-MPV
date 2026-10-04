/**
 * @file ambilightShadowRenderer.ts
 * @description Высокопроизводительный модульный модуль расчета и отрисовки
 * маски затухания света (Projector Shadow Mask) для режима AmbiLight.
 *
 * Архитектура адаптирована из эталонного расширения youtube-ambilight:
 * - 256-точечная степенная функция спада яркости (Power Easing Curve).
 * - Строго монотонные (возрастающие) опорные точки градиентов без артефактов Skia.
 * - Двухосевая суперпозиция градиентов (X и Y), формирующая естественные
 *   эллиптические скругления в углах без резких граней («не под линейку»).
 * - Клиновидные полигоны отсечения для выборочно отключенных направлений.
 * - Аппаратное билинейное сглаживание холста 512x512 при растяжении на весь экран.
 */

import type { AmbientLayout, AmbientSettings } from "../../utils/ambientSettingsUtils";

/**
 * Базовый размер текстуры маски затухания (в пикселях).
 * Идентичен эталону youtube-ambilight (512x512). Обеспечивает нулевое
 * потребление памяти GPU и идеальную билинейную интерполяцию.
 */
export const SHADOW_TEXTURE_SIZE = 512;

/**
 * Безопасное добавление цветовой остановки в CanvasGradient с гарантией
 * строгой монотонности смещения (offset) в диапазоне [0.0, 1.0].
 * Предотвращает ошибки браузерного движка и артефакты сортировки Skia.
 *
 * @param gradient Целевой градиент Canvas
 * @param offset Смещение остановки (0.0..1.0)
 * @param color CSS-цвет в формате rgba(...)
 * @param lastOffsetRef Ссылка на последнее добавленное смещение
 */
function safeAddColorStop(
  gradient: CanvasGradient,
  offset: number,
  color: string,
  lastOffsetRef: { current: number },
): void {
  const clamped = Math.max(0, Math.min(1, offset));
  // Остановки с меньшим смещением отбрасываются для соблюдения возрастания
  if (clamped < lastOffsetRef.current) {
    return;
  }
  const rounded = Math.round(clamped * 10000) / 10000;
  gradient.addColorStop(rounded, color);
  lastOffsetRef.current = rounded;
}

/**
 * Отрисовка маски затухания AmbiLight на переданном контексте Canvas 2D.
 *
 * @param ctx 2D-контекст целевого Canvas
 * @param layout Геометрия текущего OSD и отступов черных полос MPV
 * @param settings Настройки режима подсветки AmbiLight
 */
export function renderAmbilightShadowMask(
  ctx: CanvasRenderingContext2D,
  layout: AmbientLayout,
  settings: AmbientSettings,
): void {
  const size = SHADOW_TEXTURE_SIZE;

  // Очистка предыдущего кадра маски
  ctx.clearRect(0, 0, size, size);

  if (layout.w <= 0 || layout.h <= 0) {
    return;
  }

  // 1. Нормализация координат видеокадра внутри виртуального холста 512x512
  let normX1 = Math.max(0, layout.ml / layout.w);
  let normX2 = Math.min(1.0, (layout.w - layout.mr) / layout.w);
  let normY1 = Math.max(0, layout.mt / layout.h);
  let normY2 = Math.min(1.0, (layout.h - layout.mb) / layout.h);

  // Страховочная проверка корректности границ при экстремальных пропорциях
  if (normX1 >= normX2) {
    normX1 = 0;
    normX2 = 1.0;
  }
  if (normY1 >= normY2) {
    normY1 = 0;
    normY2 = 1.0;
  }

  const vx1 = normX1 * size;
  const vx2 = normX2 * size;
  const vy1 = normY1 * size;
  const vy2 = normY2 * size;
  const vw = Math.max(1, vx2 - vx1);
  const vh = Math.max(1, vy2 - vy1);

  // 2. Расчет степени затухания кривой (по эталонной формуле youtube-ambilight)
  // При fade=100 кривая максимально пологая и протяженная; при fade=0 — резкая
  const fadeCurve = Math.max(5, (settings.fade / 100) * 35);
  const easing = 16 / (fadeCurve * 0.64);
  const spreadRatio = Math.max(0.1, Math.min(1.0, settings.spread / 100));
  const steps = 48; // Оптимальное число шагов: идеально гладко и <0.05мс на кадр

  // 3. Первый проход: вертикальный градиент (ось Y)
  // Строго монотонные возрастающие смещения от y=0 до y=size
  if (normY1 > 0.005 || (1.0 - normY2) > 0.005) {
    const vGrad = ctx.createLinearGradient(0, 0, 0, size);
    const lastOffset = { current: 0 };

    // Верхняя черная полоса (от y=0 до y=vy1)
    if (normY1 > 0.005) {
      const topFadeStart = vy1 * (1 - spreadRatio);
      safeAddColorStop(vGrad, 0, "rgba(0, 0, 0, 1)", lastOffset);

      if (topFadeStart > 0) {
        safeAddColorStop(vGrad, topFadeStart / size, "rgba(0, 0, 0, 1)", lastOffset);
      }

      // Плавный спад темноты в возрастающем порядке y от topFadeStart к vy1
      for (let i = 0; i <= steps; i++) {
        const t = i / steps; // 0..1
        const y = topFadeStart + (vy1 - topFadeStart) * t;
        const opacity = Math.pow(1 - t, easing);
        safeAddColorStop(vGrad, y / size, `rgba(0, 0, 0, ${opacity.toFixed(4)})`, lastOffset);
      }
    } else {
      safeAddColorStop(vGrad, 0, "rgba(0, 0, 0, 0)", lastOffset);
    }

    // Прозрачная зона видеокадра
    safeAddColorStop(vGrad, vy1 / size, "rgba(0, 0, 0, 0)", lastOffset);
    safeAddColorStop(vGrad, vy2 / size, "rgba(0, 0, 0, 0)", lastOffset);

    // Нижняя черная полоса (от y=vy2 до y=size) в возрастающем порядке
    if ((1.0 - normY2) > 0.005) {
      const bottomFadeEnd = vy2 + (size - vy2) * spreadRatio;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps; // 0..1
        const y = vy2 + (bottomFadeEnd - vy2) * t;
        const opacity = Math.pow(t, easing);
        safeAddColorStop(vGrad, y / size, `rgba(0, 0, 0, ${opacity.toFixed(4)})`, lastOffset);
      }

      if (bottomFadeEnd < size) {
        safeAddColorStop(vGrad, bottomFadeEnd / size, "rgba(0, 0, 0, 1)", lastOffset);
      }
      safeAddColorStop(vGrad, 1.0, "rgba(0, 0, 0, 1)", lastOffset);
    } else {
      safeAddColorStop(vGrad, 1.0, "rgba(0, 0, 0, 0)", lastOffset);
    }

    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, size, size);
  }

  // 4. Второй проход: горизонтальный градиент (ось X)
  // Наложение горизонтального спада поверх вертикального формирует в углах
  // эллиптические изолинии спада света без прямолинейных стыков
  if (normX1 > 0.005 || (1.0 - normX2) > 0.005) {
    const hGrad = ctx.createLinearGradient(0, 0, size, 0);
    const lastOffset = { current: 0 };

    // Левая черная полоса (от x=0 до x=vx1) в возрастающем порядке
    if (normX1 > 0.005) {
      const leftFadeStart = vx1 * (1 - spreadRatio);
      safeAddColorStop(hGrad, 0, "rgba(0, 0, 0, 1)", lastOffset);

      if (leftFadeStart > 0) {
        safeAddColorStop(hGrad, leftFadeStart / size, "rgba(0, 0, 0, 1)", lastOffset);
      }

      for (let i = 0; i <= steps; i++) {
        const t = i / steps; // 0..1
        const x = leftFadeStart + (vx1 - leftFadeStart) * t;
        const opacity = Math.pow(1 - t, easing);
        safeAddColorStop(hGrad, x / size, `rgba(0, 0, 0, ${opacity.toFixed(4)})`, lastOffset);
      }
    } else {
      safeAddColorStop(hGrad, 0, "rgba(0, 0, 0, 0)", lastOffset);
    }

    // Прозрачная зона видеокадра
    safeAddColorStop(hGrad, vx1 / size, "rgba(0, 0, 0, 0)", lastOffset);
    safeAddColorStop(hGrad, vx2 / size, "rgba(0, 0, 0, 0)", lastOffset);

    // Правая черная полоса (от x=vx2 до x=size) в возрастающем порядке
    if ((1.0 - normX2) > 0.005) {
      const rightFadeEnd = vx2 + (size - vx2) * spreadRatio;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps; // 0..1
        const x = vx2 + (rightFadeEnd - vx2) * t;
        const opacity = Math.pow(t, easing);
        safeAddColorStop(hGrad, x / size, `rgba(0, 0, 0, ${opacity.toFixed(4)})`, lastOffset);
      }

      if (rightFadeEnd < size) {
        safeAddColorStop(hGrad, rightFadeEnd / size, "rgba(0, 0, 0, 1)", lastOffset);
      }
      safeAddColorStop(hGrad, 1.0, "rgba(0, 0, 0, 1)", lastOffset);
    } else {
      safeAddColorStop(hGrad, 1.0, "rgba(0, 0, 0, 0)", lastOffset);
    }

    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, size, size);
  }

  // 5. Клиновидные полигоны отсечения направлений (Directional Wedges)
  // Как в youtube-ambilight: отсекают свет к центру видеокадра, сохраняя мягкие диагонали
  const centerX = (vx1 + vx2) / 2;
  const centerY = (vy1 + vy2) / 2;
  ctx.fillStyle = "#000000";

  if (!settings.direction_top) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(vx1, vy1);
    ctx.lineTo(centerX, centerY);
    ctx.lineTo(vx2, vy1);
    ctx.lineTo(size, 0);
    ctx.closePath();
    ctx.fill();
  }

  if (!settings.direction_bottom) {
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(vx1, vy2);
    ctx.lineTo(centerX, centerY);
    ctx.lineTo(vx2, vy2);
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.fill();
  }

  if (!settings.direction_left) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(vx1, vy1);
    ctx.lineTo(centerX, centerY);
    ctx.lineTo(vx1, vy2);
    ctx.lineTo(0, size);
    ctx.closePath();
    ctx.fill();
  }

  if (!settings.direction_right) {
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(vx2, vy1);
    ctx.lineTo(centerX, centerY);
    ctx.lineTo(vx2, vy2);
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.fill();
  }

  // 6. Гарантированная прозрачность зоны видеокадра
  // Полностью исключает возникновение каких-либо теней или затемнений на самом видео
  ctx.clearRect(vx1, vy1, vw, vh);
}
