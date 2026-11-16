import { MediaInfoOverlay, MediaInfoOverlayProps } from "./media-info-overlay";

/**
 * Всплывающее окно с подробной информацией о медиафайле (вызывается по нажатию клавиши I).
 * Полностью делегирует отображение модульному компоненту MediaInfoOverlay.
 */
export const MediaInfoModal = MediaInfoOverlay;
export default MediaInfoModal;
export type { MediaInfoOverlayProps as MediaInfoModalProps };
