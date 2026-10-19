"""Avaliação offline de falsos aceites (FAR) e falsas rejeições (FRR) com imagens AUTORIZADAS.

Estrutura esperada (fora do controle de versão, ex.: ../eval-data):
    eval-data/
      pessoa_01/  enroll.jpg  luz_baixa.jpg  angulo_esq.jpg ...
      pessoa_02/  ...

Para cada pessoa, a primeira imagem em ordem alfabética (ou `enroll.*`, se existir) vira a referência
de cadastro; as demais são tentativas genuínas. Tentativas de impostor = imagens de uma pessoa
comparadas com as referências das outras. Nada é gravado em disco além do relatório opcional.

Uso:
    npm run recognition:evaluate -- --data ../eval-data [--thresholds 0.30,0.363,0.40,0.45] [--out relatorio.json]
"""

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

from .config import Settings
from .errors import Rejection
from .main import build_engine
from .matcher import GalleryItem, match

IMAGE_EXT = {".jpg", ".jpeg", ".png"}


def load_people(root: Path) -> dict[str, list[Path]]:
    people = {}
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        imgs = sorted(p for p in d.iterdir() if p.suffix.lower() in IMAGE_EXT)
        enroll = [p for p in imgs if p.stem.lower() == "enroll"]
        if enroll:
            imgs = enroll + [p for p in imgs if p not in enroll]
        if imgs:
            people[d.name] = imgs
    return people


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", required=True, type=Path)
    ap.add_argument("--thresholds", default="0.25,0.30,0.35,0.363,0.40,0.45,0.50")
    ap.add_argument("--margin", type=float, default=0.05)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    engine = build_engine(Settings())
    people = load_people(args.data)
    if len(people) < 2:
        print("São necessárias pelo menos 2 pessoas para medir falsos aceites.", file=sys.stderr)
        return 1

    refs: dict[str, np.ndarray] = {}
    probes: list[tuple[str, str, np.ndarray]] = []
    quality_rejections: list[tuple[str, str]] = []
    for name, imgs in people.items():
        for i, path in enumerate(imgs):
            img = cv2.imread(str(path))
            if img is None:
                quality_rejections.append((str(path), "invalid_image"))
                continue
            try:
                emb, _ = engine.extract(img)
            except Rejection as r:
                quality_rejections.append((str(path), r.reason))
                continue
            if name not in refs:
                refs[name] = emb  # primeira imagem válida = referência de cadastro
            else:
                probes.append((name, path.name, emb))

    ids = {name: i + 1 for i, name in enumerate(refs)}
    gallery = [GalleryItem(ids[n], e) for n, e in refs.items()]

    # Similaridades brutas (para histograma/escolha de limiar)
    genuine, impostor = [], []
    for name, _, emb in probes:
        for gname, gemb in refs.items():
            s = float(np.dot(emb / np.linalg.norm(emb), gemb / np.linalg.norm(gemb)))
            (genuine if gname == name else impostor).append(s)

    report = {"people": len(refs), "genuine_attempts": len(probes), "quality_rejections": quality_rejections,
              "genuine_similarity": _stats(genuine), "impostor_similarity": _stats(impostor), "thresholds": []}

    print(f"Pessoas: {len(refs)} · tentativas genuínas: {len(probes)} · rejeitadas por qualidade: {len(quality_rejections)}")
    print(f"Similaridade genuína:  {report['genuine_similarity']}")
    print(f"Similaridade impostor: {report['impostor_similarity']}\n")
    print(f"{'limiar':>7} {'FRR':>7} {'FAR(1:N)':>9} {'ambíguos':>9}")
    for t in [float(x) for x in args.thresholds.split(",")]:
        false_rej = false_acc = ambiguous = 0
        for name, _, emb in probes:
            r = match(emb, gallery, t, args.margin)
            if r.reason == "ambiguous":
                ambiguous += 1
            if not r.matched or r.employee_id != ids[name]:
                false_rej += 1
            if r.matched and r.employee_id != ids[name]:
                false_acc += 1
        # Impostor 1:N: cada pessoa tenta com a galeria SEM a própria referência.
        imp_trials = imp_acc = 0
        for name, _, emb in probes:
            others = [g for g in gallery if g.employee_id != ids[name]]
            if others:
                imp_trials += 1
                imp_acc += int(match(emb, others, t, args.margin).matched)
        n = max(1, len(probes))
        row = {"threshold": t, "frr": false_rej / n, "far_open_set": imp_acc / max(1, imp_trials),
               "misidentification": false_acc / n, "ambiguous": ambiguous}
        report["thresholds"].append(row)
        print(f"{t:7.3f} {row['frr']:7.2%} {row['far_open_set']:9.2%} {ambiguous:9d}")

    if args.out:
        args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False))
        print(f"\nRelatório salvo em {args.out}")
    print("\nAmostra pequena NÃO comprova segurança. Ver docs/evaluation.md.")
    return 0


def _stats(values: list[float]) -> dict:
    if not values:
        return {}
    a = np.asarray(values)
    return {"n": int(a.size), "min": round(float(a.min()), 4), "p05": round(float(np.percentile(a, 5)), 4),
            "mean": round(float(a.mean()), 4), "p95": round(float(np.percentile(a, 95)), 4),
            "max": round(float(a.max()), 4)}


if __name__ == "__main__":
    raise SystemExit(main())
