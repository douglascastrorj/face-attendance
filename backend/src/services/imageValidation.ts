import { AppError } from '../errors.js';

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Valida a imagem recebida do navegador (data URL ou base64) antes de encaminhá-la ao Python.
 * Retorna o base64 puro. A imagem só existe em memória durante a requisição.
 */
export function validateImageBase64(input: string, maxBytes: number): string {
  let b64 = input.trim();
  const m = /^data:(image\/(?:jpeg|png));base64,/.exec(b64);
  if (b64.startsWith('data:')) {
    if (!m) throw new AppError(400, 'invalid_image', 'Formato de imagem não suportado (use JPEG ou PNG)');
    b64 = b64.slice(m[0].length);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    throw new AppError(400, 'invalid_image', 'Imagem com codificação base64 inválida');
  }
  if (Math.floor((b64.length * 3) / 4) > maxBytes) {
    throw new AppError(413, 'image_too_large', `Imagem excede ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }
  const head = Buffer.from(b64.slice(0, 16), 'base64');
  const starts = (sig: number[]) => sig.every((b, i) => head[i] === b);
  if (!starts(JPEG) && !starts(PNG)) {
    throw new AppError(400, 'invalid_image', 'Formato de imagem não suportado (use JPEG ou PNG)');
  }
  return b64;
}

/** Mensagens amigáveis para os motivos técnicos de rejeição devolvidos pelo serviço Python. */
export const REJECTION_MESSAGES: Record<string, string> = {
  invalid_image: 'Imagem inválida ou corrompida.',
  image_too_large: 'Imagem muito grande.',
  image_too_small: 'Resolução da imagem muito baixa.',
  no_face: 'Nenhum rosto detectado. Posicione o rosto no centro da câmera.',
  multiple_faces: 'Mais de um rosto detectado. Apenas uma pessoa deve aparecer na imagem.',
  low_detection_confidence: 'Rosto pouco visível. Melhore a iluminação e olhe para a câmera.',
  face_too_small: 'Rosto muito pequeno. Aproxime-se da câmera.',
  blurry: 'Imagem sem nitidez. Fique parado durante a captura.',
  empty_gallery: 'Nenhum funcionário ativo com biometria cadastrada.',
  no_match: 'Funcionário não reconhecido.',
  ambiguous: 'Reconhecimento ambíguo entre funcionários. Tente novamente ou procure o administrador.',
};

export const rejectionMessage = (reason: string | null | undefined) =>
  (reason && REJECTION_MESSAGES[reason]) || 'Não foi possível concluir o reconhecimento.';
