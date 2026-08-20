import asyncio
import base64
import hashlib
import html
import json
import logging
import math
import threading
import time
# LEGACY PHASE 2C TRANSITION: universal dietary logic lives in the frontend
# ROOTS_DIETARY_ENGINE. Do not duplicate new rules into this dormant backend classifier.
import os
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Provider-backed routes read their settings while roots_security imports, so
# load the ignored local environment before importing that module.
load_dotenv()

from roots_security import new_request_id, router as security_router, validate_public_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("butIsItJain")

app = FastAPI(title="ROOTS API", docs_url=None if os.getenv("ENVIRONMENT") == "production" else "/docs")
allowed_origins = [
    value.strip() for value in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500,https://localhost,capacitor://localhost,http://localhost,ionic://localhost",
    ).split(",") if value.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-ROOTS-Install-ID"],
)
app.include_router(security_router)

@app.get("/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "providerConfigured": bool(os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY")),
        "environment": os.getenv("ENVIRONMENT", "development"),
    }

@app.middleware("http")
async def security_headers(request: Request, call_next):
    request_id = new_request_id()
    try:
        response = await call_next(request)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Request %s failed", request_id)
        from fastapi.responses import JSONResponse
        response = JSONResponse(
            status_code=500,
            content={"detail": {"code": "internal_error", "message": "The request could not be completed."}},
        )
    response.headers.update({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(self), geolocation=(self), microphone=()",
        "Cross-Origin-Resource-Policy": "same-site",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        "Cache-Control": "no-store",
        "X-Request-ID": request_id,
    })
    return response

CACHE_FILE = "scan_cache.json"
CACHE_SCHEMA_VERSION = 3
CACHE_TTL_DAYS = int(os.getenv("CACHE_TTL_DAYS", "30"))
CACHE_MAX_ENTRIES = int(os.getenv("CACHE_MAX_ENTRIES", "500"))
RATE_LIMIT_PER_MINUTE = 10
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_EXTRACT_MODEL = os.getenv("OPENAI_EXTRACT_MODEL", "gpt-4.1")
OPENAI_CLASSIFY_MODEL = os.getenv("OPENAI_CLASSIFY_MODEL", "gpt-4.1-mini")
CLASSIFY_CHUNK_SIZE = 5
GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY", "")
GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY", "")
FINDER_RADIUS_METERS = int(os.getenv("FINDER_RADIUS_METERS", "6000"))
EXPANDED_FINDER_RADIUS_METERS = (15000, 40000, 80000)
HTTP_TIMEOUT_SECONDS = int(os.getenv("HTTP_TIMEOUT_SECONDS", "7"))
OVERPASS_TIMEOUT_SECONDS = int(os.getenv("OVERPASS_TIMEOUT_SECONDS", "25"))
ROOTS_OSM_CONTACT = os.getenv("ROOTS_OSM_CONTACT", "roots.food.app@gmail.com")
OSM_USER_AGENT = f"ROOTS/1.0 ({ROOTS_OSM_CONTACT})"
NOMINATIM_CACHE_TTL_SECONDS = int(os.getenv("NOMINATIM_CACHE_TTL_SECONDS", "86400"))
MAX_WEB_BYTES = 900_000

user_requests: Dict[str, List[datetime]] = {}
geocode_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
restaurant_discovery_cache: Dict[str, Tuple[float, List[Dict[str, Any]], int]] = {}
RESTAURANT_DISCOVERY_CACHE_TTL_SECONDS = int(os.getenv("RESTAURANT_DISCOVERY_CACHE_TTL_SECONDS", "300"))
nominatim_lock = threading.Lock()
last_nominatim_request_at = 0.0

MEAT_TERMS = {
    "anchovy", "bacon", "beef", "bone broth", "broth", "chicken", "duck", "fish",
    "ham", "lamb", "lard", "meat", "mutton", "pork", "sausage", "shrimp", "stock",
    "tuna",
}

EGG_TERMS = {"egg", "eggs", "albumen", "albumin", "egg whites", "mayonnaise"}

ROOT_TERMS = {
    "beet", "beets", "carrot", "carrots", "garlic", "garlic powder", "ginger",
    "onion", "onion powder", "potato", "potatoes", "radish", "shallot", "shallots",
    "sweet potato", "tapioca", "turnip", "yam",
}

ONION_GARLIC_TERMS = {"garlic", "garlic powder", "onion", "onion powder", "shallot", "shallots"}

ANIMAL_BYPRODUCT_TERMS = {
    # Dairy (casein, lactose, whey) is intentionally excluded — Jainism is
    # lacto-vegetarian, so dairy is allowed (blocked only for vegan / milk allergy).
    "carmine", "collagen", "confectioner's glaze", "gelatin", "isinglass",
    "rennet", "shellac",
}

DAIRY_TERMS = {
    "butter", "casein", "cheese", "cream", "ghee", "lactose", "milk", "milk powder",
    "paneer", "whey", "yogurt",
}

HONEY_TERMS = {"honey"}

ARTIFICIAL_ADDITIVE_TERMS = {
    "artificial color", "artificial colors", "artificial flavour", "artificial flavours",
    "artificial flavor", "artificial flavors", "blue 1", "blue 2", "fd&c", "red 3",
    "red 40", "yellow 5", "yellow 6",
}

NON_JAIN_TERMS = MEAT_TERMS | EGG_TERMS | ROOT_TERMS | ANIMAL_BYPRODUCT_TERMS | HONEY_TERMS

JAIN_SAFE_TERMS = {
    "almond", "ascorbic acid", "basil", "black pepper", "brown rice", "cabbage",
    "calcium carbonate", "canola oil", "cardamom", "cashew", "chili pepper",
    "citric acid", "cocoa butter", "coconut oil", "corn flour", "corn starch",
    "cottonseed oil", "cream", "dextrose", "flour", "folic acid", "ghee", "guar gum",
    "lentils", "maltodextrin", "milk", "niacin", "paneer", "paprika", "peanut oil",
    "pepper", "rice", "riboflavin", "safflower oil", "salt", "sea salt", "seed",
    "soy lecithin", "soybean oil", "spinach", "sugar", "sunflower oil",
    "sunflower lecithin", "thiamine", "tomato", "turmeric", "vegetable oil", "water",
    "wheat flour", "xanthan gum", "yogurt",
}

AMBIGUOUS_TERMS = {
    "artificial flavor", "artificial flavors", "color", "colour", "culture", "cultures",
    "emulsifier", "enzyme", "enzymes", "flavor", "flavors", "flavour", "flavours",
    "natural flavor", "natural flavors", "natural flavour", "natural flavours",
    "preservative", "seasoning", "seasonings", "spice", "spices", "stabilizer",
}

# Ingredient-specific context for each ambiguous term, so "uncertain" ingredients
# explain WHY they're unclear instead of a one-size-fits-all "needs review" message.
AMBIGUOUS_TERM_REASONS = {
    "natural flavor": "Can legally come from a plant or animal source — the label doesn't say which.",
    "natural flavors": "Can legally come from a plant or animal source — the label doesn't say which.",
    "natural flavour": "Can legally come from a plant or animal source — the label doesn't say which.",
    "natural flavours": "Can legally come from a plant or animal source — the label doesn't say which.",
    "artificial flavor": "Usually lab-synthesized, not from an animal or plant source — typically the safer of the two flavor types.",
    "artificial flavors": "Usually lab-synthesized, not from an animal or plant source — typically the safer of the two flavor types.",
    "flavor": "Doesn't say “natural” or “artificial,” so the source can't be determined.",
    "flavors": "Doesn't say “natural” or “artificial,” so the source can't be determined.",
    "flavour": "Doesn't say “natural” or “artificial,” so the source can't be determined.",
    "flavours": "Doesn't say “natural” or “artificial,” so the source can't be determined.",
    "color": "Could be plant-based (turmeric, beet) or animal-based (carmine, from insects) — not specified.",
    "colour": "Could be plant-based (turmeric, beet) or animal-based (carmine, from insects) — not specified.",
    "culture": "A bacterial fermentation culture, not animal tissue — but often grown in a dairy base.",
    "cultures": "A bacterial fermentation culture, not animal tissue — but often grown in a dairy base.",
    "emulsifier": "Can be plant-based (soy lecithin) or occasionally animal-derived — not specified.",
    "enzyme": "Can be microbial or animal-derived (like rennet) — depends on the product.",
    "enzymes": "Can be microbial or animal-derived (like rennet) — depends on the product.",
    "preservative": "Usually synthetic or plant-derived, but the specific one isn't named.",
    "spice": "Spices are usually plant-based, but a “spice blend” could fold in onion or garlic powder.",
    "spices": "Spices are usually plant-based, but a “spice blend” could fold in onion or garlic powder.",
    "seasoning": "Seasoning blends often fold in onion or garlic powder without listing them separately.",
    "seasonings": "Seasoning blends often fold in onion or garlic powder without listing them separately.",
    "stabilizer": "Can be plant-based (gums) or animal-derived (gelatin) — not specified.",
}


def ambiguous_reason(normalized: str) -> Optional[str]:
    """Pick the most specific matching term (e.g. prefer "natural flavor" over bare "flavor")."""
    hits = [t for t in AMBIGUOUS_TERMS if t in normalized]
    if not hits:
        return None
    hits.sort(key=len, reverse=True)
    return AMBIGUOUS_TERM_REASONS.get(hits[0], f'Contains "{hits[0]}", which is too broad to classify from the label alone.')

LIKELY_SAFE_PATTERNS = (
    "acid", "bean", "berry", "bran", "butter", "calcium", "canola", "carbonate", "casein",
    "cereal", "cheese", "chloride", "citrate", "cocoa", "coconut", "corn", "cream",
    "dextrose", "flour", "fruit", "ghee", "glucose", "gum", "lactose", "lecithin",
    "maltodextrin", "milk", "oil", "paneer", "pea", "pepper", "phosphate", "potassium",
    "protein", "rice", "salt", "seed", "sodium", "soy", "starch", "sugar", "sulfate",
    "sunflower", "tomato", "turmeric", "vitamin", "water", "wheat", "whey", "xanthan",
    "yogurt",
)

NUTRITION_STOP_TERMS = {
    "amount per serving", "calories", "calories from fat", "cholesterol", "daily value",
    "dietary fiber", "iron", "magnesium", "nutrition facts", "percent daily value",
    "potassium", "protein", "riboflavin", "saturated fat", "serving size", "sodium",
    "sugars", "thiamin", "total carbohydrate", "total fat", "trans fat", "vitamin",
    "vitamin a", "vitamin c", "vitamin e", "zinc",
}

INGREDIENT_IGNORE_PHRASES = {
    "bioengineered", "distributed by", "gluten free", "gluten-free", "keep refrigerated",
    "manufactured by", "nutrition facts", "organic", "serving suggestion",
}

OIL_ITEMS = (
    "peanut oil", "corn oil", "cottonseed oil", "sunflower oil", "canola oil",
    "safflower oil", "soybean oil",
)

OCR_TERM_CORRECTIONS = {
    "onon powder": "onion powder",
    "onon": "onion",
    "onion powader": "onion powder",
    "garic powder": "garlic powder",
    "safeflower oil": "safflower oil",
    "saflower oil": "safflower oil",
}

KNOWN_INGREDIENT_PHRASES = sorted(
    set(NON_JAIN_TERMS) | set(JAIN_SAFE_TERMS) | set(AMBIGUOUS_TERMS) | set(ARTIFICIAL_ADDITIVE_TERMS),
    key=len,
    reverse=True,
)


class ExtractOutput(BaseModel):
    ingredients: List[str]
    ocr_text: str
    is_valid: bool
    note: Optional[str] = None
    originals: Dict[str, str] = Field(default_factory=dict)
    source_language: Optional[str] = None


class SingleResult(BaseModel):
    name: str
    category: str
    reason: str
    source: str = "rule"
    translation: Optional[str] = None
    is_community_corrected: bool = False
    is_veg: Optional[bool] = None
    is_vegan: Optional[bool] = None


class DietaryProfile(BaseModel):
    label: str = "Flexible Jain"
    avoid_meat: bool = True
    avoid_eggs: bool = True
    avoid_root_vegetables: bool = False
    avoid_onion_garlic: bool = False
    avoid_honey: bool = False
    avoid_animal_byproducts: bool = True
    vegan: bool = False
    avoid_artificial_additives: bool = False
    allergies: List[str] = Field(default_factory=list)


class FoodFinderRequest(BaseModel):
    kind: str = "restaurants"
    meal: str = "any"
    cuisine: str = "any"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_text: Optional[str] = None
    doordash_url: Optional[str] = None
    diet_profile: DietaryProfile = Field(default_factory=DietaryProfile)

class RestaurantLocation(BaseModel):
    latitude: float
    longitude: float
    label: Optional[str] = None


class RestaurantDiscoverRequest(BaseModel):
    meal: str = "anything"
    location: RestaurantLocation
    radiusMiles: float = 5

class MenuItemResult(BaseModel):
    name: str
    status: str
    reason: str
    source_url: Optional[str] = None
    order_note: Optional[str] = None


class DiningGuidance(BaseModel):
    cuisine_label: str
    strategy: str
    safe_bets: List[Dict[str, str]] = Field(default_factory=list)
    watch_for: List[str] = Field(default_factory=list)
    ask_kitchen: str


class FinderPlaceResult(BaseModel):
    name: str
    address: Optional[str] = None
    website: Optional[str] = None
    maps_url: Optional[str] = None
    provider: str
    source: str
    menu_status: str
    distance_meters: Optional[int] = None
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    menu_source_url: Optional[str] = None
    cuisine_match: Optional[str] = None
    cuisine_score: int = 0
    cuisine_confidence: str = "unknown"
    menu_items: List[MenuItemResult] = Field(default_factory=list)
    blocked_items: List[MenuItemResult] = Field(default_factory=list)
    caution_items: List[MenuItemResult] = Field(default_factory=list)
    guidance: Optional[DiningGuidance] = None
    note: Optional[str] = None


def default_profile() -> DietaryProfile:
    return DietaryProfile()


def parse_profile(raw_profile: Optional[str]) -> DietaryProfile:
    if not raw_profile:
        return default_profile()
    try:
        payload = json.loads(raw_profile)
        if not isinstance(payload, dict):
            return default_profile()
        payload["allergies"] = [
            normalize_name(item)
            for item in payload.get("allergies", [])
            if normalize_name(item)
        ][:20]
        return DietaryProfile(**payload)
    except Exception:
        logger.exception("Invalid diet profile payload")
        return default_profile()


def profile_cache_key(content: bytes, profile: DietaryProfile) -> str:
    profile_payload = profile.model_dump()
    profile_payload["allergies"] = sorted(normalize_key(item) for item in profile.allergies)
    raw = f"{image_hash(content)}:{json.dumps(profile_payload, sort_keys=True)}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def read_json_file(path: str) -> Dict:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        logger.exception("Failed to read %s", path)
        return {}


def write_json_file(path: str, payload: Dict) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)


def prune_cache(cache: Dict) -> Dict:
    """Drop expired entries and cap total size so scan_cache.json can't grow forever."""
    if not isinstance(cache, dict) or not cache:
        return cache if isinstance(cache, dict) else {}

    cutoff = datetime.now() - timedelta(days=CACHE_TTL_DAYS)
    dated: List[Tuple[datetime, str, Dict]] = []
    for key, entry in cache.items():
        if not isinstance(entry, dict):
            continue
        if entry.get("cache_schema_version") != CACHE_SCHEMA_VERSION:
            continue
        try:
            stamp = datetime.fromisoformat(entry.get("timestamp", ""))
        except (TypeError, ValueError):
            stamp = cutoff  # undated entries treated as old, kept only if room remains
        if stamp >= cutoff:
            dated.append((stamp, key, entry))

    dated.sort(key=lambda item: item[0], reverse=True)
    return {key: entry for _, key, entry in dated[:CACHE_MAX_ENTRIES]}


def normalize_name(text: str) -> str:
    cleaned = str(text or "").replace("\n", " ").replace("\r", " ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.strip(" ,.;:-")
    if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
        cleaned = cleaned[1:-1].strip()
    return cleaned


def normalize_key(text: str) -> str:
    lowered = normalize_name(text).lower()
    lowered = lowered.replace("&", " and ")
    lowered = re.sub(r"[^a-z0-9+/\-\s]", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def is_anchor_token(token: str) -> bool:
    letters = re.sub(r"[^a-z]", "", token.lower())
    if not letters:
        return False
    targets = ("ingredient", "ingredients")
    return any(SequenceMatcher(None, letters, target).ratio() >= 0.62 for target in targets)


def is_ingredient_anchor_line(line: str) -> bool:
    tokens = re.findall(r"[A-Za-z]+", line)
    return any(is_anchor_token(token) for token in tokens)


def strip_anchor(line: str) -> str:
    tokens = re.split(r"(\s+|:|-)", line)
    collected: List[str] = []
    anchor_seen = False
    for token in tokens:
        if not anchor_seen and is_anchor_token(token):
            anchor_seen = True
            continue
        if anchor_seen:
            collected.append(token)
    remainder = "".join(collected)
    remainder = re.sub(r"^[\s:.-]+", "", remainder)
    return normalize_name(remainder)


def is_stop_line(line: str) -> bool:
    normalized = normalize_key(line)
    if not normalized:
        return True
    if any(term in normalized for term in NUTRITION_STOP_TERMS):
        return True
    if any(term in normalized for term in INGREDIENT_IGNORE_PHRASES):
        return True
    if normalized.startswith(("contains ", "may contain ", "allergen", "distributed by", "manufactured by", "serving ")):
        return True
    if re.search(r"\b\d+(\.\d+)?\s*(mg|mcg|g|kg|oz|cal|kcal|%)\b", normalized):
        return True
    if len(re.findall(r"\d", normalized)) >= 3:
        return True
    return False


def is_soft_stop_line(line: str) -> bool:
    normalized = normalize_key(line)
    if not normalized:
        return True
    if any(term in normalized for term in NUTRITION_STOP_TERMS):
        return True
    if re.search(r"\b\d+(\.\d+)?\s*(mg|mcg|g|kg|oz|cal|kcal|%)\b", normalized):
        return True
    return False


def fix_common_ocr(text: str) -> str:
    fixed = str(text or "")
    replacements = {
        "andior": "and/or",
        "andor": "and/or",
        " ol ": " oil ",
        " oi ": " oil ",
        " one or more of the following ": " ",
        " or more of the following ": " ",
    }
    for old, new in replacements.items():
        fixed = re.sub(re.escape(old), new, fixed, flags=re.IGNORECASE)
    for old, new in OCR_TERM_CORRECTIONS.items():
        fixed = re.sub(rf"\b{re.escape(old)}\b", new, fixed, flags=re.IGNORECASE)
    return fixed


def extract_ingredient_block(raw_text: str) -> Tuple[str, bool]:
    lines = [line.strip() for line in str(raw_text or "").replace("\r", "\n").split("\n")]
    for index, line in enumerate(lines):
        if not line or not is_ingredient_anchor_line(line):
            continue
        block_parts: List[str] = []
        soft_stop_count = 0
        remainder = strip_anchor(line)
        if remainder and not is_stop_line(remainder):
            block_parts.append(remainder)
        for follow_line in lines[index + 1:index + 15]:
            cleaned = normalize_name(follow_line)
            if not cleaned:
                if block_parts:
                    soft_stop_count += 1
                    if soft_stop_count >= 2:
                        break
                continue
            if is_stop_line(cleaned):
                break
            if is_soft_stop_line(cleaned):
                soft_stop_count += 1
                if block_parts and soft_stop_count >= 2:
                    break
                continue
            soft_stop_count = 0
            block_parts.append(cleaned)
        block = "\n".join(part for part in block_parts if part)
        return block, bool(block)
    return "", False


def split_top_level(text: str) -> List[str]:
    parts: List[str] = []
    current: List[str] = []
    depth = 0
    for char in text:
        if char == "(":
            depth += 1
        elif char == ")":
            depth = max(0, depth - 1)
        if char == "," and depth == 0:
            parts.append("".join(current))
            current = []
            continue
        current.append(char)
    if current:
        parts.append("".join(current))
    return parts


def split_candidate_text(text: str) -> List[str]:
    prepared = re.sub(r"\s{2,}", ", ", text)
    prepared = prepared.replace("\n", ",")
    pieces: List[str] = []
    for part in split_top_level(prepared):
        pieces.extend([sub_part for sub_part in re.split(r"\s{2,}", part) if sub_part.strip()])
    return pieces


def normalize_oil_blend(candidate: str) -> str:
    normalized = normalize_key(candidate)
    if "vegetable oil" not in normalized:
        return candidate
    found = [oil.title() for oil in OIL_ITEMS if oil in normalized]
    if found:
        return ", ".join(found)
    return candidate


def split_compound_candidate(candidate: str) -> List[str]:
    normalized = normalize_key(candidate)
    if not normalized:
        return []

    matched: List[Tuple[int, int, str]] = []
    for phrase in KNOWN_INGREDIENT_PHRASES:
        start = normalized.find(phrase)
        if start >= 0:
            matched.append((start, start + len(phrase), phrase.title()))

    if len(matched) < 2:
        return [candidate]

    matched.sort(key=lambda item: (item[0], -(item[1] - item[0])))
    output: List[str] = []
    last_end = -1
    for start, end, phrase in matched:
        if start < last_end:
            continue
        output.append(phrase)
        last_end = end

    coverage = sum(len(normalize_key(item)) for item in output)
    if coverage < max(8, int(len(normalized) * 0.65)):
        return [candidate]
    return output


def looks_like_junk(candidate: str) -> bool:
    normalized = normalize_key(candidate)
    words = [word for word in normalized.split() if word]
    if not words:
        return True
    if len(words) == 1 and len(words[0]) <= 3 and words[0] not in {"oil", "soy", "pea"}:
        return True
    if len(words) >= 3 and sum(1 for word in words if len(word) <= 2) >= max(2, len(words) // 2):
        return True
    if len(words) >= 2 and not any(len(word) >= 4 for word in words):
        return True
    if any(term in normalized for term in NUTRITION_STOP_TERMS):
        return True
    if re.search(r"\b\d+(\.\d+)?\s*(mg|mcg|g|kg|oz|cal|kcal|%)\b", normalized):
        return True
    return False


def clean_candidate(candidate: str) -> str:
    cleaned = normalize_name(fix_common_ocr(candidate))
    cleaned = re.sub(r"^[^A-Za-z]*(contains|may contain)\b[:\s-]*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^[^A-Za-z]+", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.strip(" ,.;:-")
    return normalize_oil_blend(cleaned)


def should_keep_candidate(candidate: str) -> bool:
    normalized = normalize_key(candidate)
    if not normalized:
        return False
    if len(normalized) <= 2:
        return False
    if normalized in {"ingredients", "contains", "may contain"}:
        return False
    if any(phrase in normalized for phrase in INGREDIENT_IGNORE_PHRASES):
        return False
    if looks_like_junk(candidate):
        return False
    return True


def dedupe_preserve_order(items: List[str]) -> List[str]:
    seen: set[str] = set()
    output: List[str] = []
    for item in items:
        key = normalize_key(item)
        if key and key not in seen:
            seen.add(key)
            output.append(item)
    return output


def parse_ingredients(raw_text: str) -> List[str]:
    block, found_anchor = extract_ingredient_block(raw_text)
    if not found_anchor or not block:
        return []

    block = fix_common_ocr(block)
    block = block.replace("•", ",").replace("·", ",")
    block = re.sub(r"[;\n]+", ",", block)
    parts = split_candidate_text(block)

    ingredients: List[str] = []
    for part in parts:
        candidate = clean_candidate(part)
        for split_candidate in split_compound_candidate(candidate):
            if not should_keep_candidate(split_candidate):
                continue
            ingredients.append(split_candidate)

    if len(ingredients) <= 1:
        fallback_parts = re.split(r",|\n| {2,}", block)
        for part in fallback_parts:
            candidate = clean_candidate(part)
            for split_candidate in split_compound_candidate(candidate):
                if not should_keep_candidate(split_candidate):
                    continue
                ingredients.append(split_candidate)

    merged: List[str] = []
    index = 0
    while index < len(ingredients):
        current = normalize_key(ingredients[index])
        next_item = normalize_key(ingredients[index + 1]) if index + 1 < len(ingredients) else ""
        if current == "yeast" and next_item == "extract":
            merged.append("Yeast Extract")
            index += 2
            continue
        merged.append(ingredients[index])
        index += 1

    return dedupe_preserve_order(merged)


# ------------------------------------------------------------------------------
# Scan engine: OpenAI vision extracts the ingredient list, then an OpenAI
# classifier judges each ingredient against THIS user's diet profile. The local
# rule classifier (classify_ingredient) is kept only for the restaurant finder.
# ------------------------------------------------------------------------------

SYSTEM_PROMPT_EXTRACTOR = """
You are an OCR extractor and translator for food ingredient labels.

Task:
- Read the ingredient list, which may be in ANY language.
- Return each ingredient as an object: { "name": "<English name>", "original": "<text exactly as printed on the label>" }.
- "name" must ALWAYS be the English translation. "original" is the label text in its source language.
  If the label is already in English, set "original" equal to "name".
- Split ingredients at top-level commas (commas inside parentheses/brackets do NOT split the top-level ingredient).
- If an ingredient lists sub-ingredients in parentheses (e.g. "Seasoning (salt, sugar)"),
  include BOTH the outer ingredient and each sub-ingredient as separate items.
- Do NOT combine multiple ingredients into one item. Do NOT include quantities, sizes, or packaging text.
- Also report the detected source language as a short name (e.g. "English", "Hindi", "Spanish").
- If the image is NOT an ingredient label, return:
  { "ingredients": [], "is_valid": false, "note": "short explanation", "source_language": null }
Otherwise return:
  { "ingredients": [ { "name": "Sugar", "original": "Azúcar" }, ... ], "is_valid": true, "source_language": "Spanish" }
Only return JSON exactly in that shape.
"""

CLASSIFIER_BASE_RULES = """
You are a Jain dietary classifier. You classify each ingredient as JAIN (allowed),
NON_JAIN (not allowed), or UNCERTAIN (cannot tell), STRICTLY according to the
specific user profile provided below.

General Jain baseline (then adjusted by the user's profile):
- Allowed: above-ground plant foods, grains, legumes, seeds, nuts, spices, plant oils,
  and non-animal synthetics/preservatives.
- Not allowed by default: meat, fish, poultry, seafood; eggs; root/underground vegetables
  (potato, onion, garlic, ginger, carrot, beet, radish, sweet potato, turnip); honey;
  insect-derived items (carmine/cochineal, shellac, lac); gelatin and animal rennet;
  animal stock/broth.
- Dairy (milk, cheese, butter, ghee, cream, whey, casein, lactose, yogurt, paneer) is
  allowed UNLESS the user is vegan.

UNCERTAIN when genuinely ambiguous: "natural/artificial flavors" without clarification,
enzymes not specified as microbial/vegetarian, "mono- and diglycerides" of unknown source,
or anything the rules do not clearly resolve.
"""

CLASSIFIER_OUTPUT_SPEC = """
You will receive a list of ingredients (up to 5).
For EACH ingredient, return exactly one classification object. Do not merge or skip any.

Respond ONLY with this JSON shape:
{ "results": [ { "ingredient": "<name>", "category": "JAIN | NON_JAIN | UNCERTAIN", "reason": "<short reason>" } ] }
"""


class AIExtractItem(BaseModel):
    name: str
    original: Optional[str] = None


class AIExtractOutput(BaseModel):
    ingredients: List[AIExtractItem]
    is_valid: bool
    note: Optional[str] = None
    source_language: Optional[str] = None


class AISingleClassification(BaseModel):
    ingredient: str
    category: str
    reason: Optional[str] = None


class AIGroupClassification(BaseModel):
    results: List[AISingleClassification]


_openai_client = None


def get_openai_client():
    global _openai_client
    if _openai_client is None:
        if not OPENAI_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="Label scanning is unavailable: OPENAI_API_KEY is not configured on the server.",
            )
        from openai import OpenAI

        _openai_client = OpenAI(api_key=OPENAI_API_KEY)
    return _openai_client


def build_classifier_prompt(profile: DietaryProfile) -> str:
    rules: List[str] = []
    if profile.avoid_meat:
        rules.append("- Meat, fish, poultry, seafood, and meat-based stock/broth are NOT allowed (NON_JAIN).")
    if profile.avoid_eggs:
        rules.append("- Eggs of any kind are NOT allowed (NON_JAIN).")
    if profile.avoid_root_vegetables:
        rules.append("- Root/underground vegetables (potato, onion, garlic, ginger, carrot, beet, radish, sweet potato, turnip, etc.) are NOT allowed (NON_JAIN).")
    elif profile.avoid_onion_garlic:
        rules.append("- Onion, garlic, and shallots are NOT allowed (NON_JAIN). Other root vegetables ARE allowed for this user.")
    else:
        rules.append("- This user permits root vegetables, including onion and garlic.")
    if profile.avoid_honey:
        rules.append("- Honey is NOT allowed (NON_JAIN).")
    if profile.avoid_animal_byproducts:
        rules.append("- Gelatin, animal rennet, carmine/cochineal, shellac, and isinglass are NOT allowed (NON_JAIN).")
    if profile.vegan:
        rules.append("- This user is VEGAN: all dairy (milk, cheese, butter, ghee, cream, whey, casein, lactose, yogurt, paneer) is NOT allowed (NON_JAIN).")
    else:
        rules.append("- Dairy products ARE allowed for this user (milk, cheese, butter, ghee, cream, whey, casein, yogurt, paneer = JAIN).")
    if profile.avoid_artificial_additives:
        rules.append("- Artificial colors and artificial flavors are NOT allowed (NON_JAIN).")
    if profile.allergies:
        rules.append("- The user must avoid these allergens/restrictions: " + ", ".join(profile.allergies) + ". Any ingredient containing or derived from these is NON_JAIN.")

    return (
        CLASSIFIER_BASE_RULES
        + "\n\n### THIS USER'S PROFILE (apply strictly)\nProfile label: "
        + (profile.label or "Custom")
        + "\n"
        + "\n".join(rules)
        + "\n"
        + CLASSIFIER_OUTPUT_SPEC
    )


def ai_extract_ingredients(content: bytes) -> ExtractOutput:
    client = get_openai_client()
    b64 = base64.b64encode(content).decode("utf-8")
    response = client.responses.parse(
        model=OPENAI_EXTRACT_MODEL,
        input=[
            {"role": "system", "content": SYSTEM_PROMPT_EXTRACTOR},
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": "Extract ingredients from this label."},
                    {"type": "input_image", "image_url": f"data:image/jpeg;base64,{b64}"},
                ],
            },
        ],
        text_format=AIExtractOutput,
    )
    data = response.output_parsed
    if not data.is_valid:
        return ExtractOutput(
            ingredients=[],
            ocr_text="",
            is_valid=False,
            note=data.note or "This image does not look like an ingredient label. Try a clear photo of the ingredients list.",
        )

    cleaned: List[str] = []
    seen: set[str] = set()
    originals: Dict[str, str] = {}
    for item in data.ingredients:
        original_text = normalize_name(item.original or "")
        for piece in re.split(r"\s+(?:and|or)\s+|/", item.name):
            name = normalize_name(piece)
            if not name:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(name)
            # Only record an original when it meaningfully differs (i.e. another language).
            if original_text and normalize_key(original_text) != normalize_key(name):
                originals[key] = original_text
    if not cleaned:
        return ExtractOutput(
            ingredients=[],
            ocr_text="",
            is_valid=False,
            note="No readable ingredients were found. Try a tighter, clearer photo of the ingredient list.",
        )
    return ExtractOutput(
        ingredients=cleaned,
        ocr_text=", ".join(cleaned),
        is_valid=True,
        originals=originals,
        source_language=data.source_language,
    )


def apply_allergy_override(result: SingleResult, profile: DietaryProfile) -> SingleResult:
    normalized = normalize_key(result.name)
    for allergy in profile.allergies:
        key = normalize_key(allergy)
        if key and (key in normalized or key.rstrip("s") in normalized):
            return SingleResult(
                name=result.name,
                category="ALLERGEN",
                reason=f"Contains an allergen/restriction you listed: {allergy}.",
                source="rule",
            )
    return result


def ai_classify_ingredients(ingredients: List[str], profile: DietaryProfile) -> List[SingleResult]:
    if not ingredients:
        return []
    client = get_openai_client()
    system_prompt = build_classifier_prompt(profile)
    results: List[SingleResult] = []
    for start in range(0, len(ingredients), CLASSIFY_CHUNK_SIZE):
        chunk = ingredients[start:start + CLASSIFY_CHUNK_SIZE]
        response = client.responses.parse(
            model=OPENAI_CLASSIFY_MODEL,
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Classify these ingredients: {chunk}"},
            ],
            text_format=AIGroupClassification,
        )
        for item in response.output_parsed.results:
            name = next((c for c in chunk if c.lower() == item.ingredient.lower()), item.ingredient)
            category = (item.category or "").upper().strip()
            if category not in {"JAIN", "NON_JAIN", "UNCERTAIN"}:
                category = "UNCERTAIN"
            single = SingleResult(name=name, category=category, reason=item.reason or "", source="ai")
            results.append(apply_allergy_override(single, profile))
    return results


def has_term(normalized: str, terms: set[str]) -> bool:
    return any(term in normalized for term in terms)


def fuzzy_term_hit(normalized: str, terms: set[str], threshold: float = 0.85) -> Optional[str]:
    """Catch OCR-mangled single-word ingredients (e.g. 'garlik' -> 'garlic')."""
    tokens = [token for token in normalized.split() if len(token) >= 4]
    for term in terms:
        if " " in term or len(term) < 4:
            continue
        for token in tokens:
            if SequenceMatcher(None, token, term).ratio() >= threshold:
                return term
    return None


# Allergen synonyms so e.g. a "milk" allergy also catches lactose/whey/casein. Safety-first:
# over-flag rather than miss. Mirrored in www/ocr.js (ALLERGEN_SYNONYMS).
ALLERGEN_SYNONYMS = {
    "milk": ["milk", "lactose", "whey", "casein", "caseinate", "ghee", "buttermilk", "milkfat", "milk fat", "milk solids", "cheese", "cream", "paneer", "curd", "yogurt", "yoghurt", "custard"],
    "dairy": ["milk", "lactose", "whey", "casein", "caseinate", "ghee", "buttermilk", "cheese", "cream", "paneer", "curd", "yogurt", "yoghurt"],
    "egg": ["egg", "albumen", "albumin", "ovalbumin", "mayonnaise", "meringue"],
    "peanut": ["peanut", "groundnut", "arachis"],
    "soy": ["soy", "soya", "soybean", "edamame", "tofu", "tempeh", "miso"],
    "wheat": ["wheat", "durum", "semolina", "spelt", "farina", "atta", "maida", "bulgur"],
    "gluten": ["gluten", "wheat", "barley", "rye", "malt", "triticale", "spelt", "semolina", "durum"],
    "sesame": ["sesame", "tahini", "benne", "gingelly", "til"],
    "mustard": ["mustard"],
    "corn": ["corn", "maize", "cornstarch", "corn starch", "cornflour", "corn flour", "hominy", "polenta", "masa"],
    "coconut": ["coconut", "copra"],
    "sulfite": ["sulfite", "sulphite", "sulfur dioxide", "sulphur dioxide", "metabisulfite", "bisulfite"],
    "almond": ["almond", "marzipan"],
    "chickpea": ["chickpea", "garbanzo", "gram flour", "besan", "chana"],
    "lentil": ["lentil", "masoor", "moong", "toor", "urad"],
    "mushroom": ["mushroom", "truffle", "shiitake", "portobello"],
    "citrus": ["citrus", "lemon", "lime", "orange", "grapefruit", "tangerine"],
    "cinnamon": ["cinnamon", "cassia"],
    "tree nut": ["almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "macadamia", "brazil nut", "pine nut", "filbert"],
    "nut": ["almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "macadamia", "brazil nut", "pine nut", "peanut"],
}


def classify_ingredient(name: str, profile: Optional[DietaryProfile] = None) -> SingleResult:
    diet = profile or default_profile()
    normalized = normalize_key(name)
    allergy_hits = []
    for allergy in diet.allergies:
        key = normalize_key(allergy) if allergy else ""
        if not key:
            continue
        terms = ALLERGEN_SYNONYMS.get(key, [key, key.rstrip("s")])
        if any(term and term in normalized for term in terms):
            allergy_hits.append(allergy)

    if allergy_hits:
        # Allergens are a safety flag, NOT a Jain-diet conflict — own category/section.
        return SingleResult(
            name=name,
            category="ALLERGEN",
            reason=f"Contains an allergen/restriction you listed: {', '.join(allergy_hits)}.",
            is_veg=None,
            is_vegan=None,
        )

    blockers: List[str] = []
    if diet.avoid_meat and has_term(normalized, MEAT_TERMS):
        blockers.append("meat or seafood")
    if diet.avoid_eggs and has_term(normalized, EGG_TERMS):
        blockers.append("egg")
    if diet.avoid_root_vegetables and has_term(normalized, ROOT_TERMS):
        blockers.append("root vegetable")
    elif diet.avoid_onion_garlic and has_term(normalized, ONION_GARLIC_TERMS):
        blockers.append("onion or garlic")
    if diet.avoid_honey and has_term(normalized, HONEY_TERMS):
        blockers.append("honey")
    if diet.avoid_animal_byproducts and has_term(normalized, ANIMAL_BYPRODUCT_TERMS):
        blockers.append("animal-derived ingredient")
    if diet.vegan and has_term(normalized, DAIRY_TERMS | HONEY_TERMS | EGG_TERMS | ANIMAL_BYPRODUCT_TERMS):
        blockers.append("not vegan")
    if diet.avoid_artificial_additives and has_term(normalized, ARTIFICIAL_ADDITIVE_TERMS):
        blockers.append("artificial color/flavor additive")

    if blockers:
        return SingleResult(
            name=name,
            category="NON_JAIN",
            reason=f"Not allowed by your diet profile: {', '.join(dict.fromkeys(blockers))}.",
            is_veg=not has_term(normalized, MEAT_TERMS | EGG_TERMS),
            is_vegan=not has_term(normalized, DAIRY_TERMS | HONEY_TERMS | EGG_TERMS | ANIMAL_BYPRODUCT_TERMS),
        )

    if has_term(normalized, NON_JAIN_TERMS):
        return SingleResult(
            name=name,
            category="JAIN",
            reason="Allowed by your current diet profile.",
            is_veg=not has_term(normalized, MEAT_TERMS | EGG_TERMS),
            is_vegan=not has_term(normalized, DAIRY_TERMS | HONEY_TERMS | EGG_TERMS | ANIMAL_BYPRODUCT_TERMS),
        )

    ambiguous_hit = ambiguous_reason(normalized)
    if ambiguous_hit:
        return SingleResult(
            name=name,
            category="UNCERTAIN",
            reason=ambiguous_hit,
        )

    if has_term(normalized, ARTIFICIAL_ADDITIVE_TERMS) or normalized in JAIN_SAFE_TERMS or any(pattern in normalized for pattern in LIKELY_SAFE_PATTERNS):
        return SingleResult(
            name=name,
            category="JAIN",
            reason="Allowed by your current diet profile.",
            is_veg=not has_term(normalized, MEAT_TERMS | EGG_TERMS),
            is_vegan=not has_term(normalized, DAIRY_TERMS | HONEY_TERMS | EGG_TERMS | ANIMAL_BYPRODUCT_TERMS),
        )

    fuzzy_blockers: Dict[str, set[str]] = {}
    if diet.avoid_meat:
        fuzzy_blockers["meat or seafood"] = MEAT_TERMS
    if diet.avoid_eggs:
        fuzzy_blockers["egg"] = EGG_TERMS
    if diet.avoid_root_vegetables:
        fuzzy_blockers["root vegetable"] = ROOT_TERMS
    elif diet.avoid_onion_garlic:
        fuzzy_blockers["onion or garlic"] = ONION_GARLIC_TERMS
    if diet.avoid_honey:
        fuzzy_blockers["honey"] = HONEY_TERMS
    if diet.avoid_animal_byproducts:
        fuzzy_blockers["animal-derived ingredient"] = ANIMAL_BYPRODUCT_TERMS
    for label, terms in fuzzy_blockers.items():
        hit = fuzzy_term_hit(normalized, terms)
        if hit:
            return SingleResult(
                name=name,
                category="UNCERTAIN",
                reason=f"Possible '{hit}' ({label}) detected from an unclear scan. Re-scan or confirm before trusting this.",
            )

    return SingleResult(
        name=name,
        category="UNCERTAIN",
        reason="We don't have a rule for this specific ingredient — treat it as possibly non-Jain if you want to be cautious.",
    )


def sort_results(items: List[SingleResult]) -> Dict[str, List[Dict]]:
    grouped = {
        "allergen_ingredients": [],
        "non_jain_ingredients": [],
        "uncertain_ingredients": [],
        "jain_ingredients": [],
    }
    for item in items:
        payload = item.model_dump()
        if item.category == "ALLERGEN":
            grouped["allergen_ingredients"].append(payload)
        elif item.category == "NON_JAIN":
            grouped["non_jain_ingredients"].append(payload)
        elif item.category == "JAIN":
            grouped["jain_ingredients"].append(payload)
        else:
            grouped["uncertain_ingredients"].append(payload)
    return grouped


def build_scan_response(
    grouped: Dict[str, List[Dict]],
    ingredient_count: int,
    *,
    ocr_quality: str,
    ocr_text: str,
    from_cache: bool,
    profile: Optional[DietaryProfile] = None,
    message_override: Optional[str] = None,
    demo: bool = False,
) -> Dict:
    allergen_count = len(grouped.get("allergen_ingredients", []))
    non_jain_count = len(grouped["non_jain_ingredients"])
    uncertain_count = len(grouped["uncertain_ingredients"])
    jain_count = len(grouped["jain_ingredients"])

    if ingredient_count == 0:
        status = "UNCERTAIN"
        message = message_override or "We could not clearly read the ingredient list."
    elif allergen_count:
        status = "ALLERGEN"
        allergens = f"{allergen_count} ingredient{'s' if allergen_count != 1 else ''} you're allergic to"
        if non_jain_count:
            message = message_override or f"Contains {allergens}, plus {non_jain_count} that {'are' if non_jain_count != 1 else 'is'}n't Jain."
        else:
            message = message_override or f"Contains {allergens}."
    elif non_jain_count:
        status = "NON_JAIN"
        message = message_override or f"{non_jain_count} ingredient{'s' if non_jain_count != 1 else ''} conflict with your diet profile."
    elif uncertain_count:
        status = "UNCERTAIN"
        message = message_override or f"{uncertain_count} ingredient{'s' if uncertain_count != 1 else ''} need manual review."
    else:
        status = "JAIN"
        message = message_override or f"All {jain_count} detected ingredients fit your diet profile."

    return {
        "summary": {
            "is_safe": ingredient_count > 0 and allergen_count == 0 and non_jain_count == 0 and uncertain_count == 0,
            "status": status,
            "message": message,
            "community_knowledge_applied": False,
            "ocr_quality": ocr_quality,
            "scanned_ingredient_count": ingredient_count,
            "profile_label": (profile or default_profile()).label,
        },
        **grouped,
        "ocr_text": ocr_text,
        "timestamp": datetime.now().isoformat(),
        "from_cache": from_cache,
        "demo": demo,
        "cache_schema_version": CACHE_SCHEMA_VERSION,
        "diet_profile": (profile or default_profile()).model_dump(),
    }


def check_rate_limit(client_ip: str) -> bool:
    now = datetime.now()
    timestamps = user_requests.setdefault(client_ip, [])
    user_requests[client_ip] = [stamp for stamp in timestamps if now - stamp < timedelta(minutes=1)]
    if len(user_requests[client_ip]) >= RATE_LIMIT_PER_MINUTE:
        return False
    user_requests[client_ip].append(now)
    return True


def image_hash(content: bytes) -> str:
    return hashlib.md5(content).hexdigest()


class VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hidden_depth = 0
        self.parts: List[str] = []
        self.links: List[Tuple[str, str]] = []
        self._current_href: Optional[str] = None
        self._current_link_text: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self.hidden_depth += 1
        attr_map = {key.lower(): value or "" for key, value in attrs}
        if tag == "a" and attr_map.get("href"):
            self._current_href = attr_map["href"]
            self._current_link_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self.hidden_depth:
            self.hidden_depth -= 1
        if tag == "a" and self._current_href:
            text = normalize_name(" ".join(self._current_link_text))
            self.links.append((text, self._current_href))
            self._current_href = None
            self._current_link_text = []
        if tag in {"p", "div", "li", "br", "section", "article", "h1", "h2", "h3", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.hidden_depth:
            return
        text = html.unescape(data)
        if normalize_name(text):
            self.parts.append(text)
            if self._current_href:
                self._current_link_text.append(text)

    def get_text(self) -> str:
        return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", " ".join(self.parts)))


def http_json(url: str, *, method: str = "GET", body: Optional[str] = None, headers: Optional[Dict[str, str]] = None, timeout: Optional[int] = None) -> Any:
    data = body.encode("utf-8") if body is not None else None
    request_headers = {
        "User-Agent": "ButIsItJain/1.0 food finder",
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    }
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(url, data=data, method=method, headers=request_headers)
    with urllib.request.urlopen(request, timeout=timeout or HTTP_TIMEOUT_SECONDS) as response:
        return json.loads(response.read(MAX_WEB_BYTES).decode("utf-8", errors="ignore"))


def http_page(url: str, *, timeout: Optional[int] = None) -> Tuple[str, List[Tuple[str, str]], str]:
    try:
        validate_public_url(url)
    except ValueError:
        raise ValueError("Unsafe remote URL") from None
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout or HTTP_TIMEOUT_SECONDS) as response:
            content_type = response.headers.get("Content-Type", "")
            if "text/html" not in content_type and "text/plain" not in content_type:
                return "", [], ""
            raw = response.read(MAX_WEB_BYTES).decode("utf-8", errors="ignore")
    except Exception:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme == "http":
            return http_page(urllib.parse.urlunparse(parsed._replace(scheme="https")))
        raise
    parser = VisibleTextParser()
    parser.feed(raw)
    return parser.get_text(), parser.links, raw


def http_html(url: str) -> Tuple[str, List[Tuple[str, str]]]:
    text, links, _ = http_page(url)
    return text, links


def distance_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371000
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def resolve_location(request: FoodFinderRequest) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    if request.latitude is not None and request.longitude is not None:
        return request.latitude, request.longitude, None
    location_text = normalize_name(request.location_text or "")
    if not location_text:
        return None, None, "Location is required."

    if GOOGLE_PLACES_API_KEY:
        query = urllib.parse.urlencode({"address": location_text, "key": GOOGLE_PLACES_API_KEY})
        data = http_json(f"https://maps.googleapis.com/maps/api/geocode/json?{query}")
        results = data.get("results") or []
        if results:
            loc = results[0].get("geometry", {}).get("location", {})
            return float(loc["lat"]), float(loc["lng"]), None

    if GEOAPIFY_API_KEY:
        query = urllib.parse.urlencode({"text": location_text, "limit": "1", "apiKey": GEOAPIFY_API_KEY})
        data = http_json(f"https://api.geoapify.com/v1/geocode/search?{query}")
        features = data.get("features") or []
        if features:
            props = features[0].get("properties") or {}
            return float(props["lat"]), float(props["lon"]), None

    fallback = nominatim_lookup(location_text, 1)
    if fallback:
        return float(fallback[0]["latitude"]), float(fallback[0]["longitude"]), None
    return None, None, "Could not resolve that location."

def osm_headers() -> Dict[str, str]:
    return {"User-Agent": OSM_USER_AGENT, "Accept": "application/json"}


def nominatim_lookup(text: str, limit: int = 5) -> List[Dict[str, Any]]:
    global last_nominatim_request_at
    query_text = normalize_name(text)
    if len(query_text) < 3:
        return []
    key = f"{query_text.lower()}|{limit}"
    cached = geocode_cache.get(key)
    if cached and time.time() - cached[0] < NOMINATIM_CACHE_TTL_SECONDS:
        return cached[1]
    with nominatim_lock:
        wait = 1.05 - (time.time() - last_nominatim_request_at)
        if wait > 0:
            time.sleep(wait)
        params = urllib.parse.urlencode({"format": "jsonv2", "limit": str(limit), "q": query_text, "addressdetails": "1"})
        data = http_json(f"https://nominatim.openstreetmap.org/search?{params}", headers=osm_headers())
        last_nominatim_request_at = time.time()
    out: List[Dict[str, Any]] = []
    if isinstance(data, list):
        for index, item in enumerate(data[:limit]):
            try:
                lat = float(item["lat"])
                lon = float(item["lon"])
            except (KeyError, ValueError, TypeError):
                continue
            out.append({
                "id": str(item.get("osm_id") or f"nominatim-{index}"),
                "label": item.get("display_name") or query_text,
                "latitude": lat,
                "longitude": lon,
                "provider": "nominatim",
                "cached": False,
            })
    geocode_cache[key] = (time.time(), out)
    return out


def miles_to_meters(value: float) -> int:
    try:
        miles = float(value)
    except (TypeError, ValueError):
        miles = 5
    return max(1000, min(16094, int(miles * 1609.344)))


def osm_dietary_tags(tags: Dict[str, str]) -> List[str]:
    values: List[str] = []
    for key in ("diet:vegetarian", "diet:vegan", "diet:jain", "diet:halal", "diet:kosher", "diet:gluten_free"):
        value = normalize_key(str(tags.get(key, "")))
        if value in {"yes", "only", "limited"}:
            values.append(f"{key.replace('diet:', '').replace('_', ' ')}: {value}")
    if tags.get("cuisine"):
        values.append(f"cuisine: {normalize_name(tags.get('cuisine'))}")
    return values[:12]


def normalize_osm_restaurant(item: Dict[str, Any], origin_lat: float, origin_lng: float) -> Optional[Dict[str, Any]]:
    tags = item.get("tags") or {}
    name = normalize_name(tags.get("name") or tags.get("brand") or "")
    place_lat = item.get("lat") or (item.get("center") or {}).get("lat")
    place_lng = item.get("lon") or (item.get("center") or {}).get("lon")
    if not name or place_lat is None or place_lng is None:
        return None
    try:
        lat = float(place_lat)
        lng = float(place_lng)
    except (TypeError, ValueError):
        return None
    website = tags.get("website") or tags.get("contact:website") or tags.get("menu") or ""
    if website and website.startswith("http://"):
        website = ""
    if website and not website.startswith("https://"):
        website = f"https://{website}" if "." in website and "/" not in website[:8] else ""
    address = tags.get("addr:full") or ", ".join(filter(None, [tags.get("addr:housenumber"), tags.get("addr:street"), tags.get("addr:city"), tags.get("addr:postcode")]))
    osm_type = item.get("type") or "node"
    osm_id = str(item.get("id") or "")
    return {
        "id": f"osm:{osm_type}:{osm_id}",
        "provider": "openstreetmap",
        "providerEntityType": str(osm_type),
        "providerEntityId": osm_id,
        "name": name,
        "brand": normalize_name(tags.get("brand") or ""),
        "coordinates": {"latitude": lat, "longitude": lng},
        "address": address,
        "distanceMiles": round(distance_meters(origin_lat, origin_lng, lat, lng) / 1609.344, 2),
        "cuisine": normalize_name(tags.get("cuisine") or tags.get("amenity") or ""),
        "website": website,
        "phone": normalize_name(tags.get("phone") or tags.get("contact:phone") or ""),
        "openingHours": normalize_name(tags.get("opening_hours") or ""),
        "dietaryTags": osm_dietary_tags(tags),
        "menuAvailable": bool(website or tags.get("menu")),
        "openStatus": "unknown",
        "discoveredAt": datetime.now().isoformat(),
        "providerMetadata": {"osmTags": {k: tags.get(k) for k in tags if k.startswith("diet:") or k in {"cuisine", "amenity", "menu"}}, "evidenceWarning": "OpenStreetMap dietary tags are weak metadata and not a ROOTS compatibility verdict."},
    }

def restaurant_discovery_cache_key(lat: float, lng: float, radius_meters: int) -> str:
    return f"{round(lat, 4)}|{round(lng, 4)}|{int(radius_meters)}"


def get_cached_restaurant_discovery(lat: float, lng: float, radius_meters: int) -> Optional[Tuple[List[Dict[str, Any]], int]]:
    cached = restaurant_discovery_cache.get(restaurant_discovery_cache_key(lat, lng, radius_meters))
    if not cached:
        return None
    cached_at, restaurants, cached_radius = cached
    if time.time() - cached_at > RESTAURANT_DISCOVERY_CACHE_TTL_SECONDS:
        return None
    return [dict(item) for item in restaurants], cached_radius


def set_cached_restaurant_discovery(lat: float, lng: float, radius_meters: int, restaurants: List[Dict[str, Any]], actual_radius: int) -> None:
    restaurant_discovery_cache[restaurant_discovery_cache_key(lat, lng, radius_meters)] = (time.time(), [dict(item) for item in restaurants], actual_radius)

def overpass_restaurant_discovery(lat: float, lng: float, radius_meters: int) -> List[Dict[str, Any]]:
    query = f"""
        [out:json][timeout:18];
        (
          node(around:{radius_meters},{lat},{lng})["amenity"~"restaurant|cafe|fast_food|food_court"];
          way(around:{radius_meters},{lat},{lng})["amenity"~"restaurant|cafe|fast_food|food_court"];
          relation(around:{radius_meters},{lat},{lng})["amenity"~"restaurant|cafe|fast_food|food_court"];
        );
        out center tags 60;
    """
    data = http_json(f"https://overpass-api.de/api/interpreter?{urllib.parse.urlencode({'data': query})}", headers=osm_headers(), timeout=OVERPASS_TIMEOUT_SECONDS)
    if not isinstance(data, dict):
        return []
    restaurants = [normalize_osm_restaurant(item, lat, lng) for item in data.get("elements", [])]
    unique: Dict[str, Dict[str, Any]] = {}
    for item in restaurants:
        if item and item["id"] not in unique:
            unique[item["id"]] = item
    return sorted(unique.values(), key=lambda place: place.get("distanceMiles") if place.get("distanceMiles") is not None else 10**9)

def build_place_query(request: FoodFinderRequest) -> str:
    parts = []
    if request.cuisine and request.cuisine != "any":
        parts.append(request.cuisine)
    if request.meal and request.meal not in {"any", "groceries"}:
        parts.append(request.meal)
    if request.kind == "stores" or request.meal == "groceries":
        parts.append("grocery store prepared food")
    else:
        parts.append("restaurant")
    if request.diet_profile.avoid_meat:
        parts.append("vegetarian")
    return " ".join(part for part in parts if part)


def google_places_search(request: FoodFinderRequest, lat: float, lng: float, radius: int = FINDER_RADIUS_METERS) -> List[Dict]:
    if not GOOGLE_PLACES_API_KEY:
        return []
    place_type = "store" if request.kind == "stores" or request.meal == "groceries" else "restaurant"
    params = {
        "query": build_place_query(request),
        "location": f"{lat},{lng}",
        "radius": str(radius),
        "type": place_type,
        "key": GOOGLE_PLACES_API_KEY,
    }
    data = http_json(f"https://maps.googleapis.com/maps/api/place/textsearch/json?{urllib.parse.urlencode(params)}")
    places: List[Dict] = []
    for item in (data.get("results") or [])[:16]:
        place_id = item.get("place_id")
        details = {}
        if place_id:
            detail_params = {
                "place_id": place_id,
                "fields": "name,formatted_address,website,url,geometry,business_status,types,rating,user_ratings_total,price_level",
                "key": GOOGLE_PLACES_API_KEY,
            }
            details = (http_json(f"https://maps.googleapis.com/maps/api/place/details/json?{urllib.parse.urlencode(detail_params)}").get("result") or {})
        location = (details.get("geometry") or item.get("geometry") or {}).get("location", {})
        places.append({
            "name": details.get("name") or item.get("name", "Unknown place"),
            "address": details.get("formatted_address") or item.get("formatted_address"),
            "website": details.get("website"),
            "maps_url": details.get("url"),
            "provider": "google_places",
            "lat": location.get("lat"),
            "lng": location.get("lng"),
            "types": details.get("types") or item.get("types") or [],
            "rating": details.get("rating") or item.get("rating"),
            "user_ratings_total": details.get("user_ratings_total") or item.get("user_ratings_total"),
            "distance": distance_meters(lat, lng, float(location["lat"]), float(location["lng"])) if location.get("lat") and location.get("lng") else None,
        })
    return sorted(places, key=lambda place: place.get("distance") if place.get("distance") is not None else 10**9)


def geoapify_categories(request: FoodFinderRequest) -> str:
    if request.kind == "stores" or request.meal == "groceries":
        return "commercial.supermarket,commercial.food_and_drink,commercial.health_and_beauty.health_food"
    return "catering.restaurant,catering.cafe,catering.fast_food"


def geoapify_places_search(request: FoodFinderRequest, lat: float, lng: float, radius: int = FINDER_RADIUS_METERS) -> List[Dict]:
    if not GEOAPIFY_API_KEY:
        return []
    params = {
        "categories": geoapify_categories(request),
        "filter": f"circle:{lng},{lat},{radius}",
        "bias": f"proximity:{lng},{lat}",
        "limit": "60",
        "lang": "en",
        "apiKey": GEOAPIFY_API_KEY,
    }
    data = http_json(f"https://api.geoapify.com/v2/places?{urllib.parse.urlencode(params)}")
    places: List[Dict] = []
    for feature in data.get("features", []):
        props = feature.get("properties") or {}
        name = props.get("name")
        if not name:
            continue
        raw = props.get("datasource", {}).get("raw", {}) if isinstance(props.get("datasource"), dict) else {}
        website = props.get("website") or raw.get("website") or raw.get("contact:website") or raw.get("menu")
        place_lat = props.get("lat")
        place_lng = props.get("lon")
        places.append({
            "name": name,
            "address": props.get("formatted") or props.get("address_line2") or props.get("address_line1"),
            "website": website,
            "maps_url": None,
            "provider": "geoapify",
            "lat": place_lat,
            "lng": place_lng,
            "types": list(filter(None, [
                *(props.get("categories") or []),
                raw.get("cuisine"),
                raw.get("amenity"),
                raw.get("shop"),
            ])),
            "rating": None,
            "user_ratings_total": None,
            "distance": props.get("distance") if isinstance(props.get("distance"), (int, float)) else (
                distance_meters(lat, lng, float(place_lat), float(place_lng)) if place_lat and place_lng else None
            ),
        })
    return sorted(places, key=lambda place: place.get("distance") if place.get("distance") is not None else 10**9)


def overpass_places_search(request: FoodFinderRequest, lat: float, lng: float, radius: int = FINDER_RADIUS_METERS) -> List[Dict]:
    if request.kind == "stores" or request.meal == "groceries":
        selector = '["shop"~"supermarket|convenience|health_food|greengrocer|deli|department_store"]'
        extra = 'node(around:{radius},{lat},{lng})["amenity"="marketplace"];way(around:{radius},{lat},{lng})["amenity"="marketplace"];'
    else:
        selector = '["amenity"~"restaurant|cafe|fast_food"]'
        extra = ""
    query = f"""
        [out:json][timeout:18];
        (
          node(around:{radius},{lat},{lng}){selector};
          way(around:{radius},{lat},{lng}){selector};
          {extra.format(radius=radius, lat=lat, lng=lng)}
        );
        out center tags 20;
    """
    data = http_json("https://overpass-api.de/api/interpreter", method="POST", body=f"data={urllib.parse.quote(query)}")
    places = []
    for item in data.get("elements", []):
        tags = item.get("tags", {})
        name = tags.get("name") or tags.get("brand")
        if not name:
            continue
        place_lat = item.get("lat") or (item.get("center") or {}).get("lat")
        place_lng = item.get("lon") or (item.get("center") or {}).get("lon")
        if place_lat is None or place_lng is None:
            continue
        website = tags.get("website") or tags.get("contact:website") or tags.get("menu")
        places.append({
            "name": name,
            "address": tags.get("addr:full") or ", ".join(filter(None, [tags.get("addr:housenumber"), tags.get("addr:street"), tags.get("addr:city")])),
            "website": website,
            "maps_url": None,
            "provider": "openstreetmap",
            "lat": float(place_lat),
            "lng": float(place_lng),
            "types": [tags.get("cuisine") or tags.get("shop") or tags.get("amenity") or ""],
            "rating": None,
            "user_ratings_total": None,
            "distance": distance_meters(lat, lng, float(place_lat), float(place_lng)),
        })
    return sorted(places, key=lambda place: place.get("distance", 0))[:16]


MENU_LINK_TERMS = ("menu", "order", "food", "breakfast", "lunch", "dinner", "snack", "catering", "toasttab", "clover", "doordash", "ubereats", "grubhub", "chownow", "popmenu", "bentobox", "square", "olo")
MENU_PLATFORM_TERMS = ("toasttab", "clover", "doordash", "ubereats", "grubhub", "chownow", "popmenu", "bentobox", "squareup", "order.online", "olo.com")
MENU_BAD_LINK_TERMS = ("facebook", "instagram", "twitter", "tiktok", "linkedin", "privacy", "terms", "careers", "jobs", "gift", "contact", "reservation")
COMMON_MENU_PATHS = ("/menu", "/menus", "/food-menu", "/restaurant-menu", "/dine-in-menu", "/takeout-menu", "/order", "/order-online", "/online-ordering", "/delivery", "/takeout", "/catering")
MENU_NOISE_TERMS = {
    "privacy", "terms", "copyright", "facebook", "instagram", "twitter", "login", "sign up",
    "home", "about", "contact", "hours", "location", "delivery", "pickup", "reservation",
    "craving", "gift card", "careers", "franchise",
}
MENU_FOOD_HINTS = {
    "rice", "dal", "paneer", "dosa", "idli", "sambar", "roti", "naan", "biryani", "curry",
    "pizza", "pasta", "salad", "bowl", "wrap", "falafel", "hummus", "tofu", "beans", "fruit",
    "oatmeal", "yogurt", "sandwich", "taco", "burrito", "soup", "fries", "khichdi", "dhokla",
}
GENERIC_MENU_ITEM_TERMS = {
    "beans", "bread", "fruit", "pasta", "rice", "salad", "sauce", "soup", "yogurt",
}
HIDDEN_ONION_GARLIC_RISK_TERMS = {
    "biryani", "broth", "chana", "chole", "curry", "gravy", "korma", "masala",
    "noodle", "pav bhaji", "pho", "ramen", "sambar", "sauce", "soup", "stew",
    "tikka", "vindaloo",
}
BREAKFAST_HINTS = {"bagel", "cereal", "dosa", "idli", "oatmeal", "pancake", "paratha", "toast", "waffle", "yogurt"}
SNACK_HINTS = {"chaat", "chips", "dhokla", "fruit", "khakhra", "nuts", "samosa", "snack"}
DINNER_HINTS = {"bowl", "curry", "dal", "dosa", "pasta", "pizza", "rice", "sabzi", "thali"}

CUISINE_MATCH_TERMS = {
    "indian": {
        "indian", "biryani", "chaat", "chana", "chole", "curry", "dal", "dosa",
        "idli", "masala", "naan", "paneer", "roti", "sambar", "thali",
    },
    "south indian": {
        "south indian", "dosa", "idli", "uttapam", "sambar", "rasam", "vada",
        "medu", "masala dosa",
    },
    "gujarati": {
        "gujarati", "dhokla", "fafda", "handvo", "khakhra", "khandvi", "thepla",
        "undhiyu",
    },
    "mexican": {
        "mexican", "burrito", "chipotle", "enchilada", "fajita", "guacamole",
        "quesadilla", "salsa", "taco", "taqueria", "tortilla",
    },
    "italian": {
        "italian", "alfredo", "bruschetta", "calzone", "gnocchi", "lasagna",
        "marinara", "pasta", "pesto", "pizza", "ravioli", "risotto", "spaghetti",
        "trattoria",
    },
    "thai": {
        "thai", "curry", "pad thai", "panang", "satay", "tom kha", "tom yum",
        "green curry", "red curry",
    },
    "mediterranean": {
        "mediterranean", "falafel", "feta", "gyro", "hummus", "kebab", "pita",
        "shawarma", "tabbouleh", "tzatziki",
    },
    "middle eastern": {
        "middle eastern", "falafel", "hummus", "kebab", "kofta", "lavash", "pita",
        "shawarma", "tabbouleh", "zaatar",
    },
}

CUISINE_IDENTITY_TERMS = {
    "indian": {"indian"},
    "south indian": {"south indian"},
    "gujarati": {"gujarati"},
    "mexican": {"mexican", "taqueria", "tex mex", "chipotle"},
    "italian": {"italian", "trattoria", "osteria", "pizzeria"},
    "thai": {"thai"},
    "mediterranean": {"mediterranean"},
    "middle eastern": {"middle eastern"},
}


def resolve_link(base_url: str, href: str) -> str:
    return urllib.parse.urljoin(base_url, href)


def menu_url_score(url: str, link_text: str = "") -> int:
    combined = normalize_key(f"{link_text} {url}")
    if any(term in combined for term in MENU_BAD_LINK_TERMS):
        return -100
    score = 0
    if any(term in combined for term in MENU_PLATFORM_TERMS):
        score += 60
    if "menu" in combined:
        score += 45
    if any(term in combined for term in {"order", "online ordering", "food", "takeout", "delivery"}):
        score += 25
    if any(term in combined for term in {"breakfast", "lunch", "dinner", "catering"}):
        score += 12
    return score


def candidate_menu_urls(website: str, links: List[Tuple[str, str]]) -> List[str]:
    candidates: Dict[str, int] = {website: 5}
    for path in COMMON_MENU_PATHS:
        resolved = resolve_link(website, path)
        if resolved.startswith(("http://", "https://")):
            candidates[resolved] = max(candidates.get(resolved, 0), menu_url_score(resolved, path))
    for text, href in links:
        combined = normalize_key(f"{text} {href}")
        score = menu_url_score(href, text)
        if score > 0 or any(term in combined for term in MENU_LINK_TERMS):
            resolved = resolve_link(website, href)
            if resolved.startswith(("http://", "https://")):
                candidates[resolved] = max(candidates.get(resolved, 0), score)
    ranked = sorted(candidates.items(), key=lambda item: (-item[1], len(item[0])))
    return [url for url, score in ranked if score > -100][:6]


def find_doordash_store_urls(base_url: str, links: List[Tuple[str, str]], raw_html: str = "") -> List[str]:
    urls: List[str] = []
    candidates = [href for _, href in links]
    candidates.extend(re.findall(r"https?://(?:www\.)?doordash\.com/store/[^\"'<>\\\s]+", raw_html))
    for href in candidates:
        resolved = resolve_link(base_url, href)
        if "doordash.com/store/" not in resolved:
            continue
        cleaned = re.sub(r"[?#].*$", "", resolved).rstrip("/") + "/"
        if cleaned.startswith(("http://", "https://")) and cleaned not in urls:
            urls.append(cleaned)
    return urls[:3]


def direct_doordash_menu(store_url: str) -> Tuple[List[str], Optional[str]]:
    try:
        text, _, raw_html = http_page(store_url)
    except Exception as exc:
        logger.info("Direct DoorDash fetch failed for %s: %s", store_url, exc)
        return [], None

    items = extract_menu_items_from_html(raw_html, text)
    if not items:
        # DoorDash often stores menu data in escaped JavaScript payloads.
        decoded = html.unescape(raw_html).replace("\\u0022", '"').replace("\\u0026", "&")
        items = extract_embedded_menu_strings(decoded)
    return dedupe_preserve_order(items)[:100], store_url


def fetch_doordash_menu_from_links(base_url: str, links: List[Tuple[str, str]], raw_html: str = "") -> Tuple[List[str], Optional[str]]:
    for store_url in find_doordash_store_urls(base_url, links, raw_html):
        items, source_url = direct_doordash_menu(store_url)
        if items:
            return items, source_url
    return [], None


def looks_like_menu_item(line: str) -> bool:
    text = normalize_name(line)
    normalized = normalize_key(text)
    if len(text) < 4 or len(text) > 90:
        return False
    if any(marker in text.lower() for marker in {"<br", "{store", "download", "app!"}):
        return False
    if any(term in normalized for term in MENU_NOISE_TERMS):
        return False
    if re.fullmatch(r"[$\d\s.,]+", text):
        return False
    if len(normalized.split()) > 10:
        return False
    has_price = bool(re.search(r"\$\s*\d|\d+\.\d{2}", text))
    has_food_hint = text_has_cuisine_match(normalized, MENU_FOOD_HINTS | NON_JAIN_TERMS | JAIN_SAFE_TERMS)
    if re.search(r"\b(best|awarded|featured|foundation|gift|shop|store|class|event|reservation|delivery|pickup|served with choice|craving|visit us|order now|near you|rewards|offers|deals|find a|take out|fast food|scan to|download app|menu in)\b", normalized):
        return False
    if re.search(r"\b(in new york|ny \d{5}|broadway|avenue|street)\b", normalized):
        return False
    return has_price or has_food_hint


def clean_menu_item_name(line: str) -> str:
    text = re.sub(r"\$\s*\d+(\.\d{2})?", "", line)
    text = re.sub(r"\b\d+\.\d{2}\b", "", text)
    text = re.sub(r"\s+", " ", text)
    return normalize_name(text)


def extract_menu_items_from_text(text: str) -> List[str]:
    lines: List[str] = []
    for raw in re.split(r"[\n\r]+| {3,}", text):
        candidate = clean_menu_item_name(raw)
        if looks_like_menu_item(candidate):
            lines.append(candidate)
    return dedupe_preserve_order(lines)[:60]


def walk_json_values(value: Any) -> List[Any]:
    values = [value]
    if isinstance(value, dict):
        for child in value.values():
            values.extend(walk_json_values(child))
    elif isinstance(value, list):
        for child in value:
            values.extend(walk_json_values(child))
    return values


def menu_names_from_json(value: Any) -> List[str]:
    names: List[str] = []
    for node in walk_json_values(value):
        if not isinstance(node, dict):
            continue
        node_type = node.get("@type") or node.get("type") or ""
        node_type_text = normalize_key(" ".join(node_type) if isinstance(node_type, list) else node_type)
        name = normalize_name(node.get("name") or node.get("title") or "")
        description = normalize_name(node.get("description") or "")
        category = normalize_name(node.get("category") or node.get("section") or node.get("menu") or "")
        combined = normalize_name(f"{name} {description}")
        if not name:
            continue
        keys = {normalize_key(key) for key in node.keys()}
        has_menu_keys = bool(keys & {"price", "price display", "calories", "dietary tags", "item id", "itemid", "menu item id"})
        is_menu_node = any(term in node_type_text for term in {"menuitem", "menu item", "dish", "product"})
        has_food_context = looks_like_menu_item(combined) or looks_like_menu_item(name) or looks_like_menu_item(category)
        if is_menu_node or has_food_context:
            names.append(name)
        elif has_menu_keys and looks_like_menu_item(f"{name} {category}"):
            names.append(name)
    return names


def extract_json_payloads(raw_html: str) -> List[Any]:
    payloads: List[Any] = []
    for match in re.finditer(
        r"<script[^>]+(?:type=[\"']application/(?:ld\+)?json[\"']|id=[\"']__NEXT_DATA__[\"'])[^>]*>(.*?)</script>",
        raw_html,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        script_text = html.unescape(match.group(1)).strip()
        if not script_text:
            continue
        try:
            payloads.append(json.loads(script_text))
        except Exception:
            continue
    return payloads


def extract_embedded_menu_strings(raw_html: str) -> List[str]:
    decoded = html.unescape(raw_html)
    names: List[str] = []
    patterns = (
        r'"(?:name|title|itemName|displayName)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"',
        r"'(?:name|title|itemName|displayName)'\s*:\s*'([^'\\]*(?:\\.[^'\\]*)*)'",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, decoded):
            try:
                candidate = bytes(match.group(1), "utf-8").decode("unicode_escape")
            except Exception:
                candidate = match.group(1)
            candidate = clean_menu_item_name(candidate)
            if looks_like_menu_item(candidate):
                names.append(candidate)
    return names


def extract_embedded_json_objects(raw_html: str) -> List[Any]:
    payloads: List[Any] = []
    decoded = html.unescape(raw_html)
    for match in re.finditer(
        r"(?:window\.__(?:INITIAL_STATE__|APOLLO_STATE__|NEXT_DATA__)|__INITIAL_STATE__)\s*=\s*({.*?})\s*(?:;</script>|;)",
        decoded,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        text = match.group(1)
        if len(text) > MAX_WEB_BYTES:
            continue
        try:
            payloads.append(json.loads(text))
        except Exception:
            continue
    return payloads


def extract_menu_items_from_html(raw_html: str, visible_text: str = "") -> List[str]:
    items: List[str] = []
    for payload in extract_json_payloads(raw_html):
        items.extend(menu_names_from_json(payload))
    for payload in extract_embedded_json_objects(raw_html):
        items.extend(menu_names_from_json(payload))
    items.extend(extract_embedded_menu_strings(raw_html))
    if visible_text:
        items.extend(extract_menu_items_from_text(visible_text))
    cleaned = [clean_menu_item_name(item) for item in items if clean_menu_item_name(item)]
    return dedupe_preserve_order(cleaned)[:80]


def requested_cuisine_terms(cuisine: Optional[str]) -> set[str]:
    normalized = normalize_key(cuisine or "")
    if not normalized or normalized == "any":
        return set()
    if normalized in CUISINE_MATCH_TERMS:
        return CUISINE_MATCH_TERMS[normalized]
    words = {word for word in normalized.split() if len(word) >= 3}
    return {normalized, *words}


def requested_cuisine_identity_terms(cuisine: Optional[str]) -> set[str]:
    normalized = normalize_key(cuisine or "")
    if not normalized or normalized == "any":
        return set()
    if normalized in CUISINE_IDENTITY_TERMS:
        return CUISINE_IDENTITY_TERMS[normalized]
    return {normalized}


def text_has_cuisine_match(text: str, terms: set[str]) -> bool:
    normalized = normalize_key(text)
    return any(re.search(rf"\b{re.escape(term)}\b", normalized) for term in terms)


def matched_cuisine_terms(text: str, terms: set[str]) -> set[str]:
    normalized = normalize_key(text)
    return {term for term in terms if re.search(rf"\b{re.escape(term)}\b", normalized)}


def place_listing_text(place: Dict) -> str:
    return " ".join([
        str(place.get("name") or ""),
        str(place.get("address") or ""),
        " ".join(str(item) for item in place.get("types") or []),
    ])


def cuisine_score_label(score: int, requested: bool) -> str:
    if not requested:
        return "Any cuisine"
    if score >= 90:
        return "Exact cuisine match"
    if score >= 70:
        return "Strong cuisine match"
    if score >= 50:
        return "Possible cuisine match"
    return "Cuisine not verified"


def score_place_cuisine(
    place: Dict,
    cuisine: Optional[str],
    menu_items: Optional[List[MenuItemResult]] = None,
    caution_items: Optional[List[MenuItemResult]] = None,
    blocked_items: Optional[List[MenuItemResult]] = None,
) -> Tuple[int, str]:
    terms = requested_cuisine_terms(cuisine)
    if not terms:
        return 100, "Any cuisine"

    normalized_cuisine = normalize_key(cuisine or "")
    identity_terms = requested_cuisine_identity_terms(cuisine)
    listing_text = place_listing_text(place)
    normalized_listing = normalize_key(listing_text)
    type_text = normalize_key(" ".join(str(item) for item in place.get("types") or []))
    name_text = normalize_key(str(place.get("name") or ""))

    if normalized_cuisine and text_has_cuisine_match(type_text, {normalized_cuisine}):
        return 100, "Cuisine tag match"
    if normalized_cuisine and text_has_cuisine_match(name_text, {normalized_cuisine}):
        return 95, "Cuisine in restaurant name"
    if text_has_cuisine_match(type_text, identity_terms):
        return 90, "Cuisine tag match"
    if text_has_cuisine_match(name_text, identity_terms):
        return 80, "Cuisine in restaurant name"
    if text_has_cuisine_match(normalized_listing, identity_terms):
        return 70, "Cuisine in restaurant listing"

    menu_items = menu_items or []
    caution_items = caution_items or []
    blocked_items = blocked_items or []
    menu_text = normalize_key(" ".join(item.name for item in [*menu_items, *caution_items, *blocked_items]))
    if normalized_cuisine and text_has_cuisine_match(menu_text, {normalized_cuisine}):
        return 65, "Cuisine found in real menu text"
    menu_matches = matched_cuisine_terms(menu_text, terms)
    if len(menu_matches) >= 3:
        return 55, "Cuisine pattern found in real menu text"

    return 0, "Cuisine not verified"


def meal_matches_item(item: str, meal: str) -> bool:
    normalized = normalize_key(item)
    if meal in {"", "any", "lunch", "groceries"}:
        return True
    if meal == "breakfast":
        return any(term in normalized for term in BREAKFAST_HINTS)
    if meal == "snack":
        return any(term in normalized for term in SNACK_HINTS | MENU_FOOD_HINTS)
    if meal == "dinner":
        return any(term in normalized for term in DINNER_HINTS | MENU_FOOD_HINTS)
    if meal == "dessert":
        return any(term in normalized for term in {"cake", "cookie", "dessert", "ice cream", "kheer", "pastry", "sweet"})
    return True


def caution_order_note(profile: DietaryProfile) -> str:
    asks = []
    if profile.avoid_root_vegetables or profile.avoid_onion_garlic:
        asks.append("no onion, garlic, or hidden root vegetables")
    if profile.avoid_eggs:
        asks.append("eggless")
    if profile.avoid_animal_byproducts:
        asks.append("no gelatin, rennet, or animal enzymes")
    if profile.vegan:
        asks.append("no dairy")
    if profile.allergies:
        asks.append("allergy-safe for " + ", ".join(profile.allergies))
    return "Ask the kitchen to confirm " + "; ".join(asks) + "." if asks else "Ask the kitchen to confirm ingredients before ordering."


def classify_menu_item(item: str, profile: DietaryProfile, source_url: str) -> MenuItemResult:
    result = classify_ingredient(item, profile)
    if result.category == "NON_JAIN":
        return MenuItemResult(name=item, status="blocked", reason=result.reason, source_url=source_url)
    if result.category == "UNCERTAIN":
        return MenuItemResult(
            name=item,
            status="caution",
            reason="Real menu item found, but ingredients are not detailed enough to fully verify.",
            source_url=source_url,
            order_note=caution_order_note(profile),
        )
    normalized = normalize_key(item)
    if (profile.avoid_root_vegetables or profile.avoid_onion_garlic) and any(term in normalized for term in HIDDEN_ONION_GARLIC_RISK_TERMS):
        return MenuItemResult(
            name=item,
            status="caution",
            reason="Likely vegetarian, but this kind of dish often contains onion, garlic, stock, or root vegetables not shown in the item name.",
            source_url=source_url,
            order_note=caution_order_note(profile),
        )
    if normalized in GENERIC_MENU_ITEM_TERMS:
        return MenuItemResult(
            name=item,
            status="caution",
            reason="A generic food term was found on the real menu/source, but it is not detailed enough to recommend by itself.",
            source_url=source_url,
            order_note=caution_order_note(profile),
        )
    if profile.avoid_root_vegetables or profile.avoid_onion_garlic:
        explicitly_safe = any(
            phrase in normalized
            for phrase in {"jain", "no onion", "no garlic", "without onion", "without garlic", "plain rice", "steamed rice"}
        )
        if not explicitly_safe:
            return MenuItemResult(
                name=item,
                status="caution",
                reason="The real menu item name does not show full ingredients, so hidden onion, garlic, stock, or root vegetables must be confirmed.",
                source_url=source_url,
                order_note=caution_order_note(profile),
            )
    return MenuItemResult(name=item, status="allowed", reason="No conflict found in the menu text.", source_url=source_url)


def classify_menu_items(
    items: List[str],
    profile: DietaryProfile,
    meal: str,
    source_url: str,
    place_name: str = "",
) -> Tuple[List[MenuItemResult], List[MenuItemResult], List[MenuItemResult]]:
    allowed: List[MenuItemResult] = []
    caution: List[MenuItemResult] = []
    blocked: List[MenuItemResult] = []
    seen: set[str] = set()
    place_key = normalize_key(place_name)
    for item in items:
        if not meal_matches_item(item, meal):
            continue
        key = normalize_key(item)
        if place_key and (key == place_key or key in place_key or place_key in key):
            continue
        if not key or key in seen:
            continue
        seen.add(key)
        classified = classify_menu_item(item, profile, source_url)
        if classified.status == "allowed":
            allowed.append(classified)
        elif classified.status == "blocked":
            blocked.append(classified)
        else:
            caution.append(classified)
    return allowed, caution, blocked


def fetch_and_filter_menu(website: Optional[str], profile: DietaryProfile, meal: str = "any", place_name: str = "") -> Tuple[str, List[MenuItemResult], List[MenuItemResult], List[MenuItemResult], Optional[str], Optional[str]]:
    if not website:
        return "unavailable", [], [], [], "No website/menu URL was found for this place.", None
    try:
        first_text, links, first_raw = http_page(website)
        urls = candidate_menu_urls(website, links)
    except Exception as exc:
        logger.info("Menu fetch failed for %s: %s", website, exc)
        first_raw = ""
        links = []
        urls = candidate_menu_urls(website, [])

    doordash_items, doordash_source_url = fetch_doordash_menu_from_links(website, links, first_raw)
    if doordash_items:
        allowed, caution, blocked = classify_menu_items(
            doordash_items,
            profile,
            meal,
            doordash_source_url or website,
            place_name,
        )
        if allowed or caution or blocked:
            return "found", allowed[:8], caution[:8], blocked[:8], None, doordash_source_url or website

    seen: set[str] = set()
    first_menu_source: Optional[str] = None
    all_items: List[Tuple[str, str]] = []
    for url in urls:
        try:
            text, _, raw_html = http_page(url)
        except Exception:
            continue
        for item in extract_menu_items_from_html(raw_html, text):
            key = normalize_key(item)
            if not key or key in seen:
                continue
            seen.add(key)
            if first_menu_source is None:
                first_menu_source = url
            all_items.append((item, url))
        if len(all_items) >= 60:
            break

    source_url = first_menu_source or website
    allowed, caution, blocked = classify_menu_items(
        [item for item, _ in all_items],
        profile,
        meal,
        source_url,
        place_name,
    )
    status = "found" if allowed or caution or blocked else "unavailable"
    note = None if status == "found" else "Free menu extraction could not read this menu. The site may use a blocked, PDF, image, or JavaScript-only menu."
    return status, allowed[:8], caution[:8], blocked[:8], note, first_menu_source


def classify_direct_doordash_url(doordash_url: Optional[str], profile: DietaryProfile, meal: str = "any") -> Tuple[str, List[MenuItemResult], List[MenuItemResult], List[MenuItemResult], Optional[str], Optional[str]]:
    url = normalize_name(doordash_url or "")
    if not url or "doordash.com/store/" not in url:
        return "unavailable", [], [], [], "No DoorDash store URL was provided.", None
    items, source_url = direct_doordash_menu(url)
    if not items:
        return "unavailable", [], [], [], "Free DoorDash extraction could not read this page. DoorDash may require JavaScript or block automated access.", source_url or url
    allowed, caution, blocked = classify_menu_items(items, profile, meal, source_url or url)
    status = "found" if allowed or caution or blocked else "unavailable"
    note = None if status == "found" else "DoorDash page loaded, but no menu items matched this meal/profile."
    return status, allowed[:8], caution[:8], blocked[:8], note, source_url or url


# Curated Jain dining knowledge. Each "safe bet" is a dish that is commonly
# available Jain-style or easily adapted; the tag marks an inherent ingredient
# so we can hide it for vegans, root-vegetable avoiders, etc.
# Tags: "dairy", "egg", "root", or "" (none).
JAIN_DINING_GUIDE: Dict[str, Dict[str, Any]] = {
    "indian": {
        "tip": "Indian kitchens are the most Jain-friendly — most will cook 'Jain-style' (no onion, garlic, ginger, potato) if you ask.",
        "safe_bets": [
            ("Plain or jeera (cumin) rice", "Ask for no onion-garlic tadka", ""),
            ("Dal / lentil curry, Jain-style", "Request no onion, garlic, or ginger", ""),
            ("Plain roti, chapati, or paratha", "Plain, unstuffed; some breads use milk", ""),
            ("Paneer butter masala / palak paneer, Jain", "Most places make the gravy Jain-style on request", "dairy"),
            ("Vegetable curry (bhindi, cabbage, peas)", "Ask Jain-style, no onion-garlic base", ""),
        ],
        "watch_for": [
            "Onion, garlic, and ginger are in almost every curry base unless you ask for Jain-style",
            "Potato (aloo) hides in samosa, many sabzis, and chaat",
            "Naan and some breads can contain egg, milk, or yogurt",
        ],
    },
    "south indian": {
        "tip": "South Indian is a great option — dosa, idli, and rice dishes are usually eggless and easy to make Jain-style.",
        "safe_bets": [
            ("Plain dosa or masala dosa (no-onion filling)", "Ask for potato-free or plain if you avoid root veg", "root"),
            ("Idli with sambar and coconut chutney", "Ask for Jain sambar, no onion-garlic", ""),
            ("Uttapam (tomato, no onion)", "Request without onion topping", ""),
            ("Lemon rice / coconut rice", "Usually no onion-garlic; confirm tempering", ""),
            ("Plain rice with rasam", "Ask Jain rasam, no garlic", ""),
        ],
        "watch_for": [
            "Sambar and chutneys often include onion, garlic, or asafoetida",
            "Masala dosa filling is potato-based",
            "Curry leaves tempering sometimes includes garlic",
        ],
    },
    "gujarati": {
        "tip": "Gujarati thali food is largely vegetarian and often onion-garlic-free by default — one of the safest cuisines.",
        "safe_bets": [
            ("Dhokla / khaman", "Steamed gram-flour cake, usually Jain", ""),
            ("Khichdi (plain)", "Rice and lentils; ask no onion-garlic", ""),
            ("Thepla (plain or methi)", "Flatbread; usually no root veg", ""),
            ("Gujarati dal / kadhi", "Often onion-garlic-free; kadhi is dairy", "dairy"),
            ("Rotli with shaak (above-ground veg)", "Ask Jain shaak, no potato", ""),
        ],
        "watch_for": [
            "Some shaaks (sabzis) use potato or yam",
            "Kadhi and shrikhand are dairy-based",
            "A few snacks add a pinch of asafoetida or garlic",
        ],
    },
    "italian": {
        "tip": "Stick to tomato (marinara) sauces and confirm no garlic; ask about egg in fresh pasta and rennet in cheese.",
        "safe_bets": [
            ("Margherita / marinara pizza, no garlic", "Ask for no garlic in sauce; light cheese", "dairy"),
            ("Pasta pomodoro (tomato-basil)", "Request no onion-garlic in the sauce", ""),
            ("Penne arrabbiata, garlic-free", "Ask kitchen to skip garlic", ""),
            ("Bruschetta (tomato, no garlic)", "Request no garlic rub on the bread", ""),
            ("Risotto, vegetable", "Ask vegetable (not chicken) stock, no onion", "dairy"),
        ],
        "watch_for": [
            "Most pasta sauces start with onion and garlic",
            "Fresh/egg pasta and many desserts contain egg",
            "Parmesan and several Italian cheeses use animal rennet",
            "Risotto and soups are often made with chicken stock",
        ],
    },
    "mexican": {
        "tip": "Build a plate from rice, beans, and tortillas — but check beans for lard and ask to skip onion/garlic.",
        "safe_bets": [
            ("Cheese quesadilla, no onion", "Flour or corn tortilla with cheese", "dairy"),
            ("Bean and rice burrito/bowl", "Ask for whole (not refried) beans, no onion", ""),
            ("Plain Mexican rice", "Confirm no chicken stock or onion", ""),
            ("Chips with pico/guacamole, no onion", "Ask for onion-free guac and salsa", ""),
            ("Veggie fajita, no onion (above-ground veg)", "Skip onion; bell peppers are fine", ""),
        ],
        "watch_for": [
            "Refried beans and rice are often cooked with lard or chicken stock",
            "Onion and garlic are in most salsas, guacamole, and seasonings",
            "Many cheeses use animal rennet",
        ],
    },
    "thai": {
        "tip": "Thai food hides fish sauce and shrimp paste everywhere — always ask for a vegetarian/Jain version with soy instead.",
        "safe_bets": [
            ("Vegetable fried rice, no egg/onion", "Ask no egg, no onion, soy instead of fish sauce", ""),
            ("Tofu in coconut curry", "Confirm no fish sauce or shrimp paste, no garlic", ""),
            ("Pad see ew / pad thai, vegetarian no egg", "Ask no egg, no fish sauce", ""),
            ("Tom kha (vegetable, coconut soup)", "Ask veg broth, no fish sauce, no garlic", ""),
            ("Steamed jasmine rice", "Always safe", ""),
        ],
        "watch_for": [
            "Fish sauce, oyster sauce, and shrimp paste are in most Thai dishes by default",
            "Curry pastes contain garlic, shallots, and often shrimp",
            "Pad thai and fried rice usually contain egg",
        ],
    },
    "mediterranean": {
        "tip": "Mezze (small plates) are mostly plant-based — falafel, hummus, and salads are reliable once you confirm no garlic.",
        "safe_bets": [
            ("Hummus with pita, no garlic", "Ask for garlic-free hummus", ""),
            ("Falafel (garlic-free)", "Chickpea fritters; confirm no garlic in batter", ""),
            ("Tabbouleh / fattoush salad, no onion", "Ask to skip onion", ""),
            ("Baba ganoush, no garlic", "Smoked eggplant dip", ""),
            ("Rice or grain pilaf, no onion", "Confirm vegetable (not meat) stock", ""),
        ],
        "watch_for": [
            "Garlic is central to hummus, baba ganoush, and dressings",
            "Many dips and salads include raw onion",
            "Some pita and pastries use yogurt or egg wash",
        ],
    },
    "middle eastern": {
        "tip": "Like Mediterranean — lean on falafel, hummus, and rice dishes, and ask every item to be made garlic- and onion-free.",
        "safe_bets": [
            ("Falafel wrap/plate, no garlic sauce", "Ask for tahini, not garlic (toum) sauce", ""),
            ("Hummus and pita, no garlic", "Request garlic-free", ""),
            ("Mujadara without fried onion", "Lentils and rice; ask no onion topping", ""),
            ("Fattoush / tabbouleh, no onion", "Ask to skip onion", ""),
            ("Rice with above-ground vegetables", "Confirm no meat stock or onion", ""),
        ],
        "watch_for": [
            "Toum (garlic sauce) and garlic in general are everywhere",
            "Mujadara and pilafs are usually topped with fried onion",
            "Stuffed items can contain meat or onion",
        ],
    },
}

JAIN_DINING_GUIDE_DEFAULT: Dict[str, Any] = {
    "tip": "When the cuisine is unclear, build a meal from plain rice or grains, above-ground vegetables, and fruit, and confirm with the kitchen.",
    "safe_bets": [
        ("Plain steamed rice or grains", "A reliable base almost anywhere", ""),
        ("Simple green salad, no onion", "Ask for oil-and-lemon, no onion", ""),
        ("Cooked above-ground vegetables", "Ask no onion-garlic, no potato", ""),
        ("Fresh fruit", "Always safe", ""),
        ("Bread without egg or onion", "Confirm with the kitchen", ""),
    ],
    "watch_for": [
        "Onion and garlic are common in sauces, dressings, and stocks",
        "Stocks, broths, and gelatin are often animal-derived",
        "Cheese may be made with animal rennet",
    ],
}

CUISINE_LABELS = {
    "indian": "Indian",
    "south indian": "South Indian",
    "gujarati": "Gujarati",
    "italian": "Italian",
    "mexican": "Mexican",
    "thai": "Thai",
    "mediterranean": "Mediterranean",
    "middle eastern": "Middle Eastern",
}


def infer_place_cuisine(place: Dict) -> Optional[str]:
    """Guess a place's cuisine from its name/type tags when the user picked 'any'."""
    listing = normalize_key(place_listing_text(place))
    if not listing:
        return None
    for cuisine, identity_terms in CUISINE_IDENTITY_TERMS.items():
        if cuisine not in JAIN_DINING_GUIDE:
            continue
        if text_has_cuisine_match(listing, identity_terms):
            return cuisine
    for cuisine in JAIN_DINING_GUIDE:
        match_terms = CUISINE_MATCH_TERMS.get(cuisine, set())
        if len(matched_cuisine_terms(listing, match_terms)) >= 2:
            return cuisine
    return None


def build_ask_kitchen_script(profile: DietaryProfile) -> str:
    asks: List[str] = []
    if profile.avoid_root_vegetables:
        asks.append("no onion, garlic, ginger, potato, or other root vegetables")
    elif profile.avoid_onion_garlic:
        asks.append("no onion or garlic")
    if profile.avoid_eggs:
        asks.append("no egg")
    if profile.avoid_meat:
        asks.append("no meat, fish, or meat-based stock")
    if profile.avoid_animal_byproducts:
        asks.append("no gelatin, animal rennet, or animal enzymes")
    if profile.avoid_honey:
        asks.append("no honey")
    if profile.vegan:
        asks.append("no dairy")
    if profile.avoid_artificial_additives:
        asks.append("no artificial colors or flavors")
    if profile.allergies:
        asks.append("nothing with " + ", ".join(profile.allergies))
    if not asks:
        asks.append("only vegetarian ingredients")
    return "Tell the server: “I follow a Jain diet — please prepare my food with " + "; ".join(asks) + ". Thank you!”"


def build_dining_guidance(profile: DietaryProfile, cuisine_key: Optional[str]) -> DiningGuidance:
    key = normalize_key(cuisine_key or "")
    guide = JAIN_DINING_GUIDE.get(key, JAIN_DINING_GUIDE_DEFAULT)
    label = CUISINE_LABELS.get(key, "this kind of food" if not key or key == "any" else key.title())
    allergy_keys = [normalize_key(item) for item in profile.allergies if normalize_key(item)]

    safe_bets: List[Dict[str, str]] = []
    for name, note, tag in guide["safe_bets"]:
        if tag == "dairy" and profile.vegan:
            continue
        if tag == "egg" and profile.avoid_eggs:
            continue
        if tag == "root" and profile.avoid_root_vegetables:
            continue
        bet_key = normalize_key(name)
        if any(allergy in bet_key for allergy in allergy_keys):
            continue
        safe_bets.append({"name": name, "note": note})

    watch_for = list(guide["watch_for"])
    if profile.vegan and not any("dairy" in item.lower() for item in watch_for):
        watch_for.append("Ask about butter, ghee, cream, and cheese — dairy is common even in vegetarian dishes")
    if profile.allergies:
        watch_for.append("Allergy alert: confirm nothing contains " + ", ".join(profile.allergies))

    return DiningGuidance(
        cuisine_label=label,
        strategy=guide["tip"],
        safe_bets=safe_bets,
        watch_for=watch_for,
        ask_kitchen=build_ask_kitchen_script(profile),
    )


@app.get("/ping")
async def ping() -> Dict:
    return {"status": "active", "timestamp": datetime.now().isoformat()}


@app.post("/dining-guide")
async def dining_guide(finder_request: FoodFinderRequest) -> Dict:
    guidance = build_dining_guidance(finder_request.diet_profile, finder_request.cuisine)
    return {"guidance": guidance.model_dump(), "diet_profile": finder_request.diet_profile.model_dump()}


@app.get("/demo")
async def demo_scan() -> Dict:
    profile = default_profile()
    results = [
        classify_ingredient("Potatoes", profile),
        classify_ingredient("Sunflower Oil", profile),
        classify_ingredient("Sea Salt", profile),
        classify_ingredient("Natural Flavors", profile),
    ]
    grouped = sort_results(results)
    return build_scan_response(
        grouped,
        len(results),
        ocr_quality="demo",
        ocr_text="Ingredients: Potatoes, Sunflower Oil, Sea Salt, Natural Flavors",
        from_cache=False,
        profile=profile,
        message_override="Demo result personalized with the default Flexible Jain profile.",
        demo=True,
    )

@app.get("/v1/restaurants/geocode")
async def restaurant_geocode(q: str = Query("")) -> Dict[str, Any]:
    text = normalize_name(q)
    if len(text) < 3:
        return {"results": []}
    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(None, nominatim_lookup, text, 5)
    except Exception as exc:
        logger.info("Nominatim restaurant geocode failed: %s", exc)
        raise HTTPException(status_code=502, detail={"code": "GEOCODER_UNAVAILABLE", "message": "Location lookup is temporarily unavailable."})
    return {"provider": "nominatim", "results": results, "metadata": {"cachedByBackend": True}}


@app.post("/v1/restaurants/discover")
async def restaurant_discover(request: RestaurantDiscoverRequest) -> Dict[str, Any]:
    lat = request.location.latitude
    lng = request.location.longitude
    if lat < -90 or lat > 90 or lng < -180 or lng > 180:
        raise HTTPException(status_code=400, detail={"code": "INVALID_LOCATION", "message": "Restaurant location coordinates are invalid."})
    radius = miles_to_meters(request.radiusMiles)
    loop = asyncio.get_event_loop()
    provider_notes: List[str] = []
    requested_radius = radius
    cached = get_cached_restaurant_discovery(lat, lng, requested_radius)
    if cached:
        restaurants, radius = cached
        provider_notes.append("Reused recently discovered public map results for this location and radius.")
    else:
        try:
            restaurants = await loop.run_in_executor(None, overpass_restaurant_discovery, lat, lng, radius)
            expanded_radius = max(radius, 10000)
            if len(restaurants) < 5 and expanded_radius > radius:
                provider_notes.append("Expanded the public map search radius because few restaurants were found nearby.")
                restaurants = await loop.run_in_executor(None, overpass_restaurant_discovery, lat, lng, expanded_radius)
                radius = expanded_radius
            set_cached_restaurant_discovery(lat, lng, requested_radius, restaurants, radius)
        except Exception as exc:
            logger.info("Overpass restaurant discovery failed: %s", exc)
            raise HTTPException(status_code=502, detail={"code": "DISCOVERY_UNAVAILABLE", "message": "Nearby restaurant lookup is temporarily unavailable."})
    meal = normalize_name(request.meal or "anything").lower()
    if meal and meal not in {"anything", "restaurant", "restaurants"}:
        terms = [term for term in re.split(r"[^a-z0-9]+", meal) if len(term) > 2]
        def score(item: Dict[str, Any]) -> Tuple[int, float]:
            haystack = " ".join([item.get("name", ""), item.get("cuisine", ""), " ".join(item.get("dietaryTags", []))]).lower()
            match = sum(1 for term in terms if term in haystack)
            return (-match, item.get("distanceMiles") if item.get("distanceMiles") is not None else 10**9)
        restaurants = sorted(restaurants, key=score)
    return {
        "provider": "openstreetmap",
        "restaurants": restaurants[:40],
        "metadata": {
            "provider": "openstreetmap",
            "providerNotes": provider_notes,
            "searchedAt": datetime.now().isoformat(),
            "radiusMeters": radius,
            "evidenceWarning": "OpenStreetMap dietary tags are weak metadata only; ROOTS dietary ranking still requires menu evidence or user review.",
        },
    }

@app.post("/find-food")
async def find_food(request: Request, finder_request: FoodFinderRequest) -> Dict:
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many searches. Please wait one minute and try again.")

    kind = normalize_key(finder_request.kind)
    if kind not in {"restaurants", "stores"}:
        raise HTTPException(status_code=400, detail="Finder kind must be restaurants or stores.")
    finder_request.kind = kind

    lat, lng, location_error = resolve_location(finder_request)
    if location_error:
        raise HTTPException(status_code=400, detail=location_error)

    provider_notes: List[str] = []
    places: List[Dict] = []
    search_radius = FINDER_RADIUS_METERS
    if lat is not None and lng is not None:
        radii = [FINDER_RADIUS_METERS, *EXPANDED_FINDER_RADIUS_METERS]
        for radius in radii:
            radius_places: List[Dict] = []
            if GEOAPIFY_API_KEY:
                try:
                    radius_places = geoapify_places_search(finder_request, lat, lng, radius)
                except Exception as exc:
                    logger.info("Geoapify search failed: %s", exc)
                    if radius == FINDER_RADIUS_METERS:
                        provider_notes.append("Geoapify search failed.")
            if not radius_places:
                try:
                    radius_places = google_places_search(finder_request, lat, lng, radius)
                except Exception as exc:
                    logger.info("Google Places search failed: %s", exc)
                    if radius == FINDER_RADIUS_METERS:
                        provider_notes.append("Google Places search failed.")
            if not radius_places:
                if not GEOAPIFY_API_KEY and not GOOGLE_PLACES_API_KEY and radius == FINDER_RADIUS_METERS:
                    provider_notes.append("No place API key configured; using public map data with fewer menu links.")
                try:
                    radius_places = overpass_places_search(finder_request, lat, lng, min(radius, 30000))
                except Exception as exc:
                    logger.info("OpenStreetMap search failed: %s", exc)
                    if radius == FINDER_RADIUS_METERS:
                        provider_notes.append("Public map lookup failed.")
            if radius_places:
                places = radius_places
                search_radius = radius
                if radius > FINDER_RADIUS_METERS:
                    provider_notes.append(f"No restaurants were found within {round(FINDER_RADIUS_METERS / 1609.344, 1)} mi, so the search expanded to {round(radius / 1609.344, 1)} mi.")
                break

    requested_terms = requested_cuisine_terms(finder_request.cuisine)
    scored_places: List[Tuple[int, str, Dict]] = []
    for place in places[:30]:
        score, reason = score_place_cuisine(place, finder_request.cuisine)
        scored_places.append((score, reason, place))

    scored_places = sorted(
        scored_places,
        key=lambda item: (
            -item[0],
            item[2].get("distance") if item[2].get("distance") is not None else 10**9,
        ),
    )
    if requested_terms:
        verified_candidates = [item for item in scored_places if item[0] >= 50]
        fallback_candidates = [item for item in scored_places if item[0] < 50]
        candidate_places = verified_candidates[:6]
        if len(candidate_places) < 6:
            candidate_places.extend(fallback_candidates[: 6 - len(candidate_places)])
        cuisine_unverified_count = len(fallback_candidates)
    else:
        candidate_places = scored_places[:6]
        cuisine_unverified_count = 0

    matched_results: List[FinderPlaceResult] = []
    fallback_results: List[FinderPlaceResult] = []

    def fetch_candidate_menu(candidate: Tuple[int, str, Dict]) -> Tuple[int, str, Dict, Tuple[str, List[MenuItemResult], List[MenuItemResult], List[MenuItemResult], Optional[str], Optional[str]]]:
        initial_score, initial_reason, place = candidate
        if finder_request.doordash_url:
            return initial_score, initial_reason, place, classify_direct_doordash_url(
                finder_request.doordash_url,
                finder_request.diet_profile,
                finder_request.meal,
            )
        return initial_score, initial_reason, place, fetch_and_filter_menu(
            place.get("website"),
            finder_request.diet_profile,
            finder_request.meal,
            place.get("name", ""),
        )

    if candidate_places:
        with ThreadPoolExecutor(max_workers=min(6, len(candidate_places))) as executor:
            candidate_menu_results = list(executor.map(fetch_candidate_menu, candidate_places))
    else:
        candidate_menu_results = []

    for initial_score, initial_reason, place, menu_result in candidate_menu_results:
        menu_status, allowed, caution, blocked, note, menu_source_url = menu_result
        final_score, cuisine_match = score_place_cuisine(place, finder_request.cuisine, allowed, caution, blocked)
        if final_score < initial_score:
            final_score = initial_score
            cuisine_match = initial_reason
        distance = place.get("distance")
        place_cuisine = finder_request.cuisine if requested_terms else infer_place_cuisine(place)
        result = FinderPlaceResult(
            name=place.get("name", "Unknown place"),
            address=place.get("address") or None,
            website=place.get("website") or None,
            maps_url=place.get("maps_url") or None,
            provider=place.get("provider", "unknown"),
            source="real_menu_text" if menu_status == "found" else "real_place_no_menu",
            menu_status=menu_status,
            distance_meters=round(distance) if isinstance(distance, (int, float)) else None,
            rating=place.get("rating"),
            user_ratings_total=place.get("user_ratings_total"),
            menu_source_url=menu_source_url,
            cuisine_match=cuisine_match,
            cuisine_score=final_score,
            cuisine_confidence=cuisine_score_label(final_score, bool(requested_terms)),
            menu_items=allowed,
            caution_items=caution,
            blocked_items=blocked,
            guidance=build_dining_guidance(finder_request.diet_profile, place_cuisine),
            note=note,
        )
        if requested_terms and final_score < 50:
            cuisine_unverified_count += 1
            fallback_results.append(result)
        else:
            matched_results.append(result)

    def finder_sort_key(item: FinderPlaceResult) -> Tuple:
        return (
            -item.cuisine_score,
            0 if item.menu_status == "found" else 1,
            0 if item.menu_items else 1,
            len(item.blocked_items),
            item.distance_meters if item.distance_meters is not None else 10**9,
        )

    matched_results = sorted(
        matched_results,
        key=finder_sort_key,
    )
    fallback_results = sorted(
        fallback_results,
        key=lambda item: (
            0 if item.menu_status == "found" else 1,
            item.distance_meters if item.distance_meters is not None else 10**9,
        ),
    )
    results = matched_results[:8]
    # Even with no in-cuisine / in-city match, still surface the nearest real places
    # (the search already expanded outward), so the user always gets options.
    if not results:
        results = fallback_results[:8]
    nearest_place = None
    if not results:
        nearest_source = fallback_results[0] if fallback_results else None
        if nearest_source:
            nearest_place = {
                "name": nearest_source.name,
                "address": nearest_source.address,
                "distance_meters": nearest_source.distance_meters,
                "cuisine_confidence": nearest_source.cuisine_confidence,
                "cuisine_match": nearest_source.cuisine_match,
            }
    if requested_terms and not results:
        provider_notes.append(f"No verified {finder_request.cuisine} cuisine matches were found nearby.")
    elif cuisine_unverified_count:
        provider_notes.append(f"Kept verified {finder_request.cuisine} matches first and hid {cuisine_unverified_count} unverified cuisine results.")

    return {
        "summary": {
            "status": "ok" if results else "no_results",
            "message": "Real nearby places checked. Menu items only appear when found on a real website/menu source.",
            "provider_configured": bool(GEOAPIFY_API_KEY or GOOGLE_PLACES_API_KEY),
            "provider_name": "Geoapify" if GEOAPIFY_API_KEY else "Google Places" if GOOGLE_PLACES_API_KEY else "OpenStreetMap",
            "provider_notes": provider_notes,
            "searched_at": datetime.now().isoformat(),
            "latitude": lat,
            "longitude": lng,
            "radius_meters": search_radius,
            "nearest_place": nearest_place,
            "guidance": build_dining_guidance(finder_request.diet_profile, finder_request.cuisine).model_dump(),
        },
        "results": [result.model_dump() for result in results],
        "diet_profile": finder_request.diet_profile.model_dump(),
    }


def _geocode_lookup(text: str) -> List[Dict]:
    """Return up to 5 city/place suggestions with coordinates for autocomplete."""
    if GEOAPIFY_API_KEY:
        params = urllib.parse.urlencode({
            "text": text, "type": "city", "limit": "5", "format": "json", "apiKey": GEOAPIFY_API_KEY,
        })
        data = http_json(f"https://api.geoapify.com/v1/geocode/autocomplete?{params}")
        out: List[Dict] = []
        for item in (data.get("results") or [])[:5]:
            if item.get("lat") is not None and item.get("lon") is not None:
                out.append({
                    "name": item.get("formatted") or item.get("city") or text,
                    "latitude": float(item["lat"]),
                    "longitude": float(item["lon"]),
                })
        if out:
            return out

    return [{"name": item["label"], "latitude": item["latitude"], "longitude": item["longitude"]} for item in nominatim_lookup(text, 5)]


@app.get("/geocode")
async def geocode_suggest(q: str = Query("")) -> Dict:
    text = normalize_name(q)
    if len(text) < 3:
        return {"results": []}
    loop = asyncio.get_event_loop()
    try:
        suggestions = await loop.run_in_executor(None, _geocode_lookup, text)
    except Exception as exc:
        logger.info("Geocode suggest failed: %s", exc)
        suggestions = []
    return {"results": suggestions}


@app.post("/classify")
async def classify_label(
    request: Request,
    file: UploadFile = File(...),
    fresh: bool = Query(False),
    diet_profile: Optional[str] = Form(None),
) -> Dict:
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many scans. Please wait one minute and try again.")

    try:
        content = await file.read()
        if not content:
            raise ValueError("Empty upload")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image upload.")

    profile = parse_profile(diet_profile)
    current_hash = profile_cache_key(content, profile)
    cache = read_json_file(CACHE_FILE)
    if not fresh:
        cached = cache.get(current_hash)
        if isinstance(cached, dict) and cached.get("cache_schema_version") == CACHE_SCHEMA_VERSION:
            cached["from_cache"] = True
            return cached

    loop = asyncio.get_event_loop()
    try:
        extract_output = await loop.run_in_executor(None, ai_extract_ingredients, content)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("AI extraction failed")
        raise HTTPException(status_code=502, detail="Could not read the label right now.")

    if not extract_output.is_valid:
        response = build_scan_response(
            {"non_jain_ingredients": [], "uncertain_ingredients": [], "jain_ingredients": []},
            0,
            ocr_quality="ai",
            ocr_text=extract_output.ocr_text,
            from_cache=False,
            profile=profile,
            message_override=extract_output.note,
        )
        response["error"] = "Invalid Label"
        response["note"] = extract_output.note
        return response

    try:
        results = await loop.run_in_executor(None, ai_classify_ingredients, extract_output.ingredients, profile)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("AI classification failed")
        raise HTTPException(status_code=502, detail="Could not classify the ingredients right now.")

    for single in results:
        original = extract_output.originals.get(single.name.lower())
        if original:
            single.translation = original

    grouped = sort_results(results)
    response = build_scan_response(
        grouped,
        len(results),
        ocr_quality="ai",
        ocr_text=extract_output.ocr_text,
        from_cache=False,
        profile=profile,
    )
    response["source_language"] = extract_output.source_language
    cache[current_hash] = response
    write_json_file(CACHE_FILE, prune_cache(cache))
    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=bool(os.getenv("DEV_RELOAD")),
    )
