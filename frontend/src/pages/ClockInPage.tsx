import { useState } from 'react';
import { WebcamView } from '../components/WebcamView';
import { Alert, PageHeader, Spinner } from '../components/ui';
import { api, ApiError, type TimeRecord } from '../lib/api';
import { useWebcam } from '../lib/useWebcam';

type Result = { kind: 'success'; record: TimeRecord } | { kind: 'error'; title: string; message: string };

function errorTitle(e: ApiError): string {
  if (e.code === 'duplicate_attendance') return 'Ponto já registrado';
  if (e.code === 'employee_inactive') return 'Funcionário inativo';
  if (e.code.startsWith('recognition_unavailable') || e.code === 'recognition_models_unavailable' || e.code === 'recognition_timeout')
    return 'Reconhecimento indisponível';
  if (e.status === 422) return 'Não foi possível identificar';
  if (e.status === 0) return 'Sem conexão';
  return 'Falha no registro';
}

/** Bater Ponto: captura deliberada (um clique = uma tentativa). Sem reconhecimento contínuo. */
export function ClockInPage() {
  const cam = useWebcam();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function handleCapture() {
    const image = cam.capture();
    if (!image) {
      setResult({ kind: 'error', title: 'Câmera não pronta', message: 'Aguarde a câmera iniciar e tente novamente.' });
      return;
    }
    setPreview(image);
    setResult(null);
    setBusy(true);
    try {
      const record = await api.registerAttendance(image);
      setResult({ kind: 'success', record });
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Erro inesperado');
      setResult({ kind: 'error', title: errorTitle(e), message: e.message });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPreview(null);
    setResult(null);
  }

  return (
    <div className="page page-narrow">
      <PageHeader title="Bater Ponto" subtitle="O horário oficial é registrado pelo servidor." />
      <div className="card clockin">
        <WebcamView videoRef={cam.videoRef} status={cam.status} error={cam.error} preview={preview} onStart={cam.start} />
        <ul className="hints">
          <li>Posicione o rosto dentro da marcação, olhando para a câmera.</li>
          <li>Apenas uma pessoa deve aparecer na imagem.</li>
          <li>Evite contraluz, óculos escuros e bonés.</li>
        </ul>
        <div className="actions">
          {preview && !busy ? (
            <button className="btn btn-primary btn-lg" onClick={reset}>
              Nova tentativa
            </button>
          ) : (
            <button className="btn btn-primary btn-lg" disabled={cam.status !== 'live' || busy} onClick={handleCapture}>
              {busy ? <Spinner label="Identificando…" /> : 'Capturar e registrar'}
            </button>
          )}
        </div>
        <div aria-live="polite">
          {result?.kind === 'success' && (
            <div className="result result-success">
              <span className="result-icon" aria-hidden>
                ✓
              </span>
              <div>
                <div className="result-name">{result.record.employee.name}</div>
                {result.record.employee.employee_code && (
                  <div className="muted">ID {result.record.employee.employee_code}</div>
                )}
                <div className="result-time">{result.record.recorded_at_local}</div>
                <div className="muted small">
                  Horário de Brasília ({result.record.timezone}) · similaridade {result.record.similarity_score.toFixed(3)}
                </div>
              </div>
            </div>
          )}
          {result?.kind === 'error' && (
            <Alert kind="error" title={result.title}>
              {result.message}
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
