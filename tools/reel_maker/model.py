from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

W, H, FPS = 1080, 1920, 30
DURATION = 2.8
SAFE_L = SAFE_R = 110
SAFE_TOP, SAFE_BOTTOM = 180, 260
CONTENT_TOP, CONTENT_BOTTOM = 430, 1590
CREAM, INK, RED, MUTED, RULE = "#F5F0E6", "#111111", "#B3262D", "#5D5A55", "#D6CEC0"
CREAM_RGB = (245, 240, 230)


@dataclass(frozen=True)
class Contract:
    source_commit: str
    canonical_url: str
    published_date: str
    title: str
    dek: str
    highlights: list[dict[str, str]]

    @classmethod
    def load(cls, path: str | Path) -> "Contract":
        raw: dict[str, Any] = json.loads(Path(path).read_text(encoding="utf-8"))
        required = ("sourceCommit", "canonicalUrl", "publishedDate", "title", "dek")
        missing = [key for key in required if key not in raw]
        if missing:
            raise ValueError("Contrato ATLAS incompleto; faltan: " + ", ".join(missing))

        version = str(raw.get("version", "1"))
        if version == "2":
            raw_highlights = raw.get("highlights")
        elif version == "1":
            source_id = str(raw.get("sourceId", "")).strip()
            if not source_id:
                raise ValueError("Contrato v1 requiere sourceId para recuperar las 5 noticias publicadas")
            source = (Path.cwd() / source_id).resolve()
            root = Path.cwd().resolve()
            if root not in source.parents:
                raise ValueError("sourceId inseguro en contrato v1")
            raw_highlights = _published_highlights(source)
        else:
            raise ValueError(f"Versión de contrato social no soportada: {version}")

        if not isinstance(raw_highlights, list) or len(raw_highlights) != 5:
            found = len(raw_highlights) if isinstance(raw_highlights, list) else 0
            raise ValueError(f"Reel Maker requiere exactamente 5 noticias publicadas; encontradas {found}")
        highlights: list[dict[str, str]] = []
        for index, item in enumerate(raw_highlights):
            if not isinstance(item, dict) or not all(k in item for k in ("label", "text")):
                raise ValueError(f"Cada highlight debe tener label y text: índice {index}")
            label = str(item["label"]).strip()
            text = str(item["text"]).strip()
            if not label or not text:
                raise ValueError(f"highlight vacío: índice {index}")
            if len(label) > 72:
                raise ValueError(f"highlight[{index}].label excede 72 caracteres")
            if len(text) > 180:
                raise ValueError(f"highlight[{index}].text excede 180 caracteres")
            highlights.append({"label": label, "text": text})
        canonical = str(raw["canonicalUrl"]).strip()
        parsed = urlparse(canonical)
        if parsed.scheme != "https" or not parsed.netloc:
            raise ValueError("canonicalUrl debe ser una URL HTTPS válida")
        source = str(raw["sourceCommit"]).strip()
        if not source:
            raise ValueError("sourceCommit no puede estar vacío")
        return cls(
            source_commit=source,
            canonical_url=canonical,
            published_date=str(raw["publishedDate"]),
            title=str(raw["title"]),
            dek=str(raw["dek"]),
            highlights=highlights,
        )


def _yaml_scalar(raw: str) -> str:
    value = raw.strip()
    if value.startswith('"') and value.endswith('"'):
        return str(json.loads(value))
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    return value


def _published_highlights(source: Path) -> list[dict[str, str]]:
    if not source.is_file():
        raise FileNotFoundError(f"Edición publicada no encontrada: {source}")
    text = source.read_text(encoding="utf-8")
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError(f"Frontmatter inválido en edición: {source}")
    lines = parts[1].splitlines()
    try:
        start = lines.index("highlights:")
    except ValueError:
        return []
    items: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for line in lines[start + 1 :]:
        if line and not line.startswith(" "):
            break
        stripped = line.strip()
        if stripped.startswith("- label:"):
            if current:
                items.append(current)
            current = {"label": _yaml_scalar(stripped.split(":", 1)[1]), "text": ""}
        elif stripped.startswith("text:") and current is not None:
            current["text"] = _yaml_scalar(stripped.split(":", 1)[1])
    if current:
        items.append(current)
    return [item for item in items if item.get("label") and item.get("text")]


@dataclass(frozen=True)
class Layout:
    size: int
    lines: list[str]
    gap: float

    @property
    def height(self) -> float:
        if not self.lines:
            return 0.0
        return self.size + (len(self.lines) - 1) * self.size * self.gap


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def char_em(ch: str) -> float:
    if ch.isspace():
        return 0.33
    if ch in "ilI|!.,:;'`´()[]{}":
        return 0.30
    if ch in "mwMW@%&QGÓÁÉÚÑ":
        return 0.92
    if ch.isdigit():
        return 0.64
    if ch.isupper():
        return 0.74
    return 0.59


def estimated_width(text: str, size: int, weight: str) -> float:
    factor = 1.035 if weight == "700" else 1.0
    return sum(char_em(ch) for ch in text) * size * factor


def paragraphs(text: str) -> list[str]:
    result: list[str] = []
    for paragraph in str(text).replace("\r", "").split("\n"):
        normalized = " ".join(paragraph.split())
        if normalized:
            result.append(normalized)
    return result


def wrap(text: str, size: int, width: int, max_lines: int, label: str, weight: str) -> list[str]:
    lines: list[str] = []
    source = paragraphs(text)
    for p_index, paragraph in enumerate(source):
        current = ""
        for word in paragraph.split():
            if estimated_width(word, size, weight) > width:
                raise ValueError(f"{label} no cabe: token individual demasiado ancho: {word}")
            candidate = word if not current else f"{current} {word}"
            if estimated_width(candidate, size, weight) <= width:
                current = candidate
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        if p_index < len(source) - 1:
            lines.append("")
    while lines and not lines[-1]:
        lines.pop()
    if len(lines) > max_lines:
        raise ValueError(f"{label} no cabe: requiere {len(lines)} líneas; máximo {max_lines}")
    return lines


def fit(
    text: str,
    base: int,
    minimum: int,
    width: int,
    max_lines: int,
    label: str,
    weight: str = "400",
    gap: float = 1.16,
) -> Layout:
    last: Exception | None = None
    for size in range(base, minimum - 1, -2):
        try:
            return Layout(size, wrap(text, size, width, max_lines, label, weight), gap)
        except ValueError as exc:
            last = exc
    raise ValueError(f"{label} no cabe dentro del área segura: {last}")


def text_svg(layout: Layout, x: int, y: int, weight: str) -> str:
    spans: list[str] = []
    first = True
    for line in layout.lines:
        dy = 0 if first else layout.size * layout.gap
        first = False
        spans.append(f'<tspan x="{x}" dy="{dy:.1f}">{esc(line)}</tspan>')
    return (
        f'<text x="{x}" y="{y}" fill="{INK}" '
        f'font-family="Georgia, DejaVu Serif, serif" font-size="{layout.size}" '
        f'font-weight="{weight}">{"".join(spans)}</text>'
    )


def image_svg(path: Path | None) -> str:
    if path is None:
        return ""
    if not path.is_file():
        raise FileNotFoundError(f"Imagen no encontrada: {path}")
    return (
        f'<image href="{esc(path.as_uri())}" x="0" y="0" width="{W}" height="{H}" '
        'preserveAspectRatio="xMidYMid slice" opacity="0.18"/>'
    )


def frame(index: int, contract: Contract) -> str:
    right = W - SAFE_R
    date = contract.published_date[:10]
    footer_y = H - SAFE_BOTTOM + 35
    return (
        f'<text x="{SAFE_L}" y="{SAFE_TOP}" fill="{RED}" font-family="Arial, sans-serif" '
        'font-size="28" font-weight="700" letter-spacing="5">ATLAS NEWS</text>'
        f'<text x="{right}" y="{SAFE_TOP}" fill="{MUTED}" font-family="Arial, sans-serif" '
        f'font-size="25" text-anchor="end">{index:02d} / 07</text>'
        f'<line x1="{SAFE_L}" y1="{SAFE_TOP + 34}" x2="{right}" y2="{SAFE_TOP + 34}" '
        f'stroke="{RULE}" stroke-width="3"/>'
        f'<line x1="{SAFE_L}" y1="{footer_y}" x2="{right}" y2="{footer_y}" '
        f'stroke="{RULE}" stroke-width="3"/>'
        f'<text x="{SAFE_L}" y="{footer_y + 47}" fill="{MUTED}" font-family="Arial, sans-serif" '
        f'font-size="24">{esc(date)}</text>'
        f'<text x="{right}" y="{footer_y + 47}" fill="{MUTED}" font-family="Arial, sans-serif" '
        f'font-size="24" text-anchor="end">{esc(contract.source_commit[:10])}</text>'
    )


def scene_specs(contract: Contract) -> list[tuple[str, str, str]]:
    host = urlparse(contract.canonical_url).hostname or "eldesiempre100.github.io"
    specs: list[tuple[str, str, str]] = [("Titular", contract.title, contract.dek)]
    for index, item in enumerate(contract.highlights, 1):
        specs.append((f"En una mirada {index}", item["label"], item["text"]))
    specs.append(("Cierre", "ATLAS NEWS", f"Lee la edición completa en\n{host}"))
    return specs


def plate(index: int, spec: tuple[str, str, str], contract: Contract, image: Path | None, guard: int) -> tuple[str, dict[str, Any]]:
    kicker, heading, body = spec
    width = W - SAFE_L - SAFE_R - 24 - guard
    if index == 1:
        title_base, body_base, title_lines, body_lines = 78, 44, 6, 8
    elif 2 <= index <= 6:
        title_base, body_base, title_lines, body_lines = 70, 42, 6, 11
    elif index == 7:
        title_base, body_base, title_lines, body_lines = 88, 46, 3, 6
    else:
        raise ValueError(f"Escena inesperada: {index}")

    title = fit(heading, title_base, 44, width, title_lines, f"Escena {index} título", "700", 1.10)
    title_y = CONTENT_TOP
    body_y = int(title_y + title.height + 74)
    body_layout = fit(body, body_base, 30, width, body_lines, f"Escena {index} cuerpo", "400", 1.18)
    if body_y + body_layout.height > CONTENT_BOTTOM:
        replacement: Layout | None = None
        for size in range(body_layout.size - 2, 28, -2):
            try:
                candidate = Layout(size, wrap(body, size, width, body_lines, f"Escena {index} cuerpo", "400"), 1.18)
            except ValueError:
                continue
            if body_y + candidate.height <= CONTENT_BOTTOM:
                replacement = candidate
                break
        if replacement is None:
            raise ValueError(f"Escena {index} cuerpo no cabe verticalmente sin cortar texto")
        body_layout = replacement

    svg = f"<svg xmlns='http://www.w3.org/2000/svg' width='{W}' height='{H}' viewBox='0 0 {W} {H}'>"
    svg += f"<rect width='{W}' height='{H}' fill='{CREAM}'/>{image_svg(image)}"
    svg += (
        f"<text x='{SAFE_L}' y='{SAFE_TOP + 160}' fill='{RED}' font-family='Arial, sans-serif' "
        f"font-size='26' font-weight='700' letter-spacing='4'>{esc(kicker.upper())}</text>"
    )
    svg += text_svg(title, SAFE_L, title_y, "700")
    svg += text_svg(body_layout, SAFE_L, body_y, "400")
    svg += frame(index, contract)
    svg += "</svg>"
    meta = {
        "scene": index,
        "title": {"top": title_y - title.size, "bottom": title_y + title.height, "size": title.size, "lines": title.lines},
        "body": {"top": body_y - body_layout.size, "bottom": body_y + body_layout.height, "size": body_layout.size, "lines": body_layout.lines},
    }
    return svg, meta
