import { useCallback, useEffect, useRef, useState } from 'react';

export type WebcamStatus = 'idle' | 'starting' | 'live' | 'error';

const MAX_CAPTURE_WIDTH = 1280;

function describeError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (!window.isSecureContext) {
    return 'A câmera exige contexto seguro (https:// ou http://localhost). Acesse pelo endereço localhost.';
  }
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permissão da câmera negada. Libere o acesso nas configurações do navegador e tente novamente.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nenhuma câmera encontrada.';
    case 'NotReadableError':
      return 'A câmera está em uso por outro aplicativo.';
    default:
      return 'Não foi possível acessar a câmera.';
  }
}

/**
 * Controla a webcam: inicia sob demanda, captura um quadro como JPEG (data URL) e
 * SEMPRE encerra as trilhas ao desmontar o componente (sair da página desliga a câmera).
 */
export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<WebcamStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError(describeError(new Error('unsupported')));
      return;
    }
    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus('live');
    } catch (err) {
      setStatus('error');
      setError(describeError(err));
    }
  }, []);

  /** Captura o quadro atual. Retorna data URL JPEG ou null se a câmera não estiver pronta. */
  const capture = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !streamRef.current || !video.videoWidth) return null;
    const scale = Math.min(1, MAX_CAPTURE_WIDTH / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.92);
    canvas.width = canvas.height = 0; // libera o buffer
    return data;
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, status, error, start, stop, capture };
}
