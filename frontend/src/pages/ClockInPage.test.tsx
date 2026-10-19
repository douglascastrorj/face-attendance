import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockInPage } from './ClockInPage';

const stopTrack = vi.fn();

function mockWebcam() {
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    configurable: true,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { value: () => Promise.resolve(), configurable: true });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => 640, configurable: true });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 480, configurable: true });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,/9j/AAAA');
}

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  stopTrack.mockReset();
  mockWebcam();
});
afterEach(() => vi.unstubAllGlobals());

describe('Bater Ponto', () => {
  it('captura deliberada envia somente a imagem e exibe o horário do servidor', async () => {
    const fetchMock = mockFetch(201, {
      id: 1,
      recorded_at: '2026-10-17T11:05:09.123Z',
      recorded_at_local: '17/10/2026, 08:05:09',
      timezone: 'America/Sao_Paulo',
      similarity_score: 0.81,
      model_name: 'sface',
      model_version: '2021dec',
      employee: { id: 3, name: 'Maria Silva', employee_code: 'M-1', active: true },
    });
    const user = userEvent.setup();
    render(<ClockInPage />);
    expect(fetchMock).not.toHaveBeenCalled(); // nada acontece sem ação do usuário

    await user.click(screen.getByRole('button', { name: 'Ativar câmera' }));
    const capture = await screen.findByRole('button', { name: 'Capturar e registrar' });
    await waitFor(() => expect(capture).toBeEnabled());
    await user.click(capture);

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('17/10/2026, 08:05:09')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/attendance');
    expect(Object.keys(JSON.parse(init.body))).toEqual(['image_base64']);
  });

  it('exibe mensagem compreensível quando não reconhece', async () => {
    mockFetch(422, { error: { code: 'recognition_no_match', message: 'Funcionário não reconhecido.' } });
    const user = userEvent.setup();
    render(<ClockInPage />);
    await user.click(screen.getByRole('button', { name: 'Ativar câmera' }));
    const capture = await screen.findByRole('button', { name: 'Capturar e registrar' });
    await waitFor(() => expect(capture).toBeEnabled());
    await user.click(capture);
    expect(await screen.findByText('Não foi possível identificar')).toBeInTheDocument();
    expect(screen.getByText('Funcionário não reconhecido.')).toBeInTheDocument();
  });

  it('encerra a webcam ao sair da página', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ClockInPage />);
    await user.click(screen.getByRole('button', { name: 'Ativar câmera' }));
    await screen.findByRole('button', { name: 'Capturar e registrar' });
    unmount();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('informa permissão negada', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    );
    const user = userEvent.setup();
    render(<ClockInPage />);
    await user.click(screen.getByRole('button', { name: 'Ativar câmera' }));
    expect(await screen.findByText(/Permissão da câmera negada/)).toBeInTheDocument();
  });
});
