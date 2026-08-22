import asyncio
import os
import sys
import time
import unittest
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import api
from fastapi import HTTPException

ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
)


def element(index, lat=39.08, lng=-77.15):
    return {
        "type": "node",
        "id": index,
        "lat": lat + index * 0.0001,
        "lon": lng + index * 0.0001,
        "tags": {"name": f"Cafe {index}", "amenity": "restaurant", "cuisine": "thai"},
    }


def response(count=5):
    return {"elements": [element(index) for index in range(1, count + 1)]}


class FakeHttp:
    def __init__(self, behaviors):
        self.behaviors = list(behaviors)
        self.urls = []

    def __call__(self, url, **kwargs):
        self.urls.append(url)
        behavior = self.behaviors.pop(0)
        if isinstance(behavior, BaseException):
            raise behavior
        if callable(behavior):
            return behavior(url, **kwargs)
        return behavior


class RestaurantOverpassResiliencyTest(unittest.TestCase):
    def setUp(self):
        self.original_http_json = api.http_json
        self.original_endpoints = api.OVERPASS_ENDPOINTS
        self.original_timeout = api.OVERPASS_TIMEOUT_SECONDS
        api.OVERPASS_ENDPOINTS = ENDPOINTS
        api.OVERPASS_TIMEOUT_SECONDS = 1
        api.restaurant_discovery_cache.clear()
        api.restaurant_discovery_inflight.clear()
        api.restaurant_discovery_provider_state["failure_count"] = 0
        api.restaurant_discovery_provider_state["cooldown_until"] = 0.0

    def tearDown(self):
        api.http_json = self.original_http_json
        api.OVERPASS_ENDPOINTS = self.original_endpoints
        api.OVERPASS_TIMEOUT_SECONDS = self.original_timeout
        api.restaurant_discovery_cache.clear()
        api.restaurant_discovery_inflight.clear()
        api.restaurant_discovery_provider_state["failure_count"] = 0
        api.restaurant_discovery_provider_state["cooldown_until"] = 0.0

    def request(self, lat=39.08, lng=-77.15):
        return api.RestaurantDiscoverRequest(
            meal="anything",
            radiusMiles=5,
            location=api.RestaurantLocation(latitude=lat, longitude=lng, label="Rockville, MD"),
        )

    def test_primary_overpass_success(self):
        fake = FakeHttp([response()])
        api.http_json = fake
        restaurants = api.overpass_restaurant_discovery(39.08, -77.15, 6000)
        self.assertEqual(len(restaurants), 5)
        self.assertIn("overpass-api.de", fake.urls[0])
        self.assertEqual(len(fake.urls), 1)

    def test_primary_network_failure_falls_back_to_secondary(self):
        fake = FakeHttp([urllib.error.URLError(OSError(101, "Network is unreachable")), response()])
        api.http_json = fake
        restaurants = api.overpass_restaurant_discovery(39.08, -77.15, 6000)
        self.assertEqual(len(restaurants), 5)
        self.assertIn("overpass-api.de", fake.urls[0])
        self.assertIn("overpass.kumi.systems", fake.urls[1])

    def test_primary_timeout_falls_back_to_secondary(self):
        fake = FakeHttp([TimeoutError("timed out"), response()])
        api.http_json = fake
        restaurants = api.overpass_restaurant_discovery(39.08, -77.15, 6000)
        self.assertEqual(len(restaurants), 5)
        self.assertIn("overpass.kumi.systems", fake.urls[1])

    def test_all_endpoints_fail_returns_cached_result_when_available(self):
        api.restaurant_discovery_cache[api.restaurant_discovery_cache_key(39.08, -77.15, api.miles_to_meters(5))] = (
            time.time() - api.RESTAURANT_DISCOVERY_CACHE_TTL_SECONDS - 1,
            [{"id": "cached-1", "name": "Cached Cafe", "distanceMiles": 0.5}],
            api.miles_to_meters(5),
        )
        api.http_json = FakeHttp([urllib.error.URLError("down"), TimeoutError("slow"), urllib.error.HTTPError("u", 503, "bad", {}, None)])
        result = asyncio.run(api.restaurant_discover(self.request()))
        self.assertEqual(result["restaurants"][0]["name"], "Cached Cafe")
        self.assertEqual(result["metadata"]["cached"], True)
        self.assertEqual(result["metadata"]["stale"], True)
        self.assertEqual(result["metadata"]["providerStatus"], "live_unavailable")

    def test_all_endpoints_fail_without_cache_returns_discovery_unavailable(self):
        api.http_json = FakeHttp([urllib.error.URLError("down"), TimeoutError("slow"), urllib.error.HTTPError("u", 503, "bad", {}, None)])
        with self.assertRaises(HTTPException) as raised:
            asyncio.run(api.restaurant_discover(self.request()))
        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.detail["code"], "DISCOVERY_UNAVAILABLE")

    def test_identical_concurrent_searches_share_one_provider_call(self):
        calls = {"count": 0}

        def slow_success(*args, **kwargs):
            calls["count"] += 1
            time.sleep(0.05)
            return response()

        api.http_json = FakeHttp([slow_success])

        async def run():
            return await asyncio.gather(api.restaurant_discover(self.request()), api.restaurant_discover(self.request()))

        results = asyncio.run(run())
        self.assertEqual(calls["count"], 1)
        self.assertEqual(len(results[0]["restaurants"]), 5)
        self.assertEqual(len(results[1]["restaurants"]), 5)

    def test_different_locations_do_not_dedupe_together(self):
        calls = {"count": 0}

        def slow_success(*args, **kwargs):
            calls["count"] += 1
            time.sleep(0.05)
            return response()

        api.http_json = FakeHttp([slow_success, slow_success])

        async def run():
            return await asyncio.gather(
                api.restaurant_discover(self.request(39.08, -77.15)),
                api.restaurant_discover(self.request(38.99, -77.02)),
            )

        asyncio.run(run())
        self.assertEqual(calls["count"], 2)


if __name__ == "__main__":
    unittest.main()