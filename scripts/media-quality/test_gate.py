import copy
import tempfile
import unittest
from pathlib import Path
from gate import probe, validate


class GateTests(unittest.TestCase):
    def setUp(self):
        self.c = {
            "revision": "fixture",
            "assets": [
                {
                    "id": "a",
                    "derivatives": [
                        {"src": "/a.png", "format": "png", "width": 400, "height": 400}
                    ],
                }
            ],
            "families": [{"id": "f"}],
            "categories": [{"id": "c"}],
            "products": [
                {
                    "id": "p",
                    "familyId": "f",
                    "categoryId": "c",
                    "media": [{"assetId": "a", "role": "primary"}],
                    "options": [{"id": "s", "media": []}],
                }
            ],
        }
        self.i = [
            {
                "id": "a",
                "derivatives": [
                    {
                        "src": "/a.png",
                        "exists": True,
                        "decodable": True,
                        "actualWidth": 400,
                        "actualHeight": 400,
                        "actualFormat": "png",
                        "sha256": "h",
                    }
                ],
            }
        ]

    def codes(self):
        return [x["code"] for x in validate(self.c, self.i)["issues"]]

    def test_valid_requires_human(self):
        self.assertEqual(
            validate(self.c, self.i)["contentStatus"], "HUMAN_REVIEW_REQUIRED"
        )

    def test_unreadable(self):
        self.i[0]["derivatives"][0]["decodable"] = False
        self.assertIn("UNREADABLE", self.codes())

    def test_missing_dimensions(self):
        del self.c["assets"][0]["derivatives"][0]["width"]
        self.assertIn("MISSING_DIMENSIONS", self.codes())

    def test_wrong_dimensions(self):
        self.i[0]["derivatives"][0]["actualWidth"] = 401
        self.assertIn("DIMENSION_MISMATCH", self.codes())

    def test_invalid_variant_ref(self):
        self.c["products"][0]["options"][0]["media"] = [
            {"assetId": "unknown", "role": "primary"}
        ]
        self.assertIn("INVALID_REFERENCE", self.codes())

    def test_duplicate_slides(self):
        self.c["products"][0]["media"].append({"assetId": "a", "role": "gallery"})
        self.assertIn("DUPLICATE_SLIDE", self.codes())

    def test_portrait_allowed(self):
        self.i[0]["derivatives"][0]["actualHeight"] = 800
        self.c["assets"][0]["derivatives"][0]["height"] = 800
        self.assertEqual(
            validate(self.c, self.i)["technicalStatus"], "PASS_WITH_WARNINGS"
        )

    def test_single_photo_allowed(self):
        self.assertNotEqual(validate(self.c, self.i)["technicalStatus"], "BLOCKED")

    def test_missing_photo_no_wrong_fallback(self):
        self.c["products"][0]["media"] = []
        self.assertIn("MISSING_PHOTO", self.codes())

    def test_low_resolution(self):
        self.i[0]["derivatives"][0].update(actualWidth=100, actualHeight=100)
        self.assertIn("LOW_RESOLUTION", self.codes())

    def test_unknown_category(self):
        self.c["products"][0]["categoryId"] = "unknown"
        self.assertIn("INVALID_CATEGORY_FAMILY", self.codes())

    def test_duplicate_sku(self):
        self.c["products"][0]["options"] *= 2
        self.assertIn("DUPLICATE_SKU", self.codes())

    def test_multiple_primary(self):
        self.c["products"][0]["media"] *= 2
        self.assertIn("PRIMARY_COUNT", self.codes())

    def test_duplicate_id(self):
        self.c["assets"] *= 2
        self.assertIn("DUPLICATE_ID", self.codes())

    def test_format_mismatch(self):
        self.i[0]["derivatives"][0]["actualFormat"] = "webp"
        self.assertIn("FORMAT_MISMATCH", self.codes())

    def test_no_quantity_heuristic(self):
        self.c["products"][0]["name"] = "Pack 3 with background breads"
        self.assertNotEqual(validate(self.c, self.i)["technicalStatus"], "BLOCKED")

    def test_legacy_format_supported(self):
        self.c["assets"][0]["derivatives"][0]["format"] = "legacy"
        self.assertNotIn("UNSUPPORTED_FORMAT", self.codes())

    def test_category_content_queue(self):
        self.c["products"][0]["content"] = {"en": {"name": "Cake Jar"}}
        self.c["assets"][0]["alt"] = {"en": {"name": "Whole cake"}}
        self.assertIn("CATEGORY_CONTENT_REVIEW", self.codes())

    def test_duplicate_asset_hash(self):
        b = copy.deepcopy(self.c["assets"][0])
        b["id"] = "b"
        self.c["assets"].append(b)
        b = copy.deepcopy(self.i[0])
        b["id"] = "b"
        self.i.append(b)
        self.assertIn("DUPLICATE_ASSET_HASH", self.codes())

    def test_invalid_zero_height_fails_closed(self):
        self.i[0]["derivatives"][0]["actualHeight"] = 0
        result = validate(self.c, self.i)
        self.assertEqual(result["technicalStatus"], "BLOCKED")
        self.assertIn("INVALID_DIMENSIONS", [i["code"] for i in result["issues"]])

    def test_probe_and_traversal(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as tmp:
            Image.new("RGB", (40, 50)).save(Path(tmp) / "a.png")
            self.assertEqual(
                probe(self.c["assets"][0], tmp)["derivatives"][0]["actualHeight"], 50
            )
            self.c["assets"][0]["derivatives"][0]["src"] = "../../escape.png"
            with self.assertRaises(ValueError):
                probe(self.c["assets"][0], tmp)

    def test_does_not_mutate_inputs(self):
        before = copy.deepcopy((self.c, self.i))
        validate(self.c, self.i)
        self.assertEqual(before, (self.c, self.i))


if __name__ == "__main__":
    unittest.main()
