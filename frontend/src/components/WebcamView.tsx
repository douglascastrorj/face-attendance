import type { RefObject } from 'react';
import type { WebcamStatus } from '../lib/useWebcam';
import { Spinner } from './ui';

/** Vídeo da webcam com guia oval de posicionamento. Exibe a imagem capturada quando houver. */
export function WebcamView({
  videoRef,
  status,
  error,
  preview,
  onStart,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: WebcamStatus;
  error: string | null;
  preview?: string | null;
  onStart: () => void;
}) {
  return (
    <div className="webcam">
      <video
        ref={videoRef}
        className="webcam-video"
        playsInline
        muted
        hidden={!!preview || status !== 'live'}
        aria-label="Imagem da câmera"
      />
      {preview && <img className="webcam-video" src={preview} alt="Imagem capturada" />}
      {status === 'live' && !preview && <div className="webcam-guide" aria-hidden />}
      {status !== 'live' && !preview && (
        <div className="webcam-placeholder">
          {status === 'starting' ? (
            <Spinner label="Iniciando câmera…" />
          ) : (
            <>
              {error && <p className="error-text">{error}</p>}
              <button className="btn btn-primary" onClick={onStart}>
                {status === 'error' ? 'Tentar novamente' : 'Ativar câmera'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
