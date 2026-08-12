from __future__ import annotations

import json
import base64
import os
import re
import shutil
import subprocess
from copy import deepcopy
from pathlib import Path
from xml.etree import ElementTree as ET

try:
    from fontTools.ttLib import TTFont
except Exception:  # pragma: no cover - generator fallback path
    TTFont = None


SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape"
SODIPODI_NS = "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
XML_NS = "http://www.w3.org/XML/1998/namespace"

ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = Path(r"C:\website\website frontend\By Page")
SOURCE_DIR = Path(os.environ.get("MAKERSPACE_FRONTEND_DIR", DEFAULT_SOURCE_DIR))
MASTER_SOURCE = Path(os.environ.get("MAKERSPACE_MASTER_SVG", r"C:\website\WEBSITE FRONTEND.svg"))
MOBILE_SOURCE = Path(os.environ.get("MAKERSPACE_MOBILE_SVG", r"C:\website\mobile site.svg"))
FRONTEND_ROOT = SOURCE_DIR.parent
FRONT_HERO_SOURCE = Path(os.environ.get("MAKERSPACE_FRONT_HERO_IMAGE", FRONTEND_ROOT / "Front Hero.png"))
PUBLIC_ROOT = REPO_ROOT / "public" / "makerspace-design"
BACKGROUND_DIR = PUBLIC_ROOT / "backgrounds"
FONT_DIR = PUBLIC_ROOT / "fonts"
NAV_DIR = PUBLIC_ROOT / "nav"
GENERATED_DIR = PUBLIC_ROOT / "generated"
TEXT_OVERLAY_DIR = GENERATED_DIR / "text-overlays"
WORK_DIR = REPO_ROOT / ".local-dev" / "makerspace-generator"
COMPONENT_DIR = REPO_ROOT / "components" / "makerspace"
DATA_FILE = COMPONENT_DIR / "makerspaceTextOverlays.generated.js"
REPORT_FILE = GENERATED_DIR / "extraction-report.json"

INKSCAPE = Path(os.environ.get("INKSCAPE_EXE", r"C:\Program Files\Inkscape\bin\inkscape.exe"))
EXPORT_WIDTH = int(os.environ.get("MAKERSPACE_EXPORT_WIDTH", "1920"))

PAGE_SPECS = [
    ("home", "WEBSITE FRONTEND_Page 1.svg", "page-1-background.png", "page-1-text.svg", [], None),
    ("volunteer", "WEBSITE FRONTEND_Page 2.svg", "page-2-background.png", "page-2-text.svg", [], None),
    ("printExpanded", "WEBSITE FRONTEND_Page 3.svg", "page-3-expanded-background.png", "page-3-expanded-text.svg", [], None),
    (
        "printCollapsed",
        "WEBSITE FRONTEND_Page 3.svg",
        "page-3-collapsed-background.png",
        "page-3-collapsed-text.svg",
        [
            "g26965",
            "path26998",
            "text26953",
            "g26971",
            "path27000",
            "text26975",
            "path11107",
            "g8397",
            "text8401",
        ],
        None,
    ),
    ("equipment", "WEBSITE FRONTEND_Page 4.svg", "page-4-background.png", "page-4-text.svg", ["g2279"], None),
    ("events", "WEBSITE FRONTEND_Page 5.svg", "page-5-background.png", "page-5-text.svg", ["g8728"], None),
    ("footer", "WEBSITE FRONTEND_Page 6.svg", "page-6-background.png", "page-6-text.svg", [], None),
]

MASTER_PAGE_SPECS = [
    ("home", "page-1-background.png", "page-1-text.svg", [], (0.0, 0.0, 507.99999, 264.58337)),
    ("volunteer", "page-2-background.png", "page-2-text.svg", [], (0.0, 264.58337, 507.99999, 264.58337)),
    ("printExpanded", "page-3-expanded-background.png", "page-3-expanded-text.svg", [], (0.0, 529.16671, 507.99788, 289.0954)),
    (
        "printCollapsed",
        "page-3-collapsed-background.png",
        "page-3-collapsed-text.svg",
        [
            "g26965",
            "g6750",
            "path26998",
            "text26953",
            "g26971",
            "g6755",
            "path27000",
            "text26975",
            "path11107",
            "g8397",
            "g6760",
            "text8401",
        ],
        (0.0, 529.16671, 507.99788, 289.0954),
    ),
    ("equipment", "page-4-background.png", "page-4-text.svg", ["g2279"], (-3.5718749, 828.01355, 511.56981, 475.49446)),
    ("events", "page-5-background.png", "page-5-text.svg", ["g8728"], (1.7787639, 1313.1112, 508.00002, 356.78858)),
    (
        "footer",
        "page-6-background.png",
        "page-6-text.svg",
        [
            "path30129-7-2",
            "path30194",
            "ellipse30099",
            "rect28613",
            "path28615",
            "path28617",
            "path28619",
        ],
        (5.0233265, 1670.8453, 506.6801, 165.06506),
    ),
]

LIVE_VECTOR_IDS = {
    "printExpanded": [
        "g5747",
        "g5753",
        "g26965",
        "g6750",
        "g26971",
        "g6755",
        "g8397",
        "g6760",
    ],
    "printCollapsed": [
        "g5747",
        "g5753",
    ],
    "equipment": [
        "g2243",
        "g2253",
        "g2221",
        "g2265",
        "g2258",
    ],
}

HOME_WELCOME_CARD_BACKGROUND_REMOVE_IDS = [
    "g7919",
    "rect19703",
    "rect19693",
    "rect19681",
    "rect13584-7",
    "rect18620",
    "rect18616",
    "rect18618",
    "rect18622",
    "rect19705",
    "rect18893",
    "rect13582-0",
    "rect13586-1",
    "rect14020-8",
    "rect19703-1",
    "rect19693-4",
    "rect19681-0",
    "rect13584-7-0",
    "rect18616-2",
    "rect18618-2",
    "rect18622-2",
    "rect19705-4",
    "rect18893-4",
    "rect13582-0-1",
    "rect13586-1-1",
    "rect14020-8-1",
    "path5916",
    "path5918",
    "path5920",
    "rect5459",
    "rect2450-8",
    "rect2440-0",
    "rect2446-8",
    "rect2448-4",
    "g6010",
    "rect2446-8-0",
    "rect6040",
    "path2512",
    "path30129",
    "path30129-6",
    "path2615",
    "rect6006",
    "g6049",
    "g10406",
]

BACKGROUND_ONLY_REMOVE_IDS = {
    "home": HOME_WELCOME_CARD_BACKGROUND_REMOVE_IDS,
    "equipment": [
        "image40215",
        "image93619",
        "image94949",
        "image95691",
    ],
    "events": [
        "image38001",
        "image37259",
    ],
}

FONT_SOURCES = [
    {
        "family": "GENISO",
        "weight": "400",
        "style": "normal",
        "source": Path(r"C:\Windows\Fonts\GENISO.ttf"),
        "target": "GENISO.woff2",
        "fallback": "GENISO.ttf",
    },
    {
        "family": "Artifakt Element",
        "weight": "100",
        "style": "normal",
        "source": Path(r"C:\Windows\Fonts\Artifakt Element Thin.ttf"),
        "target": "ArtifaktElementThin.woff2",
        "fallback": "ArtifaktElementThin.ttf",
    },
    {
        "family": "Artifakt Element",
        "weight": "500",
        "style": "normal",
        "source": Path(r"C:\Windows\Fonts\Artifakt Element Medium.ttf"),
        "target": "ArtifaktElementMedium.woff2",
        "fallback": "ArtifaktElementMedium.ttf",
    },
    {
        "family": "Artifakt Element",
        "weight": "700",
        "style": "normal",
        "source": Path(r"C:\Windows\Fonts\Artifakt Element Bold.ttf"),
        "target": "ArtifaktElementBold.woff2",
        "fallback": "ArtifaktElementBold.ttf",
    },
]

NAV_ICON_SOURCES = [
    ("arrow-next.svg", Path(r"C:\website\website frontend\slideshow nav elements_#g33164.svg")),
    ("arrow-prev.svg", Path(r"C:\website\website frontend\slideshow nav elements_#g33170.svg")),
    ("dial.svg", Path(r"C:\website\website frontend\slideshow nav elements_#path33299.svg")),
    ("active-x.svg", Path(r"C:\website\website frontend\slideshow nav elements_#text33293.svg")),
    ("navbar-toggle-arrow.svg", Path(r"C:\website\website frontend\path23570.svg")),
]

GLOBAL_REMOVE_IDS = [
    "g19591",
    "g19586",
    "g19580",
    "g19575",
    "g2279",
    "g8728",
    "g8740",
    "g8752",
    "text2896",
    "text3106",
    "text3110",
    "text6431",
    "text6435",
    "text2896-1",
    "text3106-8",
    "text3110-5",
    "text6435-5",
    "text2896-6",
    "path23570",
    "path23570-6",
    "rect33375",
    "rect33375-8",
    "path30129",
    "path30129-7",
]

SECTION_TITLE_IDS = [
    "text8660-5-2",  # Print
    "text99774",  # Equipment
    "text8660-5-1",  # Events
]

SECTION_TITLE_FONT_SIZE = "35.2778px"  # Inkscape 100 pt at 96 dpi.
SECTION_TITLE_X = 28.232069
VOLUNTEER_TITLE_ID = "text8654-6-4"
VOLUNTEER_BOX_LABEL = "Volunteer Box"
VOLUNTEER_DESKTOP_REMOVE_IDS = [
    "text8654-6-4",
    "text79630",
    "text85135",
    "text86031",
]
VOLUNTEER_MOBILE_TO_DESKTOP_TRANSFORM = "matrix(2.21060029 0 0 2.21059989 290.12765021 -48.13336378)"
EVENT_COPY_ID = "text13191"
EVENT_COPY_Y_OFFSET = -12.0

EQUIPMENT_TITLE_IDS = [
    "text88522",  # 3D Printers
    "text88547",  # Laser Cutter
    "text88405",  # Other Equipment
]

EQUIPMENT_TITLE_FONT_SIZE = "22.9306px"  # Inkscape 65 pt at 96 dpi.
EQUIPMENT_TEXT_LINE_SPACING = 13.2291

EQUIPMENT_BOXES = {
    "text88522": {"box_x": 17.96829},
    "text88547": {"box_x": 18.718132},
    "text88405": {"box_x": 196.91373, "dy": 2.9},
}

EQUIPMENT_TITLE_LEFT_PAD = 21.876265 - 17.96829

EQUIPMENT_PLUS_SEQUENCES = [
    (["text99949", "text99953", "text99957", "text99961", "text99965"], 1145.8647),
    (
        [
            "text30634",
            "text30638",
            "text30642",
            "text30646",
            "text30650",
            "text30654",
            "text30658",
            "text30662",
            "text30666",
        ],
        1179.7205,
    ),
    (
        [
            "text30674",
            "text30678",
            "text30682",
            "text30686",
            "text30690",
            "text30694",
            "text30698",
            "text30702",
        ],
        1180.1322,
    ),
]

IMAGE_REPLACEMENTS = [
    ("image30381", FRONT_HERO_SOURCE),
]


def tag_name(node: ET.Element) -> str:
    return node.tag.rsplit("}", 1)[-1] if "}" in node.tag else node.tag


def parse_style(style: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for chunk in style.split(";"):
        if ":" not in chunk:
            continue
        key, value = chunk.split(":", 1)
        result[key.strip()] = value.strip()
    return result


def serialize_style(style: dict[str, str]) -> str:
    return ";".join(f"{key}:{value}" for key, value in style.items())


def update_style(node: ET.Element, updates: dict[str, str]) -> None:
    style = parse_style(node.attrib.get("style", ""))
    style.update(updates)
    node.set("style", serialize_style(style))


def find_by_id(root: ET.Element, element_id: str) -> ET.Element | None:
    for node in root.iter():
        if node.attrib.get("id") == element_id:
            return node
    return None


def find_by_inkscape_label(root: ET.Element, label: str) -> ET.Element | None:
    label_attr = f"{{{INKSCAPE_NS}}}label"
    for node in root.iter():
        if node.attrib.get(label_attr) == label or node.attrib.get("inkscape:label") == label:
            return node
    return None


def set_text_x(node: ET.Element, x: float) -> None:
    value = f"{x:g}"
    if "x" in node.attrib:
        node.set("x", value)
    for child in node.iter():
        if child is not node and tag_name(child) in {"tspan", "textPath"} and "x" in child.attrib:
            child.set("x", value)


def offset_text_y(node: ET.Element, dy: float) -> None:
    for child in node.iter():
        if "y" not in child.attrib:
            continue
        try:
            child.set("y", f"{float(child.attrib['y']) + dy:g}")
        except ValueError:
            continue


def set_text_y(node: ET.Element, y: float) -> None:
    value = f"{y:g}"
    if "y" in node.attrib:
        node.set("y", value)
    for child in node.iter():
        if child is not node and tag_name(child) in {"tspan", "textPath"} and "y" in child.attrib:
            child.set("y", value)


def set_font_size(node: ET.Element, font_size: str) -> None:
    update_style(node, {"font-size": font_size})
    for child in node.iter():
        if child is node or tag_name(child) not in {"tspan", "textPath"}:
            continue
        if "font-size" in parse_style(child.attrib.get("style", "")):
            update_style(child, {"font-size": font_size})


def normalize_tspan_line_spacing(node: ET.Element, spacing: float) -> None:
    tspans = [child for child in list(node) if tag_name(child) == "tspan" and "y" in child.attrib]
    if len(tspans) < 2:
        return
    try:
        first_y = float(tspans[0].attrib["y"])
    except ValueError:
        return
    for index, tspan in enumerate(tspans):
        tspan.set("y", f"{first_y + spacing * index:g}")


def replace_text_fragments(node: ET.Element, replacements: dict[str, str]) -> None:
    for child in node.iter():
        if child.text:
            for source, target in replacements.items():
                child.text = child.text.replace(source, target)


def normalize_design_text(root: ET.Element) -> None:
    for element_id in SECTION_TITLE_IDS:
        node = find_by_id(root, element_id)
        if node is None:
            continue
        set_font_size(node, SECTION_TITLE_FONT_SIZE)
        set_text_x(node, SECTION_TITLE_X)

    volunteer_title = find_by_id(root, VOLUNTEER_TITLE_ID)
    if volunteer_title is not None:
        set_font_size(volunteer_title, SECTION_TITLE_FONT_SIZE)

    for element_id in EQUIPMENT_TITLE_IDS:
        node = find_by_id(root, element_id)
        if node is None:
            continue
        set_font_size(node, EQUIPMENT_TITLE_FONT_SIZE)
        box = EQUIPMENT_BOXES[element_id]
        set_text_x(node, box["box_x"] + EQUIPMENT_TITLE_LEFT_PAD)
        if "dy" in box:
            offset_text_y(node, box["dy"])

    printer_list = find_by_id(root, "text88535")
    if printer_list is not None:
        normalize_tspan_line_spacing(printer_list, EQUIPMENT_TEXT_LINE_SPACING)

    for plus_ids, first_y in EQUIPMENT_PLUS_SEQUENCES:
        for index, element_id in enumerate(plus_ids):
            node = find_by_id(root, element_id)
            if node is not None:
                set_text_y(node, first_y + EQUIPMENT_TEXT_LINE_SPACING * index)

    event_copy = find_by_id(root, EVENT_COPY_ID)
    if event_copy is not None:
        offset_text_y(event_copy, EVENT_COPY_Y_OFFSET)
        replace_text_fragments(
            event_copy,
            {
                "We'vebeen": "we've been",
                "upcomming": "upcoming",
            },
        )


def sanitize_style(style: str, tag: str) -> str:
    parsed = parse_style(style)
    cleaned = {
        key: value
        for key, value in parsed.items()
        if not key.startswith("-inkscape-") and not key.startswith("sodipodi:")
    }
    if tag in {"text", "tspan"} and "stroke-width" in cleaned:
        cleaned.setdefault("paint-order", "stroke fill")
        cleaned.setdefault("stroke-linejoin", "round")
        cleaned.setdefault("stroke-linecap", "round")
    return ";".join(f"{key}:{value}" for key, value in cleaned.items())


def clean_attr_name(name: str) -> str | None:
    if name.startswith(f"{{{INKSCAPE_NS}}}") or name.startswith(f"{{{SODIPODI_NS}}}"):
        return None
    if name.startswith("{"):
        ns, local = name[1:].split("}", 1)
        if ns == XLINK_NS:
            return f"{{{XLINK_NS}}}{local}"
        if ns == XML_NS:
            return f"{{{XML_NS}}}{local}"
        return None
    if ":" in name and not name.startswith("xml:"):
        return None
    return name


def sanitize_element(node: ET.Element) -> ET.Element:
    clean = ET.Element(node.tag)
    tag = tag_name(node)
    for key, value in node.attrib.items():
        clean_key = clean_attr_name(key)
        if clean_key:
            if clean_key == "style":
                value = sanitize_style(value, tag)
            clean.set(clean_key, value)
    clean.text = clean_text_content(node.text)
    clean.tail = clean_text_content(node.tail)
    return clean


def clean_text_content(value: str | None) -> str | None:
    if value is None:
        return None
    replacements = {
        "kind.to": "kind to",
        "kind. to": "kind to",
        "attenton": "attention",
        "attntion": "attention",
        "breifings": "briefings",
    }
    cleaned = value
    for source, target in replacements.items():
        cleaned = cleaned.replace(source, target)
    return cleaned


def remove_elements_by_id(root: ET.Element, ids: list[str]) -> None:
    if not ids:
        return
    ids_set = set(ids)
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    for node in list(root.iter()):
        if node.attrib.get("id") in ids_set:
            parent = parent_map.get(node)
            if parent is not None:
                parent.remove(node)


def image_mime_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".svg":
        return "image/svg+xml"
    return "image/png"


def replace_image_href(root: ET.Element, element_id: str, source: Path) -> None:
    node = find_by_id(root, element_id)
    if node is None:
        return
    if not source.exists():
        raise FileNotFoundError(f"Replacement image for {element_id} not found: {source}")
    encoded = base64.b64encode(source.read_bytes()).decode("ascii")
    node.set(f"{{{XLINK_NS}}}href", f"data:{image_mime_type(source)};base64,{encoded}")
    node.attrib.pop("href", None)


def apply_image_replacements(root: ET.Element) -> None:
    for element_id, source in IMAGE_REPLACEMENTS:
        replace_image_href(root, element_id, source)


def remove_all_text(root: ET.Element) -> None:
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    for node in list(root.iter()):
        if tag_name(node) == "text":
            parent = parent_map.get(node)
            if parent is not None:
                parent.remove(node)


def contains_text(node: ET.Element) -> bool:
    return tag_name(node) == "text" or any(contains_text(child) for child in list(node))


def contains_overlay_content(node: ET.Element, preserve_ids: set[str]) -> bool:
    return (
        tag_name(node) == "text"
        or node.attrib.get("id") in preserve_ids
        or any(contains_overlay_content(child, preserve_ids) for child in list(node))
    )


def copy_entire_subtree(node: ET.Element) -> ET.Element:
    clean = sanitize_element(node)
    for child in list(node):
        clean.append(copy_entire_subtree(child))
    return clean


def referenced_url_ids(node: ET.Element) -> set[str]:
    refs: set[str] = set()
    for current in node.iter():
        for value in current.attrib.values():
            refs.update(re.findall(r"url\(#([^)]+)\)", value))
            if value.startswith("#"):
                refs.add(value[1:])
    return refs


def append_referenced_defs(target_root: ET.Element, source_root: ET.Element, reference_ids: set[str]) -> None:
    if not reference_ids:
        return

    defs = ET.Element(f"{{{SVG_NS}}}defs")
    copied_ids: set[str] = set()
    pending = set(reference_ids)

    while pending:
        reference_id = pending.pop()
        if reference_id in copied_ids:
            continue
        source = find_by_id(source_root, reference_id)
        if source is None:
            continue
        copied = copy_entire_subtree(source)
        defs.append(copied)
        copied_ids.add(reference_id)
        pending.update(referenced_url_ids(copied) - copied_ids)

    if list(defs):
        target_root.insert(0, defs)


def inject_mobile_volunteer_box(overlay_root: ET.Element) -> None:
    if not MOBILE_SOURCE.exists():
        return

    mobile_root = ET.parse(MOBILE_SOURCE).getroot()
    volunteer_box = find_by_inkscape_label(mobile_root, VOLUNTEER_BOX_LABEL)
    if volunteer_box is None:
        return

    append_referenced_defs(overlay_root, mobile_root, referenced_url_ids(volunteer_box))

    copied = copy_entire_subtree(volunteer_box)
    copied.set("id", "volunteer-box-from-mobile")
    copied.set("transform", VOLUNTEER_MOBILE_TO_DESKTOP_TRANSFORM)
    overlay_root.append(copied)


def copy_selected_subtree(node: ET.Element, preserve_ids: set[str]) -> ET.Element:
    if node.attrib.get("id") in preserve_ids:
        return copy_entire_subtree(node)
    clean = sanitize_element(node)
    for child in list(node):
        if contains_overlay_content(child, preserve_ids):
            clean.append(copy_selected_subtree(child, preserve_ids))
    return clean


def copy_text_tree(node: ET.Element, preserve_ids: set[str]) -> ET.Element | None:
    name = tag_name(node)
    if node.attrib.get("id") in preserve_ids:
        return copy_selected_subtree(node, preserve_ids)
    if name == "text":
        return sanitize_text_subtree(node)
    if name != "g":
        return None
    copied_children = [
        copy_text_tree(child, preserve_ids)
        for child in list(node)
        if contains_overlay_content(child, preserve_ids)
    ]
    copied_children = [child for child in copied_children if child is not None]
    if not copied_children:
        return None
    clean = sanitize_element(node)
    for child in copied_children:
        clean.append(child)
    return clean


def sanitize_text_subtree(node: ET.Element) -> ET.Element:
    clean = sanitize_element(node)
    for child in list(node):
        if tag_name(child) in {"tspan", "textPath", "tref"}:
            clean.append(sanitize_text_subtree(child))
    return clean


def serialize_children(root: ET.Element) -> str:
    return "".join(ET.tostring(child, encoding="unicode") for child in list(root))


def viewbox_metrics(root: ET.Element) -> tuple[str, float, float]:
    view_box = root.attrib.get("viewBox", "0 0 100 100")
    parts = [float(part) for part in re.split(r"[,\s]+", view_box.strip()) if part]
    if len(parts) != 4:
        raise ValueError(f"Unsupported viewBox: {view_box}")
    return view_box, parts[2], parts[3]


def apply_crop(root: ET.Element, crop: tuple[float, float, float, float] | None) -> None:
    if crop is None:
        return
    x, y, width, height = crop
    root.set("viewBox", f"{x:g} {y:g} {width:g} {height:g}")
    root.set("width", f"{width:g}")
    root.set("height", f"{height:g}")


def build_text_overlay(root: ET.Element, preserve_ids: list[str]) -> ET.Element:
    preserve_set = set(preserve_ids)
    view_box, width, height = viewbox_metrics(root)
    overlay = ET.Element(
        f"{{{SVG_NS}}}svg",
        {
            "viewBox": view_box,
            "width": str(width),
            "height": str(height),
            "preserveAspectRatio": "xMidYMid meet",
        },
    )
    for child in list(root):
        if contains_overlay_content(child, preserve_set):
            copied = copy_text_tree(child, preserve_set)
            if copied is not None:
                overlay.append(copied)
    return overlay


def inspect_text_nodes(root: ET.Element, page_key: str) -> list[dict[str, str]]:
    nodes: list[dict[str, str]] = []
    for text in root.iter():
        if tag_name(text) != "text":
            continue
        content = "".join(text.itertext()).strip()
        style = parse_style(text.attrib.get("style", ""))
        nodes.append(
            {
                "page": page_key,
                "id": text.attrib.get("id", ""),
                "text": re.sub(r"\s+", " ", content),
                "fontFamily": style.get("font-family", text.attrib.get("font-family", "")),
                "fontWeight": style.get("font-weight", text.attrib.get("font-weight", "")),
                "fontSize": style.get("font-size", text.attrib.get("font-size", "")),
                "fill": style.get("fill", text.attrib.get("fill", "")),
                "stroke": style.get("stroke", text.attrib.get("stroke", "")),
                "strokeWidth": style.get("stroke-width", text.attrib.get("stroke-width", "")),
                "transform": text.attrib.get("transform", ""),
            }
        )
    return nodes


def convert_font(source: Path, target: Path, fallback: Path) -> str:
    fallback.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, fallback)
    if TTFont is None:
        return fallback.name
    try:
        font = TTFont(str(source))
        font.flavor = "woff2"
        target.parent.mkdir(parents=True, exist_ok=True)
        font.save(str(target))
        return target.name
    except Exception:
        return fallback.name


def export_background(source_svg: Path, target_png: Path) -> None:
    if not INKSCAPE.exists():
        raise FileNotFoundError(f"Inkscape executable not found: {INKSCAPE}")
    target_png.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            str(INKSCAPE),
            str(source_svg),
            "--export-type=png",
            f"--export-width={EXPORT_WIDTH}",
            f"--export-filename={target_png}",
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def write_module(page_data: dict[str, dict[str, str]], font_faces: list[dict[str, str]]) -> None:
    COMPONENT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "pages": page_data,
        "fontFaces": font_faces,
    }
    DATA_FILE.write_text(
        "/* This file is generated by scripts/generate-makerspace-design.py. */\n"
        f"export const makerspaceDesignData = {json.dumps(payload, ensure_ascii=True, indent=2)};\n",
        encoding="utf-8",
    )


def main() -> None:
    use_master = os.environ.get("MAKERSPACE_USE_MASTER_SVG", "").lower() in {"1", "true", "yes"}
    if use_master and not MASTER_SOURCE.exists():
        raise FileNotFoundError(f"Master design file not found: {MASTER_SOURCE}")
    if not use_master and not SOURCE_DIR.exists():
        raise FileNotFoundError(f"Source design directory not found: {SOURCE_DIR}")

    BACKGROUND_DIR.mkdir(parents=True, exist_ok=True)
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    NAV_DIR.mkdir(parents=True, exist_ok=True)
    TEXT_OVERLAY_DIR.mkdir(parents=True, exist_ok=True)
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    font_faces = []
    for spec in FONT_SOURCES:
        source = spec["source"]
        if not source.exists():
            raise FileNotFoundError(f"Required font not found: {source}")
        emitted = convert_font(source, FONT_DIR / spec["target"], FONT_DIR / spec["fallback"])
        font_faces.append({**{k: v for k, v in spec.items() if k != "source"}, "file": emitted})

    for target_name, source in NAV_ICON_SOURCES:
        if not source.exists():
            raise FileNotFoundError(f"Required navigator icon not found: {source}")
        shutil.copy2(source, NAV_DIR / target_name)

    page_data: dict[str, dict[str, str]] = {}
    all_text_nodes: list[dict[str, str]] = []

    if use_master:
        page_specs = [
            (page_key, MASTER_SOURCE, background_name, text_name, remove_ids, crop)
            for page_key, background_name, text_name, remove_ids, crop in MASTER_PAGE_SPECS
        ]
    else:
        page_specs = [
            (page_key, SOURCE_DIR / source_name, background_name, text_name, remove_ids, crop)
            for page_key, source_name, background_name, text_name, remove_ids, crop in PAGE_SPECS
        ]

    for page_key, source_svg, background_name, text_name, remove_ids, crop in page_specs:
        root = ET.parse(source_svg).getroot()
        apply_image_replacements(root)
        apply_crop(root, crop)
        remove_elements_by_id(root, [*GLOBAL_REMOVE_IDS, *remove_ids])
        normalize_design_text(root)
        all_text_nodes.extend(inspect_text_nodes(root, page_key))
        if page_key == "volunteer":
            remove_elements_by_id(root, VOLUNTEER_DESKTOP_REMOVE_IDS)

        live_vector_ids = LIVE_VECTOR_IDS.get(page_key, [])
        overlay_root = build_text_overlay(root, live_vector_ids)
        if page_key == "volunteer":
            inject_mobile_volunteer_box(overlay_root)
        overlay_path = TEXT_OVERLAY_DIR / text_name
        ET.ElementTree(overlay_root).write(overlay_path, encoding="utf-8", xml_declaration=True)
        overlay_markup = serialize_children(overlay_root)

        background_root = deepcopy(root)
        remove_all_text(background_root)
        remove_elements_by_id(background_root, live_vector_ids)
        remove_elements_by_id(background_root, BACKGROUND_ONLY_REMOVE_IDS.get(page_key, []))
        background_source = WORK_DIR / f"{page_key}-background-source.svg"
        ET.ElementTree(background_root).write(background_source, encoding="utf-8", xml_declaration=True)
        background_path = BACKGROUND_DIR / background_name
        export_background(background_source, background_path)

        view_box, width, height = viewbox_metrics(root)
        page_data[page_key] = {
            "viewBox": view_box,
            "width": width,
            "height": height,
            "background": f"/makerspace-design/backgrounds/{background_name}",
            "textOverlay": f"/makerspace-design/generated/text-overlays/{text_name}",
            "markup": overlay_markup,
        }

    font_inventory = sorted(
        {
            (
                node.get("fontFamily", ""),
                node.get("fontWeight", ""),
                node.get("fontSize", ""),
                node.get("strokeWidth", ""),
            )
            for node in all_text_nodes
            if node.get("fontFamily")
        }
    )
    REPORT_FILE.write_text(
        json.dumps(
            {
                "sourceDir": str(MASTER_SOURCE if use_master else SOURCE_DIR),
                "exportWidth": EXPORT_WIDTH,
                "sourceMode": "master" if use_master else "split-pages",
                "fonts": font_inventory,
                "textNodes": all_text_nodes,
            },
            ensure_ascii=True,
            indent=2,
        ),
        encoding="utf-8",
    )
    write_module(page_data, font_faces)


if __name__ == "__main__":
    main()
