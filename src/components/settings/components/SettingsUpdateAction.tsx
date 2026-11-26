import { useEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import type { Transition } from "motion/react";
import { useTranslation } from "../../../i18n/LanguageContext";
import { useMotionAllowed } from "../../motion/useMotionAllowed";

interface SettingsUpdateActionProps {
  checking: boolean;
  status: string | null;
  hasUpdate: boolean;
  onCheck: () => void;
  onShowUpdate?: () => void;
  isCapsule?: boolean;
}

type UpdateVisualPhase = "idle" | "checking" | "upToDate" | "updateFound";

const INSTANT_TRANSITION: Transition = { duration: 0 };
const MORPH_TRANSITION: Transition = {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1],
};
const POP_SPRING: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 22,
  mass: 0.65,
};

const UPDATE_MORPH_PATHS = {
  /** Верхняя дуга RefreshCw (2 сегмента C) <-> Дуга спиннера загрузки <-> Галочка Check <-> Верх круга ArrowUpCircle. */
  topArcIdle:
    "M 3.40 10.20 C 4.10 5.60 8.20 3.00 13.00 3.20 C 16.50 3.35 19.20 5.40 20.50 8.50",
  topArcChecking:
    "M 3.20 12.00 C 3.20 7.14 7.14 3.20 12.00 3.20 C 16.86 3.20 20.80 7.14 20.80 12.00",
  topArcCheck:
    "M 4.40 12.50 C 6.20 14.30 8.00 16.10 9.80 17.90 C 13.15 14.25 16.50 10.60 19.80 6.90",
  topArcUpdate:
    "M 3.00 12.00 C 3.00 7.03 7.03 3.00 12.00 3.00 C 16.97 3.00 21.00 7.03 21.00 12.00",

  /** Нижняя дуга RefreshCw (2 сегмента C) <-> Хвост спиннера загрузки <-> Сливается в галочку Check <-> Низ круга ArrowUpCircle. */
  bottomArcIdle:
    "M 20.60 13.80 C 19.90 18.40 15.80 21.00 11.00 20.80 C 7.50 20.65 4.80 18.60 3.50 15.50",
  bottomArcChecking:
    "M 20.80 12.00 C 20.80 15.60 18.60 18.70 15.40 20.10 C 13.20 21.00 10.60 21.00 8.40 20.00",
  bottomArcCheck:
    "M 4.40 12.50 C 6.20 14.30 8.00 16.10 9.80 17.90 C 13.15 14.25 16.50 10.60 19.80 6.90",
  bottomArcUpdate:
    "M 21.00 12.00 C 21.00 16.97 16.97 21.00 12.00 21.00 C 7.03 21.00 3.00 16.97 3.00 12.00",

  /** Верхний наконечник стрелки (3 вершины) <-> Складывается в обод при спиннере/галочке <-> Остриё стрелки вверх при найденном обновлении. */
  head1Idle: "M 15.80 8.50 L 20.50 8.50 L 20.50 3.80",
  head1Checking: "M 20.80 11.20 L 20.80 12.00 L 20.80 12.80",
  head1Check: "M 8.50 16.60 L 9.80 17.90 L 11.50 16.00",
  head1Update: "M 8.50 12.00 L 12.00 8.50 L 15.50 12.00",

  /** Нижний наконечник стрелки (3 вершины) <-> Складывается при спиннере/галочке <-> Ствол стрелки вверх при найденном обновлении. */
  head2Idle: "M 8.20 15.50 L 3.50 15.50 L 3.50 20.20",
  head2Checking: "M 8.40 20.00 L 8.40 20.00 L 8.40 20.00",
  head2Check: "M 9.80 17.90 L 9.80 17.90 L 9.80 17.90",
  head2Update: "M 12.00 8.60 L 12.00 12.30 L 12.00 16.00",
} as const;

/**
 * Единый слот проверки обновлений в футере настроек с бесшовным 4-фазным векторным морфингом:
 * 1. `idle` (круговые стрелки RefreshCw) -> `checking` (наконечники складываются в вращающееся кольцо загрузки).
 * 2. `checking` -> `upToDate` (кольцо плавно тормозит и перетекает в зелёную галочку Check)
 *    либо `updateFound` (кольцо замыкается вокруг стрелки вверх ArrowUpCircle).
 * 3. `upToDate` -> `idle` (по истечении таймера галочка Check плавно разворачивается обратно в круговые стрелки RefreshCw).
 */
export function SettingsUpdateAction({
  checking,
  status,
  hasUpdate,
  onCheck,
  onShowUpdate,
  isCapsule,
}: SettingsUpdateActionProps) {
  const { dict } = useTranslation();
  const motionAllowed = useMotionAllowed();

  const targetPhase: UpdateVisualPhase = checking
    ? "checking"
    : status
    ? hasUpdate && onShowUpdate
      ? "updateFound"
      : "upToDate"
    : "idle";

  const [visualPhase, setVisualPhase] = useState<UpdateVisualPhase>(targetPhase);
  const [displayStatus, setDisplayStatus] = useState<string | null>(status);
  const checkStartRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (checking) {
      if (visualPhase !== "checking") {
        checkStartRef.current = performance.now();
        setVisualPhase("checking");
      }
      return;
    }

    if (status) {
      setDisplayStatus(status);
      const nextPhase: UpdateVisualPhase =
        hasUpdate && onShowUpdate ? "updateFound" : "upToDate";
      const elapsed =
        checkStartRef.current > 0
          ? performance.now() - checkStartRef.current
          : 9999;
      const minSpinMs = 480;

      if (visualPhase === "checking" && motionAllowed && elapsed < minSpinMs) {
        timerRef.current = window.setTimeout(() => {
          setVisualPhase(nextPhase);
          timerRef.current = null;
        }, minSpinMs - elapsed);
      } else {
        setVisualPhase(nextPhase);
      }
      return;
    }

    setVisualPhase("idle");
    setDisplayStatus(null);
    checkStartRef.current = 0;
  }, [checking, status, hasUpdate, onShowUpdate, motionAllowed, visualPhase]);

  const isSpinning = visualPhase === "checking";
  const isUpToDate =
    visualPhase === "upToDate" &&
    (displayStatus === dict.settings.integration.upToDate || !hasUpdate);
  const isUpdateFound = visualPhase === "updateFound" && hasUpdate && Boolean(onShowUpdate);

  const morphTransition = motionAllowed ? MORPH_TRANSITION : INSTANT_TRANSITION;
  const popTransition = motionAllowed ? POP_SPRING : INSTANT_TRANSITION;

  const topArcD =
    visualPhase === "checking"
      ? UPDATE_MORPH_PATHS.topArcChecking
      : isUpToDate
      ? UPDATE_MORPH_PATHS.topArcCheck
      : isUpdateFound
      ? UPDATE_MORPH_PATHS.topArcUpdate
      : UPDATE_MORPH_PATHS.topArcIdle;

  const bottomArcD =
    visualPhase === "checking"
      ? UPDATE_MORPH_PATHS.bottomArcChecking
      : isUpToDate
      ? UPDATE_MORPH_PATHS.bottomArcCheck
      : isUpdateFound
      ? UPDATE_MORPH_PATHS.bottomArcUpdate
      : UPDATE_MORPH_PATHS.bottomArcIdle;

  const head1D =
    visualPhase === "checking"
      ? UPDATE_MORPH_PATHS.head1Checking
      : isUpToDate
      ? UPDATE_MORPH_PATHS.head1Check
      : isUpdateFound
      ? UPDATE_MORPH_PATHS.head1Update
      : UPDATE_MORPH_PATHS.head1Idle;

  const head2D =
    visualPhase === "checking"
      ? UPDATE_MORPH_PATHS.head2Checking
      : isUpToDate
      ? UPDATE_MORPH_PATHS.head2Check
      : isUpdateFound
      ? UPDATE_MORPH_PATHS.head2Update
      : UPDATE_MORPH_PATHS.head2Idle;

  const showHeads = visualPhase === "idle" || isUpdateFound;

  const labelText =
    visualPhase === "checking"
      ? dict.settings.integration.checking
      : visualPhase === "upToDate" || visualPhase === "updateFound"
      ? displayStatus || status || dict.settings.integration.checkUpdates
      : dict.settings.integration.checkUpdates;

  const btnClass = isUpdateFound
    ? `settings-footer__btn settings-footer__btn--update ${
        isCapsule ? "settings-card-btn--update" : ""
      }`
    : `settings-footer__btn settings-footer__btn--check ${
        isCapsule ? "settings-card-btn--check-capsule" : ""
      }`;

  return (
    <button
      type="button"
      onClick={() => {
        if (isUpdateFound && onShowUpdate) {
          onShowUpdate();
        } else if (visualPhase === "idle") {
          checkStartRef.current = performance.now();
          setVisualPhase("checking");
          onCheck();
        }
      }}
      disabled={visualPhase === "checking" || visualPhase === "upToDate"}
      className={btnClass}
      aria-label={labelText}
    >
      <m.svg
        xmlns="http://www.w3.org/2000/svg"
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={isUpToDate ? 2.65 : 2.35}
        strokeLinecap="round"
        strokeLinejoin="round"
        shapeRendering="geometricPrecision"
        className="settings-card-btn__icon"
        aria-hidden="true"
        initial={false}
        animate={{
          scale: isUpToDate ? 1.08 : 1,
        }}
        style={{
          color: isUpToDate ? "var(--success-text)" : "currentColor",
          transformOrigin: "12px 12px",
          transition: "color 0.24s ease",
        }}
        transition={popTransition}
      >
        <m.g
          initial={false}
          animate={{
            rotate: isSpinning ? 360 : 0,
          }}
          style={{ transformOrigin: "12px 12px" }}
          transition={
            !motionAllowed
              ? INSTANT_TRANSITION
              : isSpinning
              ? { duration: 0.78, ease: "linear", repeat: Infinity }
              : POP_SPRING
          }
        >
          <m.path
            initial={false}
            animate={{ d: topArcD }}
            transition={morphTransition}
          />
          <m.path
            initial={false}
            animate={{ d: bottomArcD }}
            transition={morphTransition}
          />
          <m.path
            initial={false}
            animate={{
              d: head1D,
              opacity: showHeads ? 1 : 0,
            }}
            transition={morphTransition}
          />
          <m.path
            initial={false}
            animate={{
              d: head2D,
              opacity: showHeads ? 1 : 0,
            }}
            transition={morphTransition}
          />
        </m.g>
      </m.svg>
      <span className="settings-card-btn__text">{labelText}</span>
    </button>
  );
}
