"""Lightweight unit tests for the pure logic in api.py (no server, no extra deps).

Run with:  python test_api.py
"""

import api


def check(label, condition):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label}")
    if not condition:
        check.failures += 1


check.failures = 0


def test_classifier_basics():
    flexible = api.default_profile()
    check("sunflower oil -> JAIN", api.classify_ingredient("Sunflower Oil", flexible).category == "JAIN")
    check("chicken -> NON_JAIN", api.classify_ingredient("Chicken", flexible).category == "NON_JAIN")
    check("natural flavors -> UNCERTAIN", api.classify_ingredient("Natural Flavors", flexible).category == "UNCERTAIN")


def test_profile_respects_settings():
    strict = api.DietaryProfile(avoid_root_vegetables=True, avoid_onion_garlic=True)
    check("onion blocked when avoided", api.classify_ingredient("Onion Powder", strict).category == "NON_JAIN")
    relaxed = api.DietaryProfile(avoid_root_vegetables=False, avoid_onion_garlic=False)
    check("onion allowed when not avoided", api.classify_ingredient("Onion Powder", relaxed).category == "JAIN")


def test_allergies():
    profile = api.DietaryProfile(allergies=["peanut"])
    check("peanut flagged as allergen", api.classify_ingredient("Peanut Oil", profile).category == "ALLERGEN")


def test_fuzzy_net():
    profile = api.DietaryProfile(avoid_onion_garlic=True)
    # 'garlik' is a plausible OCR misread of 'garlic' and should not pass as safe.
    check("fuzzy garlik flagged", api.classify_ingredient("Garlik", profile).category == "UNCERTAIN")


def test_parse_ingredients():
    text = "Ingredients: Sugar, Sunflower Oil, Salt, Natural Flavors"
    parsed = api.parse_ingredients(text)
    check("parses 4 ingredients", len(parsed) == 4)


def test_prune_cache():
    old = (api.datetime.now() - api.timedelta(days=api.CACHE_TTL_DAYS + 5)).isoformat()
    fresh = api.datetime.now().isoformat()
    cache = {
        "old": {"cache_schema_version": api.CACHE_SCHEMA_VERSION, "timestamp": old},
        "fresh": {"cache_schema_version": api.CACHE_SCHEMA_VERSION, "timestamp": fresh},
        "stale_schema": {"cache_schema_version": 0, "timestamp": fresh},
    }
    pruned = api.prune_cache(cache)
    check("prune drops expired", "old" not in pruned)
    check("prune keeps fresh", "fresh" in pruned)
    check("prune drops old schema", "stale_schema" not in pruned)


def test_dining_guidance():
    profile = api.DietaryProfile(avoid_onion_garlic=True, avoid_root_vegetables=True)
    indian = api.build_dining_guidance(profile, "indian")
    check("indian guidance has safe bets", len(indian.safe_bets) > 0)
    check("indian guidance has ask-kitchen script", "Jain" in indian.ask_kitchen)
    check("root-veg avoider sees onion/garlic/potato in script", "potato" in indian.ask_kitchen)

    thai = api.build_dining_guidance(profile, "thai")
    check("thai warns about fish sauce", any("fish sauce" in w.lower() for w in thai.watch_for))

    vegan = api.DietaryProfile(vegan=True)
    indian_vegan = api.build_dining_guidance(vegan, "indian")
    bet_names = " ".join(bet["name"].lower() for bet in indian_vegan.safe_bets)
    check("vegan drops paneer bet", "paneer" not in bet_names)

    unknown = api.build_dining_guidance(profile, "korean")
    check("unknown cuisine falls back to default bets", len(unknown.safe_bets) > 0)


def test_infer_place_cuisine():
    place = {"name": "Bombay Spice Indian Restaurant", "types": ["restaurant"], "address": ""}
    check("infers indian from name", api.infer_place_cuisine(place) == "indian")


def test_classifier_prompt_is_profile_aware():
    vegan = api.DietaryProfile(vegan=True)
    prompt = api.build_classifier_prompt(vegan)
    check("vegan prompt forbids dairy", "VEGAN" in prompt and "dairy" in prompt.lower())

    relaxed = api.DietaryProfile(avoid_root_vegetables=False, avoid_onion_garlic=False)
    relaxed_prompt = api.build_classifier_prompt(relaxed)
    check("relaxed prompt permits root veg", "permits root vegetables" in relaxed_prompt)

    allergic = api.DietaryProfile(allergies=["peanut"])
    check("allergy listed in prompt", "peanut" in api.build_classifier_prompt(allergic))


def test_allergy_override():
    profile = api.DietaryProfile(allergies=["sesame"])
    jain_guess = api.SingleResult(name="Sesame Oil", category="JAIN", reason="plant oil", source="ai")
    overridden = api.apply_allergy_override(jain_guess, profile)
    check("allergy override forces ALLERGEN", overridden.category == "ALLERGEN")

    safe = api.SingleResult(name="Sunflower Oil", category="JAIN", reason="plant oil", source="ai")
    check("non-allergen passes through", api.apply_allergy_override(safe, profile).category == "JAIN")


if __name__ == "__main__":
    test_classifier_basics()
    test_profile_respects_settings()
    test_allergies()
    test_fuzzy_net()
    test_parse_ingredients()
    test_prune_cache()
    test_dining_guidance()
    test_infer_place_cuisine()
    test_classifier_prompt_is_profile_aware()
    test_allergy_override()
    print()
    if check.failures:
        raise SystemExit(f"{check.failures} test(s) failed")
    print("All tests passed.")
