"""Teste de fumaça ponta a ponta contra os serviços em execução (npm run dev).

Usa imagens de domínio público do scikit-image ("astronaut" = NASA/Eileen Collins; "camera" = cameraman).
Cria dados reais no banco configurado — rode em ambiente de desenvolvimento.
Uso: npm run test:e2e   (equivale a: cd recognition && poetry run python ../scripts/e2e/smoke.py)
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import cv2
from skimage import data

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:5173")
ROOT = Path(__file__).resolve().parents[2]


def env_value(key: str) -> str | None:
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return None


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    if body is not None:
        req.data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def jpeg(img) -> str:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode()


results = []


def check(name, cond, info=""):
    results.append(cond)
    print(f"{'✔' if cond else '✖'} {name} {info}")


astronaut = cv2.cvtColor(data.astronaut(), cv2.COLOR_RGB2BGR)
cameraman = cv2.resize(cv2.cvtColor(data.camera(), cv2.COLOR_GRAY2BGR), None, fx=2, fy=2)
suffix = str(int(time.time()))

_, login = call("POST", "/api/auth/login", {"password": env_value("ADMIN_PASSWORD")})
token = login["token"]

s, emp = call("POST", "/api/employees", {"name": "Eileen Collins (teste)", "employee_code": f"E2E-{suffix}",
                                         "image_base64": jpeg(astronaut)}, token)
check("cadastro com rosto válido → 201", s == 201, f"id={emp.get('id')}")
check("resposta não expõe embedding", "embedding" not in json.dumps(emp).replace("embedding_dim", ""))

s, r = call("POST", "/api/employees", {"name": "Duplicado Teste", "employee_code": f"E2E-{suffix}",
                                       "image_base64": jpeg(cameraman)}, token)
check("identificador duplicado → 409", s == 409)

s, r = call("POST", "/api/employees", {"name": "Dois Rostos", "image_base64": jpeg(cv2.hconcat([astronaut, astronaut]))}, token)
check("cadastro com 2 rostos → 422 multiple_faces", s == 422 and r["error"]["details"]["reason"] == "multiple_faces")

blank = cv2.cvtColor(cv2.resize(data.camera()[:100, :100], (400, 400)), cv2.COLOR_GRAY2BGR) * 0 + 120
s, r = call("POST", "/api/employees", {"name": "Sem Rosto", "image_base64": jpeg(blank)}, token)
check("cadastro sem rosto → 422 no_face", s == 422 and r["error"]["details"]["reason"] == "no_face")

s, rec = call("POST", "/api/attendance", {"image_base64": jpeg(cv2.flip(astronaut, 1))})
check("ponto da pessoa cadastrada (imagem espelhada) → 201", s == 201,
      f"{rec.get('employee', {}).get('name')} {rec.get('recorded_at_local')} sim={rec.get('similarity_score')}")

s, r = call("POST", "/api/attendance", {"image_base64": jpeg(astronaut)})
check("segundo ponto em < 30 s → 409 duplicate_attendance", s == 409 and r["error"]["code"] == "duplicate_attendance")

s, r = call("POST", "/api/attendance", {"image_base64": jpeg(cameraman)})
check("pessoa desconhecida → 422 (sem registro)", s == 422, r["error"]["code"])

s, r = call("POST", "/api/attendance", {"image_base64": jpeg(astronaut), "employee_id": emp["id"]})
check("employee_id enviado pelo cliente → 400", s == 400)

s, hist = call("GET", f"/api/attendance?employee_id={emp['id']}", token=token)
check("histórico do funcionário contém o registro", s == 200 and hist["total"] == 1)

s, d = call("DELETE", f"/api/employees/{emp['id']}", token=token)
check("desativação exclui biometria", s == 200 and d["biometric_samples_deleted"] == 1)

s, r = call("POST", "/api/attendance", {"image_base64": jpeg(astronaut)})
check("funcionário desativado não registra ponto", s == 422, r["error"]["code"])

s, hist = call("GET", f"/api/attendance?employee_id={emp['id']}", token=token)
check("histórico preservado após desativação", s == 200 and hist["total"] == 1 and hist["items"][0]["employee"]["active"] is False)

print(f"\n{sum(results)}/{len(results)} verificações aprovadas")
sys.exit(0 if all(results) else 1)
