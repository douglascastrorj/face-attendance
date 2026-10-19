import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WebcamView } from '../components/WebcamView';
import { Alert, PageHeader, Spinner } from '../components/ui';
import { api, ApiError, type Employee } from '../lib/api';
import { useWebcam } from '../lib/useWebcam';

export function EnrollPage() {
  const cam = useWebcam();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Employee | null>(null);

  function validate() {
    const e: Record<string, string> = {};
    if (name.trim().length < 3) e.name = 'Informe o nome completo (mínimo 3 caracteres).';
    if (code && !/^[\w.\-/]{1,64}$/.test(code.trim())) e.code = 'Use apenas letras, números, ".", "-", "_" ou "/".';
    if (!image) e.image = 'Capture a imagem facial.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleCapture() {
    const data = cam.capture();
    if (data) {
      setImage(data);
      setErrors((e) => ({ ...e, image: '' }));
    }
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setSubmitError(null);
    if (!validate() || !image) return;
    setBusy(true);
    try {
      const emp = await api.createEmployee({ name: name.trim(), employee_code: code.trim() || null, image_base64: image });
      setCreated(emp);
      setImage(null);
      cam.stop();
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'duplicate_employee_code') setErrors({ code: e.message });
      else if (e.code === 'validation_error') {
        const fields = (e.details?.fields as { field: string; message: string }[]) ?? [];
        setErrors(Object.fromEntries(fields.map((f) => [f.field === 'employee_code' ? 'code' : f.field, f.message])));
      } else {
        setSubmitError(e.message);
        // Rejeição facial: descarta a imagem para forçar nova captura.
        if (e.status === 422) setImage(null);
      }
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setName('');
    setCode('');
    setImage(null);
    setErrors({});
    setSubmitError(null);
  }

  if (created) {
    return (
      <div className="page page-narrow">
        <PageHeader title="Cadastro concluído" />
        <Alert kind="success" title={`${created.name} cadastrado(a) com sucesso.`}>
          Referência biométrica registrada ({created.biometric_samples?.[0]?.model_name}/
          {created.biometric_samples?.[0]?.model_version}). A imagem capturada não foi armazenada.
        </Alert>
        <div className="actions">
          <button className="btn btn-primary" onClick={resetForm}>
            Cadastrar outro
          </button>
          <Link className="btn btn-ghost" to="/funcionarios">
            Ver funcionários
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Cadastrar funcionário"
        subtitle="A imagem é usada apenas para gerar a referência biométrica e não é armazenada."
      />
      <form className="enroll-grid" onSubmit={handleSubmit} noValidate>
        <div className="card">
          <label className="field">
            <span>Nome completo *</span>
            <input value={name} onChange={(e) => (setName(e.target.value), setErrors((er) => ({ ...er, name: '' })))} maxLength={200} autoComplete="off" aria-invalid={!!errors.name} />
            {errors.name && <small className="error-text">{errors.name}</small>}
          </label>
          <label className="field">
            <span>Identificador interno (opcional)</span>
            <input value={code} onChange={(e) => (setCode(e.target.value), setErrors((er) => ({ ...er, code: '' })))} maxLength={64} autoComplete="off" aria-invalid={!!errors.code} />
            {errors.code && <small className="error-text">{errors.code}</small>}
          </label>
          <Alert kind="info">
            O cadastro de biometria facial envolve dado pessoal sensível (LGPD). Garanta que o funcionário foi
            informado e que há base legal adequada antes de prosseguir.
          </Alert>
          {submitError && <Alert kind="error" title="Cadastro não realizado">{submitError}</Alert>}
          <div className="actions">
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/funcionarios')} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? <Spinner label="Processando…" /> : 'Confirmar cadastro'}
            </button>
          </div>
        </div>
        <div className="card">
          <WebcamView videoRef={cam.videoRef} status={cam.status} error={cam.error} preview={image} onStart={cam.start} />
          {errors.image && <small className="error-text">{errors.image}</small>}
          <div className="actions">
            {image ? (
              <button type="button" className="btn btn-ghost" onClick={() => setImage(null)} disabled={busy}>
                Capturar novamente
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={handleCapture} disabled={cam.status !== 'live'}>
                Capturar imagem
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
