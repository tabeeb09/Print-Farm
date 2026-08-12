from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from copy import deepcopy
from pathlib import Path
from xml.etree import ElementTree as ET


SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape"
SODIPODI_NS = "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
XML_NS = "http://www.w3.org/XML/1998/namespace"

ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)

REPO_ROOT = Path(__file__).resolve().parents[1]
MOBILE_SOURCE = Path(os.environ.get("MAKERSPACE_MOBILE_SVG", r"C:\website\mobile site.svg"))
PUBLIC_ROOT = REPO_ROOT / "public" / "makerspace-design"
MOBILE_BACKGROUND_DIR = PUBLIC_ROOT / "backgrounds" / "mobile"
MOBILE_OVERLAY_DIR = PUBLIC_ROOT / "generated" / "mobile-overlays"
WORK_DIR = REPO_ROOT / ".local-dev" / "makerspace-mobile-generator"
COMPONENT_DIR = REPO_ROOT / "components" / "makerspace"
DATA_FILE = COMPONENT_DIR / "makerspaceMobileDesign.generated.js"
REPORT_FILE = PUBLIC_ROOT / "generated" / "mobile-extraction-report.json"
MOBILE_WELCOME_TEXT_BOX_FILE = PUBLIC_ROOT / "generated" / "mobile-welcome-text-box.svg"

INKSCAPE = Path(os.environ.get("INKSCAPE_EXE", r"C:\Program Files\Inkscape\bin\inkscape.exe"))
EXPORT_WIDTH = int(os.environ.get("MAKERSPACE_MOBILE_EXPORT_WIDTH", "720"))

# The source canvas still has blank space after the footer. Crop to the
# bottom-card/copyright extent plus a small safety margin so the mobile page
# ends where the visible design ends.
FULL_MOBILE_CROP = (0.0, 0.0, 95.300006, 1012.0)
MOBILE_WELCOME_TEXT_BOX_CROP = (6.29343, 22.5872, 83.0286, 61.2198)
MOBILE_WELCOME_TEXT_BOX_LABEL = "Welcome Text Box"
MOBILE_PRINT_SUBMENU_IDS = [
    "g26965-4",
    "path26998-3",
    "text26953-8",
    "g26971-7",
    "path27000-6",
    "text26975-4",
    "path11107-0",
    "g8397-8",
    "text8401-8",
]

PAGE_SPECS = [
    ("mobileFullExpanded", "mobile-full-background.png", "mobile-full-expanded-foreground.svg", [], FULL_MOBILE_CROP),
    (
        "mobileFullCollapsed",
        "mobile-full-background.png",
        "mobile-full-collapsed-foreground.svg",
        MOBILE_PRINT_SUBMENU_IDS,
        FULL_MOBILE_CROP,
    ),
]

MOBILE_GLOBAL_REMOVE_IDS = [
    "g26965-4",
    "g26971-7",
    "g8397-8",
    "text33293",
    "text33293-1",
    "path33160",
    "path33162",
    "path33166",
    "path33168",
    "path33160-8",
    "path33162-6",
    "path33166-4",
    "path33168-1",
    "path33235",
    "path33295",
    "path33297",
    "path33299",
    "path33235-5",
    "path33295-0",
    "path33297-8",
    "path33299-8",
]

MOBILE_LIVE_VECTOR_IDS = {
    "mobileFullExpanded": [
        "rect69142-6",
        "rect22483-3",
        "path23972-0",
        "path26996-6",
        "path26990-1",
        "path26992-1",
        "path26994-1",
        "path26998-3",
        "path27000-6",
        "path11107-0",
        "g8246",
    ],
    "mobileFullCollapsed": [
        "rect69142-6",
        "rect22483-3",
        "path23972-0",
        "path26996-6",
        "path26990-1",
        "path26992-1",
        "path26994-1",
        "g8246",
    ],
}

MOBILE_DYNAMIC_GALLERY_IDS = [
    "image40215",
    "image93619",
    "image94949",
    "image95691",
    "g7194",
    "g12276",
    "g33164-8",
    "g33170-3",
    "path33235-5",
    "text33293-1",
    "path33295-0",
    "path33297-8",
    "path33299-8",
    "path40516",
]

MOBILE_BACKGROUND_ONLY_REMOVE_IDS = {
    "mobileFullExpanded": MOBILE_DYNAMIC_GALLERY_IDS,
    "mobileFullCollapsed": MOBILE_DYNAMIC_GALLERY_IDS,
}


def tag_name(node: ET.Element) -> str:
    return node.tag.rsplit("}", 1)[-1] if "}" in node.tag else node.tag


def layer_label(node: ET.Element) -> str:
    return node.attrib.get(f"{{{INKSCAPE_NS}}}label", "")


def find_by_id(root: ET.Element, element_id: str) -> ET.Element | None:
    for node in root.iter():
        if node.attrib.get("id") == element_id:
            return node
    return None


def find_by_inkscape_label(root: ET.Element, label: str) -> ET.Element | None:
    for node in root.iter():
        if node.attrib.get(f"{{{INKSCAPE_NS}}}label") == label:
            return node
    return None


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
    clean.text = node.text
    clean.tail = node.tail
    return clean


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


def apply_crop(root: ET.Element, crop: tuple[float, float, float, float]) -> None:
    x, y, width, height = crop
    root.set("viewBox", f"{x:g} {y:g} {width:g} {height:g}")
    root.set("width", f"{width:g}")
    root.set("height", f"{height:g}")


def remove_elements_by_id(root: ET.Element, ids: list[str]) -> None:
    ids_set = set(ids)
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    for node in list(root.iter()):
        if node.attrib.get("id") in ids_set:
            parent = parent_map.get(node)
            if parent is not None:
                parent.remove(node)


def remove_all_text(root: ET.Element) -> None:
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    for node in list(root.iter()):
        if tag_name(node) == "text":
            parent = parent_map.get(node)
            if parent is not None:
                parent.remove(node)


def contains_overlay_content(node: ET.Element, preserve_ids: set[str]) -> bool:
    return (
        tag_name(node) == "text"
        or node.attrib.get("id") in preserve_ids
        or any(contains_overlay_content(child, preserve_ids) for child in list(node))
    )


def copy_selected_subtree(node: ET.Element, preserve_ids: set[str]) -> ET.Element:
    if node.attrib.get("id") in preserve_ids:
        return copy_entire_subtree(node)
    clean = sanitize_element(node)
    for child in list(node):
        if contains_overlay_content(child, preserve_ids):
            clean.append(copy_selected_subtree(child, preserve_ids))
    return clean


def sanitize_text_subtree(node: ET.Element) -> ET.Element:
    clean = sanitize_element(node)
    for child in list(node):
        if tag_name(child) in {"tspan", "textPath", "tref"}:
            clean.append(sanitize_text_subtree(child))
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


def keep_layers(root: ET.Element, labels: set[str]) -> None:
    for child in list(root):
        if tag_name(child) == "g" and layer_label(child) not in labels:
            root.remove(child)
        elif tag_name(child) == "g":
            update_style(child, {"display": "inline"})
            child.attrib.pop("display", None)


def remove_unwanted_document_nodes(root: ET.Element) -> None:
    for child in list(root):
        if tag_name(child) in {"metadata", "namedview"}:
            root.remove(child)


def serialize_children(root: ET.Element) -> str:
    return "".join(ET.tostring(child, encoding="unicode") for child in list(root))


def viewbox_metrics(root: ET.Element) -> tuple[str, float, float]:
    view_box = root.attrib.get("viewBox", "0 0 100 100")
    parts = [float(part) for part in re.split(r"[,\s]+", view_box.strip()) if part]
    if len(parts) != 4:
        raise ValueError(f"Unsupported viewBox: {view_box}")
    return view_box, parts[2], parts[3]


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


def write_mobile_welcome_text_box(source_root: ET.Element) -> None:
    source = find_by_inkscape_label(source_root, MOBILE_WELCOME_TEXT_BOX_LABEL)
    if source is None:
        raise ValueError(f"Mobile SVG group not found: {MOBILE_WELCOME_TEXT_BOX_LABEL}")

    x, y, width, height = MOBILE_WELCOME_TEXT_BOX_CROP
    root = ET.Element(
        f"{{{SVG_NS}}}svg",
        {
            "viewBox": f"{x:g} {y:g} {width:g} {height:g}",
            "width": f"{width:g}",
            "height": f"{height:g}",
            "preserveAspectRatio": "xMidYMid meet",
        },
    )
    append_referenced_defs(root, source_root, referenced_url_ids(source))
    root.append(copy_entire_subtree(source))
    MOBILE_WELCOME_TEXT_BOX_FILE.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(root).write(MOBILE_WELCOME_TEXT_BOX_FILE, encoding="utf-8", xml_declaration=True)


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


def inspect_text_nodes(root: ET.Element, page_key: str) -> list[dict[str, str]]:
    nodes: list[dict[str, str]] = []
    for text in root.iter():
        if tag_name(text) != "text":
            continue
        content = re.sub(r"\s+", " ", "".join(text.itertext()).strip())
        style = parse_style(text.attrib.get("style", ""))
        nodes.append(
            {
                "page": page_key,
                "id": text.attrib.get("id", ""),
                "text": content,
                "fontFamily": style.get("font-family", text.attrib.get("font-family", "")),
                "fontSize": style.get("font-size", text.attrib.get("font-size", "")),
                "stroke": style.get("stroke", text.attrib.get("stroke", "")),
                "strokeWidth": style.get("stroke-width", text.attrib.get("stroke-width", "")),
                "transform": text.attrib.get("transform", ""),
            }
        )
    return nodes


def write_module(page_data: dict[str, dict[str, str]]) -> None:
    COMPONENT_DIR.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        "/* This file is generated by scripts/generate-makerspace-mobile-design.py. */\n"
        f"export const makerspaceMobileDesignData = {json.dumps({'pages': page_data}, ensure_ascii=True, indent=2)};\n",
        encoding="utf-8",
    )


def main() -> None:
    if not MOBILE_SOURCE.exists():
        raise FileNotFoundError(f"Mobile source SVG not found: {MOBILE_SOURCE}")

    MOBILE_BACKGROUND_DIR.mkdir(parents=True, exist_ok=True)
    MOBILE_OVERLAY_DIR.mkdir(parents=True, exist_ok=True)
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    source_root = ET.parse(MOBILE_SOURCE).getroot()
    write_mobile_welcome_text_box(source_root)
    page_data: dict[str, dict[str, str]] = {}
    all_text_nodes: list[dict[str, str]] = []

    exported_backgrounds: set[str] = set()

    for page_key, background_name, overlay_name, remove_ids, crop in PAGE_SPECS:
        root = deepcopy(source_root)
        apply_crop(root, crop)
        remove_unwanted_document_nodes(root)
        keep_layers(root, {"Background", "Foreground"})
        remove_elements_by_id(root, [*MOBILE_GLOBAL_REMOVE_IDS, *remove_ids])

        live_vector_ids = MOBILE_LIVE_VECTOR_IDS.get(page_key, [])
        clean_overlay_root = build_text_overlay(root, live_vector_ids)
        overlay_path = MOBILE_OVERLAY_DIR / overlay_name
        ET.ElementTree(clean_overlay_root).write(overlay_path, encoding="utf-8", xml_declaration=True)
        all_text_nodes.extend(inspect_text_nodes(clean_overlay_root, page_key))

        if background_name not in exported_backgrounds:
            background_root = deepcopy(root)
            remove_all_text(background_root)
            remove_elements_by_id(background_root, live_vector_ids)
            remove_elements_by_id(background_root, MOBILE_BACKGROUND_ONLY_REMOVE_IDS.get(page_key, []))
            background_source = WORK_DIR / f"{page_key}-background-source.svg"
            ET.ElementTree(background_root).write(background_source, encoding="utf-8", xml_declaration=True)
            export_background(background_source, MOBILE_BACKGROUND_DIR / background_name)
            exported_backgrounds.add(background_name)

        view_box, width, height = viewbox_metrics(root)
        page_data[page_key] = {
            "viewBox": view_box,
            "width": width,
            "height": height,
            "background": f"/makerspace-design/backgrounds/mobile/{background_name}",
            "textOverlay": f"/makerspace-design/generated/mobile-overlays/{overlay_name}",
            "markup": serialize_children(clean_overlay_root),
        }

    REPORT_FILE.write_text(
        json.dumps(
            {
                "source": str(MOBILE_SOURCE),
                "exportWidth": EXPORT_WIDTH,
                "pages": PAGE_SPECS,
                "removedGlobalIds": MOBILE_GLOBAL_REMOVE_IDS,
                "liveVectorIds": MOBILE_LIVE_VECTOR_IDS,
                "removedBackgroundOnlyIds": MOBILE_BACKGROUND_ONLY_REMOVE_IDS,
                "textNodes": all_text_nodes,
            },
            ensure_ascii=True,
            indent=2,
        ),
        encoding="utf-8",
    )
    write_module(page_data)


if __name__ == "__main__":
    main()
