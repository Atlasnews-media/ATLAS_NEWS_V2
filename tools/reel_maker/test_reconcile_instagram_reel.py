#!/usr/bin/env python3
import unittest

from reconcile_instagram_reel import find_reel_candidate


CANONICAL = "https://atlasnews-media.github.io/ediciones/2026-09-18-daily-test/"


class ReelReconciliationTests(unittest.TestCase):
    def test_selects_reel_and_ignores_carousel_with_same_canonical(self):
        payload = {
            "data": [
                {
                    "id": "carousel-1",
                    "caption": f"Titular\n\nLee la edición completa en Atlas News:\n{CANONICAL}\n\n#AtlasNews",
                    "media_type": "CAROUSEL_ALBUM",
                },
                {
                    "id": "reel-1",
                    "caption": f"ATLAS NEWS · EDICIÓN 047\n\nTitular\n\nLee la edición completa en {CANONICAL}",
                    "media_type": "VIDEO",
                    "media_product_type": "REELS",
                    "permalink": "https://www.instagram.com/reel/example/",
                },
            ]
        }
        self.assertEqual(find_reel_candidate(payload, CANONICAL)["id"], "reel-1")

    def test_returns_none_when_reel_is_absent(self):
        payload = {
            "data": [
                {
                    "id": "carousel-1",
                    "caption": f"Titular {CANONICAL}",
                    "media_type": "CAROUSEL_ALBUM",
                }
            ]
        }
        self.assertIsNone(find_reel_candidate(payload, CANONICAL))

    def test_rejects_multiple_reels_for_same_canonical(self):
        payload = {
            "data": [
                {
                    "id": "reel-1",
                    "caption": f"ATLAS NEWS · EDICIÓN 047\n{CANONICAL}",
                    "media_product_type": "REELS",
                },
                {
                    "id": "reel-2",
                    "caption": f"ATLAS NEWS · EDICIÓN 047\n{CANONICAL}",
                    "media_product_type": "REELS",
                },
            ]
        }
        with self.assertRaises(ValueError):
            find_reel_candidate(payload, CANONICAL)

    def test_ignores_non_reels_product_type(self):
        payload = {
            "data": [
                {
                    "id": "feed-video",
                    "caption": f"ATLAS NEWS · EDICIÓN 047\n{CANONICAL}",
                    "media_product_type": "FEED",
                }
            ]
        }
        self.assertIsNone(find_reel_candidate(payload, CANONICAL))


if __name__ == "__main__":
    unittest.main()
