"""Offline published-media preflight. Technical acceptance is never content approval.
Inventory must be produced by probe() from trusted local files, not uploaded claims.
No network, database, provider, credentials or publishing capability.
"""

import argparse
import hashlib
import json
from pathlib import Path
from collections import Counter


def probe(asset, root):
    """Resolve source paths within a caller-approved root; inspect actual bytes."""
    from PIL import Image

    rows = []
    root = Path(root).resolve()
    for d in asset.get("derivatives", []):
        p = (root / d["src"].lstrip("/")).resolve()
        if not p.is_relative_to(root):
            raise ValueError("Asset outside approved root")
        row = dict(d, exists=p.is_file(), decodable=False)
        if row["exists"]:
            try:
                with Image.open(p) as im:
                    im.load()
                    row.update(
                        actualWidth=im.width,
                        actualHeight=im.height,
                        actualFormat=im.format.lower(),
                        decodable=True,
                    )
                row["sha256"] = hashlib.sha256(p.read_bytes()).hexdigest()
            except (OSError, ValueError):
                row["error"] = "Image decode failed"
        rows.append(row)
    return dict(asset, derivatives=rows)


def validate(catalog, inventory):
    issues, queue = [], []

    def issue(code, severity, owner, detail):
        issues.append(dict(code=code, severity=severity, owner=owner, detail=detail))

    assets = {a["id"]: a for a in catalog["assets"]}
    observed = {a["id"]: a for a in inventory}
    for aid, n in Counter(a["id"] for a in catalog["assets"]).items():
        if n > 1:
            issue("DUPLICATE_ID", "error", aid, n)
    families = {f["id"] for f in catalog["families"]}
    categories = {c["id"] for c in catalog["categories"]}
    for aid, a in assets.items():
        inspected = {d["src"]: d for d in observed.get(aid, {}).get("derivatives", [])}
        if not a.get("derivatives"):
            issue("EMPTY_ASSET", "error", aid, "No derivative")
        best = 0
        for d in a.get("derivatives", []):
            src = d["src"]
            v = inspected.get(src, {})
            if not v.get("exists") or not v.get("decodable"):
                issue("UNREADABLE", "error", aid, src)
                continue
            w, h = v["actualWidth"], v["actualHeight"]
            best = max(best, min(w, h))
            if w <= 0 or h <= 0:
                issue("INVALID_DIMENSIONS", "error", aid, src)
                continue
            if not d.get("width") or not d.get("height"):
                issue("MISSING_DIMENSIONS", "warning", aid, src)
            elif (w, h) != (d["width"], d["height"]):
                issue("DIMENSION_MISMATCH", "error", aid, src)
            declared_format = d.get("format")
            if not declared_format or declared_format == "legacy":
                declared_format = Path(src).suffix.lstrip(".").lower()
            if declared_format not in {"jpg", "jpeg", "png", "webp", "avif"}:
                issue("UNSUPPORTED_FORMAT", "error", aid, src)
            actual = v.get("actualFormat")
            if actual and actual.replace("jpg", "jpeg") != declared_format.replace(
                "jpg", "jpeg"
            ):
                issue("FORMAT_MISMATCH", "error", aid, src)
        if best and best < 320:
            issue("LOW_RESOLUTION", "warning", aid, best)
    hash_owners = {}
    for aid, a in observed.items():
        usable = [
            d
            for d in a.get("derivatives", [])
            if d.get("decodable")
            and d.get("sha256")
            and d.get("actualWidth", 0) > 0
            and d.get("actualHeight", 0) > 0
        ]
        if usable:
            main = max(usable, key=lambda d: d["actualWidth"] * d["actualHeight"])
            hash_owners.setdefault(main["sha256"], []).append(aid)
    for digest, owners in hash_owners.items():
        if len(owners) > 1:
            issue("DUPLICATE_ASSET_HASH", "warning", digest, owners)
    sku_ids = []
    for p in catalog["products"]:
        pid = p["id"]
        if p["familyId"] not in families or p["categoryId"] not in categories:
            issue("INVALID_CATEGORY_FAMILY", "error", pid, "Unknown taxonomy")
        if not p.get("media"):
            issue(
                "MISSING_PHOTO",
                "warning",
                pid,
                "Explicit branded placeholder, no fallback",
            )
        if p.get("media") and sum(m["role"] == "primary" for m in p["media"]) != 1:
            issue("PRIMARY_COUNT", "error", pid, "Exactly one primary required")
        scopes = [(pid, p.get("media", []))] + [
            (o["id"], o.get("media", [])) for o in p["options"]
        ]
        for owner, links in scopes:
            hashes = set()
            for m in links:
                aid = m["assetId"]
                if aid not in assets:
                    issue("INVALID_REFERENCE", "error", owner, aid)
                    continue
                ds = observed.get(aid, {}).get("derivatives", [])
                usable = [
                    d
                    for d in ds
                    if d.get("decodable")
                    and d.get("actualWidth", 0) > 0
                    and d.get("actualHeight", 0) > 0
                ]
                if usable:
                    main = max(
                        usable, key=lambda d: d["actualWidth"] * d["actualHeight"]
                    )
                    digest = main.get("sha256")
                    if digest and digest in hashes:
                        issue("DUPLICATE_SLIDE", "warning", owner, aid)
                    if digest:
                        hashes.add(digest)
                    ratio = main["actualWidth"] / main["actualHeight"]
                    if ratio < 0.65 or ratio > 1.8:
                        issue(
                            "CROP_REVIEW",
                            "warning",
                            owner,
                            {"assetId": aid, "ratio": ratio},
                        )
        # No gallery is legitimate for one photo. Flag review rather than block.
        if not any(m["role"] == "gallery" for m in p.get("media", [])):
            issue("NO_ADDITIONAL_GALLERY", "info", pid, "Single-photo products allowed")
        for o in p["options"]:
            sku_ids.append(o["id"])
        name = p.get("content", {}).get("en", {}).get("name", "").lower()
        linked_alt = " ".join(
            assets.get(m["assetId"], {}).get("alt", {}).get("en", {}).get("name") or ""
            for m in p.get("media", [])
        ).lower()
        if "jar" in name and linked_alt and "jar" not in linked_alt:
            issue(
                "CATEGORY_CONTENT_REVIEW",
                "warning",
                pid,
                "Jar product asset label lacks jar; human inspection required",
            )
        queue.append(
            dict(
                productId=pid,
                assetIds=[m["assetId"] for m in p.get("media", [])],
                revision=catalog.get("revision"),
                status="HUMAN_REVIEW_REQUIRED",
                checks=[
                    "quantity/color/flavor promise",
                    "authenticity",
                    "square crop",
                    "card/detail/cart/checkout identity",
                    "photo versus illustration",
                ],
                policy="Background products allowed; judge commercial promise. Hidden ingredients cannot be inferred.",
            )
        )
    for sid, n in Counter(sku_ids).items():
        if n > 1:
            issue("DUPLICATE_SKU", "error", sid, n)
    return dict(
        revision=catalog.get("revision"),
        products=len(catalog["products"]),
        assets=len(assets),
        technicalStatus=(
            "BLOCKED"
            if any(i["severity"] == "error" for i in issues)
            else "PASS_WITH_WARNINGS" if issues else "PASS"
        ),
        contentStatus="HUMAN_REVIEW_REQUIRED",
        issues=issues,
        humanReviewQueue=queue,
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("catalog")
    ap.add_argument("inventory")
    ap.add_argument("output")
    a = ap.parse_args()
    result = validate(
        json.loads(Path(a.catalog).read_text()),
        json.loads(Path(a.inventory).read_text()),
    )
    Path(a.output).write_text(json.dumps(result, indent=2))
    print(
        json.dumps(
            {k: v for k, v in result.items() if k not in ("issues", "humanReviewQueue")}
        )
    )
    raise SystemExit(1 if result["technicalStatus"] == "BLOCKED" else 0)
