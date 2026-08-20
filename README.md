<div align="center">

<img src="www/icons/app-mark.svg" width="112" alt="Roots logo">

Roots

Can I eat this?

A privacy-first dietary assistant for scanning food, understanding ingredients, navigating restaurants, and making confident dietary decisions.

<br>







<br>

Roots is built around one question:
Can I eat this?

</div>

What is Roots?

Roots is a cross-platform dietary assistant designed to turn complicated food decisions into simple, understandable answers.

Instead of overwhelming users with ingredient data, Roots focuses on three things:

<table>
<tr>
<td align="center" width="33%"><b>Can I eat it?</b></td>
<td align="center" width="33%"><b>Why?</b></td>
<td align="center" width="33%"><b>What should I do next?</b></td>
</tr>
<tr>
<td align="center">A clear verdict</td>
<td align="center">Evidence and rule trace</td>
<td align="center">Verify, modify, avoid, or proceed</td>
</tr>
</table>

Roots is being built to support:

religious diets

food allergies

lifestyle diets

custom dietary restrictions

restaurant menus

recipes

travel

offline food decisions

evidence-based ingredient analysis

The current development focus includes a particularly deep Jain dietary system.

Core Philosophy

<div align="center">

Food Evidence
      ↓
Ingredient Parsing
      ↓
Dietary Knowledge
      ↓
User Profile
      ↓
Current Context / Observance
      ↓
Deterministic Rule Engine
      ↓
Verdict
      ↓
Evidence + Explanation + Next Step

</div>

Never pretend to know more than the evidence supports.

If something is unknown, Roots should say it is unknown. If an ingredient source is ambiguous, Roots should not silently turn that uncertainty into safety.

Features

<table>
<tr>
<td width="50%" valign="top">

📷 Label Scanner

Upload or photograph an ingredient label.

Roots can:

extract ingredient text

detect language

translate when necessary

preserve the original wording

parse subingredients

detect allergens

identify ambiguous ingredients

compare evidence against the active dietary profile

</td>
<td width="50%" valign="top">

🏷 Barcode Scanner

Scan packaged-food barcodes.

Roots can retrieve:

product name

brand

ingredient list

allergens

certifications

source metadata

product images

cached product data

</td>
</tr>

<tr>
<td width="50%" valign="top">

👤 Dietary Profiles

Combine multiple restrictions in one active profile:

religious diets

allergies

lifestyle diets

cross-contact settings

dislikes

custom avoid/caution rules

</td>
<td width="50%" valign="top">

🍽 Restaurants

Roots is being built to analyze:

nearby restaurants

menus

dishes

modifications

preparation uncertainty

cross-contact

evidence quality

</td>
</tr>

<tr>
<td width="50%" valign="top">

🍳 Recipes

Analyze and adapt recipes according to a user's dietary profile.

Planned and active architecture includes:

ingredient substitutions

profile-aware conversion

Jain conversion

observance-aware recipes

meal ideas

</td>
<td width="50%" valign="top">

💬 Ask Roots

A conversational food assistant that can understand:

the active profile

the current scan

ingredient evidence

restaurant context

Jain settings

active observances

</td>
</tr>
</table>

Verdict System

Roots deliberately avoids fake certainty scores such as:

92% safe

Instead, it uses clear outcomes:

Verdict

Meaning

✅ You Can Eat This

No known conflicts were found in the available evidence

🛠 You Can Eat This With Changes

Compatible after supported modifications

⚠️ Eat At Your Own Risk

Important information remains unresolved

❌ Do Not Eat

A confirmed conflict was found

❔ Not Enough Information

There is not enough evidence to decide

Internally, deterministic engine states may use values such as SAFE, CAUTION, or AVOID, while the user-facing interface stays simpler.

Jain Mode

Roots is not designed to treat Jainism as a single static ingredient blacklist.

<div align="center">

Jain Knowledge
      ↓
Base Jain Rules
      ↓
Tradition Settings
      ↓
Personal Practice
      ↓
Current Observance
      ↓
Effective Jain Profile
      ↓
Food Verdict

</div>

Jain Settings

The main dietary settings expose one simple selection:

Jain

Selecting Jain opens a dedicated settings experience.

Possible settings include:

<table>
<tr>
<td>Tradition</td>
<td>Mother tongue</td>
</tr>
<tr>
<td>Personal practices</td>
<td>Observance preferences</td>
</tr>
<tr>
<td>Festival appearance</td>
<td>Future fasting profiles</td>
</tr>
</table>

Roots intentionally avoids presenting Strict Jain, Lenient Jain, or Custom Jain as separate primary diets.

Jain Knowledge Engine

The Jain knowledge system is intended to understand more than ingredient names.

<details>
<summary><b>Explore Jain knowledge areas</b></summary>

<br>

ahimsa and food

root vegetables

animal-derived ingredients

microorganisms

fermentation

modern food additives

ingredient sourcing

Jain terminology

Paryushan

Das Lakshan

Samvatsari

Ayambil

fasting practices

tradition differences

packaged foods

restaurant scenarios

ambiguous modern ingredients

</details>

The long-term architecture is designed around source-grounded retrieval plus structured rules, rather than relying entirely on a generative model's memory.

Ingredient Intelligence

Roots can distinguish between what an ingredient is and what is actually known about its source.

Ingredient

Example interpretation

Gelatin

Animal-derived

Microbial rennet

Source identified; evaluated by profile rules

Animal rennet

Confirmed conflict for applicable profiles

Enzymes

Source may require verification

Natural flavors

Exact source may be unknown

Carmine

Insect-derived

Shellac

Animal/insect-derived source concern

Emulsifiers

Often source-dependent

Roots aims to distinguish:

Confirmed plant-derived
Confirmed microbial-derived
Confirmed animal-derived
Unknown source

Unknown should never automatically become safe.

Jain Calendar & Observances

Roots includes architecture for Jain calendar-aware behavior.

Current or planned observance support includes:

Paryushan

Das Lakshan

Samvatsari

Kshamavani

Mahavir Jayanti

Ayambil periods

Religious dates should come from maintained calendar data.

Mother tongue does not determine religious dates.

Paryushan Mode

For Jain users, Roots can temporarily adapt during Paryushan.

Possible behavior includes:

<table>
<tr>
<td>Observance-aware food rules</td>
<td>Paryushan recipes</td>
</tr>
<tr>
<td>Today card</td>
<td>Ask Roots suggestions</td>
</tr>
<tr>
<td>Temporary festival styling</td>
<td>Observance-aware scan decisions</td>
</tr>
</table>

Example:

Normally:
You Can Eat This

During Paryushan:
Do Not Eat During Paryushan

Normally compatible with your Jain profile,
but not with your current observance settings.

Restaurant Intelligence

Roots is designed to answer:

Where can I actually eat nearby?

Restaurant analysis may consider:

current location

searched destination

meal intent

active dietary profile

menu availability

menu evidence

supported modifications

preparation uncertainty

cross-contact

information freshness

Restaurant ratings, popularity, and cuisine type do not prove dietary compatibility.

Menu Analysis

Users may provide menus through:

images

screenshots

pasted text

supported PDFs

manual dish entry

Roots preserves:

original text

translated text

extraction warnings

source metadata

user edits

A normalized menu can look like:

Restaurant
└── Menu
    ├── Section
    │   ├── Dish
    │   │   ├── Description
    │   │   ├── Price
    │   │   ├── Options
    │   │   └── Evidence
    │   └── Dish
    └── Section

Dining Assistant

Roots can generate restaurant questions from unresolved evidence.

Example:

Could you please confirm whether this dish contains onion, garlic, egg, gelatin, or animal-derived ingredients?

Potential actions include:

Copy

Translate

Speak

Show to Server

Save response

Questions should come from real evidence gaps rather than invented risks.

Ask Roots

Ask Roots is the conversational food assistant inside the app.

Example questions:

Can I eat this?

Why was this ingredient flagged?

Is this Jain?

Can I eat this during Paryushan?

Make this recipe fit my profile.

What can I order here?

What is rennet?

What should I ask the restaurant?

Ask Roots can receive structured context from:

active dietary profile

current scan

deterministic verdict

ingredient evidence

Jain settings

observance context

restaurant evidence

AI & Deterministic Decision Boundary

This separation is one of the most important architectural principles in Roots.

<table>
<tr>
<th>AI Can</th>
<th>AI Cannot</th>
</tr>
<tr>
<td>

perform OCR

translate text

summarize evidence

explain results

help transform recipes

generate natural-language output

</td>
<td>

override deterministic verdicts

invent ingredients

invent certifications

silently remove uncertainty

guarantee allergy safety

invent restaurant preparation details

</td>
</tr>
</table>

<div align="center">

AI = Evidence Assistant

Deterministic Engine = Decision Authority

</div>

Evidence Model

Every important claim should have provenance.

Possible evidence sources include:

physical package labels

structured food databases

manufacturer documentation

certification organizations

restaurant menus

restaurant allergen documentation

restaurant staff confirmation

cached evidence

user/community evidence

Example:

Ingredient:
Natural Flavors

Source:
Physical label

Evidence:
Confirmed text

Origin:
Unknown

Verdict impact:
Needs confirmation

Reliability

Roots uses evidence categories instead of fake percentages.

Reliability

Meaning

Confirmed

Direct evidence is available

Strong Evidence

Multiple strong supporting sources

Limited Evidence

Partial supporting evidence

Needs Confirmation

Important information is unresolved

Unknown

Evidence is unavailable

The goal is to explain why Roots believes something, not manufacture false mathematical certainty.

Privacy First

Dietary information can reveal highly personal information.

A Roots profile may contain:

allergies

religious practices

medical restrictions

preferences

home/work locations

restaurant habits

Roots therefore follows a local-first architecture whenever practical.

Current local data areas include:

dietary profiles

saved scans and reports

cached products

restaurant search history

saved locations

local/offline knowledge

No analytics, advertising, tracking, or cloud profile sync should be added without an explicit product decision.

Security Architecture

Roots uses a backend trust boundary for provider-backed features.

Secrets such as:

GEMINI_API_KEY
GOOGLE_PLACES_API_KEY
GEOAPIFY_API_KEY

must never be distributed inside frontend bundles.

The backend architecture includes:

<table>
<tr>
<td>Restricted CORS</td>
<td>Backend-only credentials</td>
</tr>
<tr>
<td>Input validation</td>
<td>Pydantic schemas</td>
</tr>
<tr>
<td>Image validation</td>
<td>MIME/signature validation</td>
</tr>
<tr>
<td>Byte/pixel limits</td>
<td>Provider timeouts</td>
</tr>
<tr>
<td>Rate limiting</td>
<td>Sanitized errors</td>
</tr>
</table>

For more details, see SECURITY.md.

Offline Architecture

Roots is designed to become increasingly useful without an internet connection.

<div align="center">

Offline App Shell
      +
Local Dietary Engine
      +
Ingredient Knowledge
      +
Saved Profile
      +
Cached Products
      +
Native OCR
      +
Travel Packs
      ↓
Useful Offline Food Decisions

</div>

Current architecture already supports pieces such as the app shell, local dietary evaluation, profiles, and cached product information.

Additional work is still needed for full native offline OCR and larger downloadable offline data packs.

If Roots cannot verify something offline, it should return uncertainty rather than guess.

Architecture Overview

Roots
│
├── Frontend
│   ├── Scan UI
│   ├── Profiles
│   ├── Dietary Engine
│   ├── Jain Engine
│   ├── Restaurants
│   ├── Recipes
│   └── Ask Roots
│
├── Backend
│   ├── OCR Proxy
│   ├── Translation
│   ├── AI Explanations
│   ├── Provider Security
│   └── Rate Limiting
│
├── Local Intelligence
│   ├── Ingredient Knowledge
│   ├── Dietary Rules
│   ├── Jain Rules
│   ├── Offline Cache
│   └── Decision Engine
│
└── External Data
    ├── Gemini
    ├── Open Food Facts
    ├── Restaurant Providers
    └── Calendar / Evidence Sources

Project Structure

<details>
<summary><b>View repository structure</b></summary>

Roots/
│
├── api.py
├── roots_security.py
├── dev.py
├── requirements.txt
├── package.json
├── capacitor.config.json
├── SECURITY.md
├── ENGINEERING_SPEC.md
├── KNOWN_ISSUES.md
│
├── .github/
│   └── workflows/
│
├── tests/
│
└── www/
    ├── index.html
    ├── styles.css
    ├── design-system.css
    ├── home.css
    ├── script.js
    ├── runtime-config.js
    ├── connectivity.js
    ├── network-client.js
    ├── sw.js
    │
    ├── ocr.js
    ├── foodfacts.js
    ├── scan-pipeline.js
    ├── scan-processing.js
    ├── ingredient-parser.js
    ├── ingredient-knowledge.js
    ├── dietary-rules.js
    │
    ├── profile.js
    ├── profile-editor.js
    ├── profile-definitions.js
    │
    ├── jain/
    │   ├── jain.js
    │   ├── jain-profile.js
    │   ├── jain-rules.js
    │   ├── jain-knowledge.js
    │   ├── jain-calendar.js
    │   ├── jain-observances.js
    │   ├── jain-effective-profile.js
    │   ├── jain-reliability.js
    │   ├── jain-ingredients.js
    │   ├── jain-search.js
    │   ├── jain-theme.js
    │   └── jain-offline.js
    │
    ├── restaurant-*.js
    ├── assistant.js
    ├── recipe-meal-engine.js
    └── assets/

</details>

Tech Stack

Layer

Technology

Frontend

HTML, CSS, Vanilla JavaScript

Backend

Python, FastAPI

Mobile

Capacitor

AI / OCR

Gemini through protected backend routes

Product Data

Open Food Facts

Testing

Node.js Test Runner + Python tests

CI

GitHub Actions

Storage

localStorage / IndexedDB architecture

Getting Started

Prerequisites

Install:

Python 3.12+

Node.js 22+

npm

Clone

git clone https://github.com/aayushjain1230/Roots.git
cd Roots

Install JavaScript dependencies

npm ci

Create a Python environment

python -m venv .venv

Windows

.venv\Scripts\activate

macOS / Linux

source .venv/bin/activate

Install Python dependencies:

pip install -r requirements.txt

Environment Configuration

Copy:

.env.example

to:

.env

Example:

GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash

ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,https://foodroots.netlify.app

HOST=127.0.0.1
PORT=8000

Never commit .env.

Run Locally

The recommended development command starts both the frontend and backend:

npm run dev

Then open:

http://127.0.0.1:5500

The local API runs at:

http://127.0.0.1:8000

Run manually

Backend:

uvicorn api:app --host 127.0.0.1 --port 8000 --reload

Frontend:

npm run serve

Testing

Run the complete JavaScript suite:

npm run test:js

Backend checks:

python test_api.py
python test_security.py
python -m py_compile api.py roots_security.py

<details>
<summary><b>View individual JavaScript test commands</b></summary>

npm run test:profile
npm run test:engine
npm run test:integration
npm run test:home
npm run test:review
npm run test:processing
npm run test:report
npm run test:production
npm run test:restaurants
npm run test:menus
npm run test:restaurant-evidence
npm run test:restaurant-ranking
npm run test:restaurant-meal
npm run test:restaurant-memory
npm run test:restaurant-questions
npm run test:dining-assistant
npm run test:travel
npm run test:personalization
npm run test:performance
npm run test:design
npm run test:ux
npm run test:rc
npm run test:phase6b

</details>

Security Checks

Before release:

npm audit
npm audit --omit=dev

A Python dependency audit tool such as pip-audit is also recommended.

Release security checks should include:

secret scanning

Git-history secret scanning

dependency review

license review

SBOM generation

browser console review

native permission review

physical-device testing

Mobile Development

Synchronize Capacitor:

npm run sync

Open iOS:

npm run open:ios

Open Android:

npm run open:android

Run iOS:

npm run run:ios

Run Android:

npm run run:android

Native iOS and Android project generation and full physical-device validation are still release prerequisites.

Production Configuration

Production mobile builds must not rely on:

127.0.0.1:8000

A recommended environment layout is:

Development
Frontend → http://127.0.0.1:5500
Backend  → http://127.0.0.1:8000

Staging
Frontend → https://staging.example.com
Backend  → https://staging-api.example.com

Production
Frontend → https://example.com
Backend  → https://api.example.com

The staging and production domains above are examples.

Production must correctly configure:

API_BASE_URL

CSP connect-src

backend CORS origins

HTTPS

provider secrets

production rate limiting

Development Principles

<table>
<tr>
<td width="50%" valign="top">

01. Never Guess Safety

Unknown stays unknown.

</td>
<td width="50%" valign="top">

02. One Source of Truth

Dietary decisions should come from one canonical deterministic engine.

</td>
</tr>

<tr>
<td width="50%" valign="top">

03. AI Does Not Own Verdicts

AI assists with evidence and language.

</td>
<td width="50%" valign="top">

04. Preserve Original Evidence

Translations should never replace the source label.

</td>
</tr>

<tr>
<td width="50%" valign="top">

05. Fail Safely

Uncertainty becomes verification, not false safety.

</td>
<td width="50%" valign="top">

06. Explain Decisions

Verdicts should trace back to evidence and rules.

</td>
</tr>
</table>

Roadmap

Scanner

Barcode decoding

Product lookup

Image upload

Camera capture architecture

Cloud OCR architecture

Ingredient parsing

Dietary evaluation

Native offline OCR

Downloadable offline product packs

Profiles

Universal dietary profile architecture

Allergies

Religious diets

Lifestyle diets

Cross-contact settings

Custom rules

Unified Jain selection

Jain

Jain profile architecture

Jain rules architecture

Jain knowledge modules

Jain calendar architecture

Jain observance architecture

Jain ingredient architecture

Expanded Jain knowledge corpus

Deep source-grounded retrieval

Expanded modern ingredient evidence

Full Paryushan experience

Fasting profiles

Restaurants

Restaurant provider architecture

Location flow

Menu import

Menu parsing

Evidence engine

Ranking architecture

Dining assistant architecture

Production restaurant provider

Expanded official menu ingestion

Restaurant verification workflows

Offline

App-shell caching

Local dietary engine

Cached product support

Local profiles

Offline architecture

Native OCR

Travel packs

Restaurant packs

Larger local product database

Project Status

<div align="center">

🚧 Active Development

Roots is currently under active development and should not yet be treated as a finished medical, allergy, religious-certification, or food-safety authority.

Current priorities:

scan reliability · offline OCR · Jain knowledge · restaurant intelligence · evidence quality · mobile testing · security hardening

</div>

Disclaimer

Roots is an informational dietary-assistance tool.

It does not replace:

medical advice

emergency allergy guidance

current product labels

manufacturer confirmation

restaurant staff confirmation

religious authorities

official certification organizations

Food formulations, certifications, and restaurant preparation methods can change.

For severe allergies or medically significant restrictions, users should rely on current product labeling and appropriate professional guidance.

Contributing

Before contributing:

Read ENGINEERING_SPEC.md

Read SECURITY.md

Review the relevant tests

Preserve deterministic dietary decision boundaries

Do not introduce frontend secrets

Do not weaken uncertainty handling

Add regression tests for behavioral changes

Create a branch:

git checkout -b feature/my-feature

Before submitting:

npm run test:js
python test_api.py
python test_security.py

Security Reporting

If you discover a security vulnerability:

do not publicly expose credentials

do not include sensitive user data in an issue

do not commit proof-of-concept secrets

rotate exposed credentials immediately

See SECURITY.md.

<div align="center">

<br>

<img src="www/icons/app-mark.svg" width="72" alt="Roots logo">

Roots

Can I eat this?

Understand the food. See the evidence. Make the decision.

Built around trust · privacy · transparency · personalization · explainability

</div>
